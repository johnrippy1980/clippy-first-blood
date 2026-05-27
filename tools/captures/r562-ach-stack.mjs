import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
});
await page.evaluate(() => window.__game._startStage(1));
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(120);
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'play') break;
    if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') await page.keyboard.press('KeyX');
}
// Push 5 achievements in one frame
await page.evaluate(async () => {
    const a = (await import('/src/achievements.js')).achievements;
    a.banner.push({ id: 'first_blood', age: 0 });
    a.banner.push({ id: 'combo_5', age: 0 });
    a.banner.push({ id: 'silent_strike', age: 0 });
    a.banner.push({ id: 'no_dmg_stage', age: 0 });
    a.banner.push({ id: 'grenadier', age: 0 });
});
await page.waitForTimeout(300);
const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile('/tmp/r562_stack.png', Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
const banner = await page.evaluate(async () => {
    const a = (await import('/src/achievements.js')).achievements;
    return a.banner.map(b => b.id);
});
console.log('Banner queue:', banner);
console.log('errors:', errors.length);
errors.forEach(e => console.log('  ', e));
await browser.close();
