// R517: verify CLOUD parallax with new server-rack layer
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r517';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => { window.__game._konamiUnlocked = true; window.__game.unlockedStage = 24; });
await page.evaluate(() => window.__game._startStage(13));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.waitForTimeout(800);
const u1 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u1) await fs.writeFile(`${OUT}/01_cloud_start.png`, Buffer.from(u1.replace(/^data:image\/png;base64,/, ''), 'base64'));

// Walk right to see parallax
for (let i = 0; i < 30; i++) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(50);
}
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(300);
const u2 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u2) await fs.writeFile(`${OUT}/02_cloud_scrolled.png`, Buffer.from(u2.replace(/^data:image\/png;base64,/, ''), 'base64'));

console.log('done');
await browser.close();
