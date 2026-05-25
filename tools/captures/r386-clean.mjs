// R386: clean per-stage capture — fresh page load between stages so
// no state leaks from a previous _startStage call.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r386c';
await fs.mkdir(OUT, { recursive: true });

async function captureStage(stageNum, label) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(`PAGE: ${e.message}`));
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('#screen');
    await page.waitForTimeout(200);
    await page.evaluate((n) => {
        // Patch scene setter to log changes
        const g = window.__game;
        window.__sceneLog = [];
        let _scene = g.scene;
        Object.defineProperty(g, 'scene', {
            get() { return _scene; },
            set(v) { window.__sceneLog.push({ from: _scene, to: v, at: g.bootTimer, story: g.storyTimer }); _scene = v; },
            configurable: true,
        });
        g._startStage(n);
    }, stageNum);
    await page.waitForTimeout(800);
    // Skip intros patiently
    for (let i = 0; i < 40; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'beatPlay' || s === 'fpsPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(140);
    }
    await page.waitForTimeout(1200);
    const sceneLog = await page.evaluate(() => window.__sceneLog || []);
    console.log(`  ${label} scene-changes:`, JSON.stringify(sceneLog.slice(0, 15)));
    // Trace scene transitions over time
    const trace = await page.evaluate(() => {
        return {
            sceneNow: window.__game?.scene,
            transition: window.__game?.transition,
            beatPending: window.__game?._beatPendingPlay,
            fpsPending: window.__game?._fpsPendingPlay,
            beatActive: !!window.__game?._beatEmUp,
            beatMode: window.__game?._beatMode,
            levelExists: !!window.__game?.level,
        };
    });
    console.log(`  ${label} state:`, JSON.stringify(trace));
    // Snap the actual canvas pixels via canvas.toDataURL so we capture
    // what the GAME drew, independent of HTML/CSS layout.
    async function snapCanvas(name) {
        const dataUrl = await page.evaluate(() => {
            const c = document.getElementById('screen');
            return c?.toDataURL('image/png');
        });
        if (!dataUrl) return null;
        const buf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
        await fs.writeFile(`${OUT}/${name}.png`, buf);
    }
    await snapCanvas(`${label}_a`);
    await page.waitForTimeout(1200);
    await snapCanvas(`${label}_b`);

    const diag = await page.evaluate(() => {
        const g = window.__game;
        const beat = g._beatEmUp;
        return {
            scene: g.scene,
            stage: g.currentStage,
            beatActive: !!beat,
            beatBgKey: beat?.data?.bgKey,
            beatBgLoaded: !!beat?.bgImg,
            ambientCount: g._ambientProps?.props?.length || 0,
            beatEnemies: beat?.enemies?.length || 0,
        };
    });
    console.log(`${label}:`, JSON.stringify(diag));
    if (errs.length) {
        console.log(`  errors (${errs.length}):`);
        errs.slice(0, 3).forEach(e => console.log('    ', e.substring(0, 200)));
    }
    await browser.close();
}

await captureStage(20, 's20');
await captureStage(21, 's21');
await captureStage(22, 's22');
