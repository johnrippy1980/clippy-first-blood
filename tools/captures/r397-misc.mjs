import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r397m';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);
async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Achievements
await page.evaluate(() => { const g = window.__game; g.scene = 'achievements'; g.achievementIndex = 0; });
await page.waitForTimeout(400);
await snap('achievements');

// Soundtrack
await page.evaluate(() => { const g = window.__game; g.scene = 'soundtrack'; g.soundtrackIndex = 0; });
await page.waitForTimeout(400);
await snap('soundtrack');

// Stage select
await page.evaluate(() => { const g = window.__game; g.scene = 'stageSelect'; g.stageSelectIndex = 0; });
await page.waitForTimeout(400);
await snap('stageselect');

await browser.close();
