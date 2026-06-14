// Headless verification that the Electron desktop wrapper boots the real game.
//
// Reuses electron/main.js's in-process static server, loads index.html in an
// offscreen BrowserWindow (no display needed), and asserts:
//   (1) the game object (window.__game) initialized and reached a real scene;
//   (2) localStorage persists a write across a reload (saves/achievements path);
//   (3) the leaderboard's fetch('/api/runs') fails SOFT — 404 from our server,
//       caught by leaderboard.js, returning a soft-failure object, not a throw.
//
// Run: npx electron tools/captures/electron-boot-check.mjs
//      (exits 0 on PASS, 1 on FAIL — usable in the captures suite manner.)

import { app, BrowserWindow } from 'electron';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..'); // repo root

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

function startServer() {
    return new Promise((resolve) => {
        const server = createServer(async (req, res) => {
            try {
                let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
                if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
                const resolved = normalize(join(ROOT, urlPath));
                if (resolved !== ROOT && !resolved.startsWith(ROOT + sep)) {
                    res.writeHead(403).end('Forbidden'); return;
                }
                let target = resolved;
                const st = await stat(target).catch(() => null);
                if (st && st.isDirectory()) target = join(target, 'index.html');
                const body = await readFile(target);
                res.writeHead(200, { 'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream' });
                res.end(body);
            } catch {
                res.writeHead(404).end('Not found');
            }
        });
        server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
    });
}

const result = { errors: [] };

app.whenReady().then(async () => {
    const base = await startServer();
    const win = new BrowserWindow({
        show: false,
        webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    win.webContents.on('console-message', (_e, level, msg) => {
        // Electron's dev-mode "Insecure Content-Security-Policy" notice is benign
        // and (per its own text) disappears once the app is packaged — not a real
        // game error, so don't let it fail the boot gate.
        if (level >= 2 && !/Electron Security Warning/.test(msg)) {
            result.errors.push('[console] ' + msg);
        }
    });
    win.webContents.on('render-process-gone', (_e, d) => result.errors.push('[gone] ' + JSON.stringify(d)));

    try {
        await win.loadURL(base + '/index.html');
        // Give main.js a beat to construct the game and load the first assets.
        await new Promise((r) => setTimeout(r, 4000));

        // (1) game booted?
        const boot = await win.webContents.executeJavaScript(`(() => {
            const g = window.__game;
            return { hasGame: !!g, scene: g && g.scene, hasCanvas: !!document.getElementById('screen') };
        })()`);
        result.boot = boot;

        // (2) localStorage round-trips across a reload.
        await win.webContents.executeJavaScript(`localStorage.setItem('__cfb_desktop_probe','42'); true`);
        await win.webContents.reload();
        await new Promise((r) => setTimeout(r, 2500));
        result.lsPersist = await win.webContents.executeJavaScript(
            `localStorage.getItem('__cfb_desktop_probe') === '42'`);
        await win.webContents.executeJavaScript(`localStorage.removeItem('__cfb_desktop_probe'); true`);

        // (2b) controller path runs in this renderer: the Gamepad API exists, and
        // _pollGamepad() actually reads a (synthetic) pad and flips action state.
        result.controller = await win.webContents.executeJavaScript(`(async () => {
            const hasApi = typeof navigator.getGamepads === 'function';
            const { input } = await import('/src/input.js');
            const realGet = navigator.getGamepads.bind(navigator);
            // A fake pad: right d-pad (button 15) + A (button 0) pressed,
            // right-stick pushed to +X so aim activates.
            const btn = (p) => ({ pressed: !!p, value: p ? 1 : 0 });
            const fake = {
                index: 0, connected: true,
                axes: [0, 0, 0.9, 0.0],
                buttons: Array.from({ length: 16 }, (_, i) => btn(i === 0 || i === 15)),
            };
            navigator.getGamepads = () => [fake];
            input.gamepadIndex = 0;
            input.update();
            const read = {
                hasApi,
                rightHeld: input.isHeld('right'),
                jumpHeld: input.isHeld('jump'),
                aimActive: input.aimActive === true,
            };
            navigator.getGamepads = realGet;
            input.gamepadIndex = null;
            return read;
        })()`);

        // (3) leaderboard fetch fails soft (no throw; soft-failure object back).
        const lb = await win.webContents.executeJavaScript(`(async () => {
            try {
                const { leaderboard } = await import('/src/leaderboard.js');
                const res = await leaderboard.fetch('arcade', 5);
                return { threw: false, soft: res && res.status === 'error', res };
            } catch (e) { return { threw: true, msg: String(e && e.message) }; }
        })()`);
        result.leaderboard = lb;
    } catch (e) {
        result.errors.push('[harness] ' + String(e && e.message));
    }

    console.log(JSON.stringify(result, null, 2));

    const ok = result.errors.length === 0
        && result.boot && result.boot.hasGame === true && !!result.boot.scene
        && result.boot.hasCanvas === true
        && result.lsPersist === true
        && result.controller && result.controller.hasApi === true
        && result.controller.rightHeld === true && result.controller.jumpHeld === true
        && result.controller.aimActive === true
        && result.leaderboard && result.leaderboard.threw === false
        && result.leaderboard.soft === true;
    console.log(ok ? 'ELECTRON BOOT OK' : 'ELECTRON BOOT FAIL');
    app.exit(ok ? 0 : 1);
});
