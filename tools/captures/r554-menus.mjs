import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r554_menus';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
// 1: title
await snap('01_title');
await page.click('#screen');
await page.keyboard.press('KeyX');
await page.waitForTimeout(500);
// 2: main menu (after gameCleared so all options visible)
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
    window.__game.scene = 'mainMenu';
});
await page.waitForTimeout(300);
await snap('02_mainmenu_full');

// 3: stage select
await page.evaluate(() => { window.__game.scene = 'stageSelect'; });
await page.waitForTimeout(300);
await snap('03_stage_select');

// 4: achievements
await page.evaluate(() => { window.__game.scene = 'achievements'; });
await page.waitForTimeout(300);
await snap('04_achievements');

// 5: soundtrack gallery
await page.evaluate(() => { window.__game.scene = 'soundtrack'; });
await page.waitForTimeout(300);
await snap('05_soundtrack');

// 6: options
await page.evaluate(() => { window.__game.scene = 'options'; });
await page.waitForTimeout(300);
await snap('06_options');

await browser.close();
