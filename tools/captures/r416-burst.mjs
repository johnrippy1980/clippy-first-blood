// R416: verify painted explosion sprite renders on particles.explosion call
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r416';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.evaluate(() => { if (window.__game.player) window.__game.player.invuln = 99999; });
// Trigger explosion at center of screen — import the singleton module
const particles = await page.evaluateHandle(() => import('/src/particles.js').then(m => m.particles));
await page.evaluate(async (parts) => {
    const g = window.__game;
    const cx = (g.camera?.viewX || 0) + 128;
    const cy = (g.camera?.viewY || 0) + 100;
    parts.explosion(cx, cy, '#ff8050', 24);
}, particles);
// Snap 5 frames at burst start, mid, end
for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(100);
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/burst_${i}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
console.log('done');
await browser.close();
