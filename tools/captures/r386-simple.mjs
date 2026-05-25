// R386: simplest possible stage 20 boot — just navigate the menus
// like a player would. No _startStage hack.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/?dev=1';
const OUT = '/tmp/r386s';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
const logs = [];
page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') errs.push(t);
    if (t.startsWith('[_tickStageIntro]')) logs.push(t);
});
page.on('pageerror', e => errs.push(`PAGE: ${e.message}`));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(300);

// Snap initial title
await page.screenshot({ path: `${OUT}/01_title.png` });

// Patch BEFORE any input — capture every scene change from boot.
// Wait longer (2.5s) before calling _startStage so any boot-time
// input residue from page.click clears (release happens on mouseup).
await page.waitForTimeout(500);
await page.evaluate(() => {
    const g = window.__game;
    window.__sceneLog = [];
    let _scene = g.scene;
    Object.defineProperty(g, 'scene', {
        get() { return _scene; },
        set(v) { window.__sceneLog.push({ from: _scene, to: v }); _scene = v; },
        configurable: true,
    });
    // Also clear input state in case mousedown is pinned
    if (typeof input !== 'undefined' && input.releaseAll) input.releaseAll();
    g._startStage(20);
});
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/03_intro.png` });

// Skip ONE intro screen (story card) — only one X press, plenty of time
await page.keyboard.press('KeyX');
await page.waitForTimeout(2200);   // full fade
await page.screenshot({ path: `${OUT}/04_post_intro.png` });

// Try one more X in case there's a card after
await page.keyboard.press('KeyX');
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/05_settled.png` });

const diag = await page.evaluate(() => {
    const g = window.__game;
    return {
        scene: g.scene,
        beatActive: !!g._beatEmUp,
        beatMode: g._beatMode,
        levelExists: !!g.level,
        beatBgLoaded: !!g._beatEmUp?.bgImg,
    };
});
console.log('s20:', JSON.stringify(diag));
const sceneLog = await page.evaluate(() => window.__sceneLog || []);
console.log('scenes:', JSON.stringify(sceneLog));
console.log('logs:', logs.slice(0, 8).join(' | '));
console.log(`Errors (${errs.length}):`);
errs.slice(0, 5).forEach(e => console.log('  ', e.substring(0, 200)));
await browser.close();
