import { chromium } from 'playwright';
import fs from 'node:fs/promises';
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
await page.evaluate(() => { window.__game.scene = 'stageSelect'; });
await page.waitForTimeout(200);
// Index for post-game tiles
for (const idx of [16, 18, 20]) {
    await page.evaluate((i) => { window.__game.stageSelectIndex = i; }, idx);
    await page.waitForTimeout(200);
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`/tmp/r554_ss/idx_${idx}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
await browser.close();
