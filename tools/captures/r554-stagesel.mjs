import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r554_ss';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(async () => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
    const m = await import('/src/achievements.js');
    m.achievements.unlocked.add('clear_game');
});
await page.evaluate(() => { window.__game.scene = 'stageSelect'; window.__game.stageSelectIndex = 0; });
await page.waitForTimeout(300);
const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile(`${OUT}/01_top.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
// Scroll down to see all stages
for (let p = 1; p <= 3; p++) {
    await page.evaluate((i) => { window.__game.stageSelectIndex = i; }, p * 4);
    await page.waitForTimeout(200);
    const u2 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u2) await fs.writeFile(`${OUT}/0${p+1}_scrolled.png`, Buffer.from(u2.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
await browser.close();
