// Desktop wrapper for Clippy: First Blood.
//
// The game is a no-build static site that loads ES modules and assets by
// RELATIVE path (src/main.js, assets/sprites/...). Opening those over file://
// trips Chromium's module-CORS rules, so instead we serve the repo from a tiny
// in-process HTTP server bound to 127.0.0.1 on an OS-assigned port — byte-for-
// byte the same runtime the dev server (`python3 -m http.server`) gives, which
// is what every Playwright probe already validates against.
//
// The leaderboard's only network call is fetch('/api/runs'); there's no such
// route here, so it 404s and the client's soft-fail path (leaderboard.js) keeps
// the game running offline. localStorage (saves, achievements, ghosts) persists
// in Electron's per-app profile.

import { app, BrowserWindow, Menu, shell } from 'electron';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..'); // repo root (index.html lives here)

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
};

function startServer() {
    return new Promise((resolve) => {
        const server = createServer(async (req, res) => {
            try {
                let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
                if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

                // Resolve against ROOT and refuse anything that escapes it.
                const resolved = normalize(join(ROOT, urlPath));
                if (resolved !== ROOT && !resolved.startsWith(ROOT + sep)) {
                    res.writeHead(403).end('Forbidden');
                    return;
                }

                let target = resolved;
                const st = await stat(target).catch(() => null);
                if (st && st.isDirectory()) target = join(target, 'index.html');

                const body = await readFile(target);
                res.writeHead(200, {
                    'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
                    'Cache-Control': 'no-cache',
                });
                res.end(body);
            } catch {
                // Includes the leaderboard's /api/runs — there's no API here, so a
                // clean 404 lets leaderboard.js take its soft-fail branch.
                res.writeHead(404).end('Not found');
            }
        });
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve(`http://127.0.0.1:${port}`);
        });
    });
}

async function createWindow() {
    const base = await startServer();

    const win = new BrowserWindow({
        width: 1024,
        height: 896, // 256x224 game scales cleanly to a 4:3.5-ish window
        backgroundColor: '#0a0612',
        title: 'Clippy: First Blood',
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false, // keep the game loop running if unfocused
        },
    });

    // Open real external links (if any) in the user's browser, never in-app.
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) shell.openExternal(url);
        return { action: 'deny' };
    });

    win.loadURL(base + '/index.html');
    return win;
}

// A minimal menu: Fullscreen toggle + Quit. The in-game UI handles everything
// else, and a bare menu keeps platform shortcuts (Cmd+Q, Cmd+Ctrl+F) working.
function buildMenu() {
    const isMac = process.platform === 'darwin';
    const template = [
        ...(isMac ? [{ role: 'appMenu' }] : []),
        {
            label: 'View',
            submenu: [
                { role: 'togglefullscreen' },
                { type: 'separator' },
                { role: 'reload' },
                { role: 'toggleDevTools' },
            ],
        },
        { role: 'windowMenu' },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
