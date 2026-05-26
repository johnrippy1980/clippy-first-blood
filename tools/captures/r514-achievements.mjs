// R514: snap achievements gallery
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r514';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.keyboard.press('KeyX');
await page.waitForTimeout(500);

// Navigate to ACHIEVEMENTS in main menu
const items = await page.evaluate(() => window.__game?._mainMenuItems?.()?.map(i => i.label));
console.log('menu items:', items);
const idx = items?.findIndex(l => l === 'ACHIEVEMENTS') ?? -1;
console.log('achievement idx:', idx);
for (let i = 0; i < idx; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);
}
await page.keyboard.press('KeyX');
await page.waitForTimeout(600);

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
await snap('01_initial');

// Scroll down a few times
for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(80);
    }
    await snap(`02_scroll_${i}`);
}

// Try unlocking a few + revisit
await page.keyboard.press('KeyP');
await page.waitForTimeout(300);
await page.evaluate(async () => {
    const m = await import('/src/achievements.js');
    m.achievements.unlocked.add('first_blood');
    m.achievements.unlocked.add('boss_rush_mode');
    m.achievements.unlocked.add('no_damage_stage');
    m.achievements.stats.totalKills = 142;
});
await page.waitForTimeout(300);
await page.evaluate(() => { window.__game.scene = 'achievements'; window.__game.achievementsIndex = 0; });
await page.waitForTimeout(400);
await snap('03_with_unlocks');

// Set stats to show progress on combo_30
await page.evaluate(async () => {
    const m = await import('/src/achievements.js');
    m.achievements.stats.maxCombo = 18;
    m.achievements.stats.grenadeKills = 3;
    m.achievements.stats.tagsFound = 4;
    window.__game.achievementsIndex = 10; // combo_30
});
await page.waitForTimeout(300);
await snap('04_progress_combo30');
await page.evaluate(() => { window.__game.achievementsIndex = 19; });
await page.waitForTimeout(200);
await snap('05_progress_grenadier');
await page.evaluate(() => { window.__game.achievementsIndex = 20; });
await page.waitForTimeout(200);
await snap('06_progress_fullset');

console.log('done');
await browser.close();
