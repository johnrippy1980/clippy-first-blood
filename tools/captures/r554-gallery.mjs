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
await page.evaluate(() => { window.__game.scene = 'gallery'; window.__game.galleryIndex = 0; });
await page.waitForTimeout(300);
const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile('/tmp/r554_menus/07_gallery.png', Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
await browser.close();
