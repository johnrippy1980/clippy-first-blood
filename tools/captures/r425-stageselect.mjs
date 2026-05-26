// R425: verify stage 16 FLOOR 11 + stage 23 BLOCK 11 appear correctly
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r425';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);
// Force konami unlock so all stages appear
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 22;
    window.__game.scene = 'stageSelect';
    window.__game.stageSelectIndex = 0;
    window.__game.stageSelectScroll = 0;
});
await page.waitForTimeout(500);
const dataUrl1 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (dataUrl1) await fs.writeFile(`${OUT}/01_top.png`, Buffer.from(dataUrl1.replace(/^data:image\/png;base64,/, ''), 'base64'));
// Scroll down to see post-game tiles (16 = FLOOR 11)
await page.evaluate(() => { window.__game.stageSelectScroll = 1; });
await page.waitForTimeout(300);
const dataUrl2 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (dataUrl2) await fs.writeFile(`${OUT}/02_mid.png`, Buffer.from(dataUrl2.replace(/^data:image\/png;base64,/, ''), 'base64'));
await page.evaluate(() => { window.__game.stageSelectScroll = 2; });
await page.waitForTimeout(300);
const dataUrl3 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (dataUrl3) await fs.writeFile(`${OUT}/03_bot.png`, Buffer.from(dataUrl3.replace(/^data:image\/png;base64,/, ''), 'base64'));
console.log('done');
await browser.close();
