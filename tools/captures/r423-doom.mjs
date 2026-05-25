// R423: verify Doom raycaster engine renders stage 23
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r423';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);
await page.evaluate(() => window.__game._startStage(23));
await page.waitForTimeout(2500);
// Skip past intro/ready
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'doomPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.waitForTimeout(800);
const scene = await page.evaluate(() => window.__game?.scene);
console.log('scene after intro:', scene);
const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (dataUrl) await fs.writeFile(`${OUT}/spawn.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
// Walk forward a bit (UP arrow)
for (let i = 0; i < 30; i++) {
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(33);
    await page.keyboard.up('ArrowUp');
}
const dataUrl2 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (dataUrl2) await fs.writeFile(`${OUT}/walked.png`, Buffer.from(dataUrl2.replace(/^data:image\/png;base64,/, ''), 'base64'));
// Turn right
for (let i = 0; i < 25; i++) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(33);
    await page.keyboard.up('ArrowRight');
}
const dataUrl3 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (dataUrl3) await fs.writeFile(`${OUT}/turned.png`, Buffer.from(dataUrl3.replace(/^data:image\/png;base64,/, ''), 'base64'));
console.log('done');
await browser.close();
