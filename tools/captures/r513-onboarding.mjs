// R513: snap the new-player flow start to finish
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r513';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
// Clear localStorage so it's truly "first time"
await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
        try { localStorage.clear(); } catch(e) {}
    });
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// 1. Title screen
await snap('01_title');

// 2. Press X — should land on main menu
await page.click('#screen');
await page.keyboard.press('KeyX');
await page.waitForTimeout(500);
await snap('02_main_menu');

// 3. START GAME pressed
await page.keyboard.press('KeyX');
await page.waitForTimeout(800);
let scene = await page.evaluate(() => window.__game?.scene);
console.log('after START GAME:', scene);
await snap('03_after_start');

// 4. Click through any story screens
for (let i = 0; i < 15; i++) {
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(500);
    scene = await page.evaluate(() => window.__game?.scene);
    console.log(`step ${i}: scene =`, scene);
    await snap(`04_step_${i}`);
    if (scene === 'play') break;
}

// 5. Snap first few seconds of play to see hint banner
await page.waitForTimeout(1500);
await snap('05_play_1.5sec');
await page.waitForTimeout(2000);
await snap('06_play_3.5sec');

// 6. Try the new SKIP-ALL shortcut on a fresh story scene
await page.evaluate(() => {
    window.__game._restartRun?.();
    window.__game.scene = 'story';
    window.__game.storyPage = 0;
    window.__game.storyTimer = 200;
});
await page.waitForTimeout(400);
await snap('07_story_with_skip_hint');
await page.keyboard.press('KeyP');
await page.waitForTimeout(800);
const sceneAfterSkip = await page.evaluate(() => window.__game?.scene);
console.log('after P:', sceneAfterSkip);
await snap('08_after_skip');

console.log('done');
await browser.close();
