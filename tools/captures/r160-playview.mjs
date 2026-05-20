import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r160', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(800);
await page.evaluate(async () => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    await new Promise(r => setTimeout(r, 400));
});
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/r160/stage1-idle.png' });

// Switch weapons + screenshot each
const weapons = ['SHOTGUN','SPREAD','LASER','FLAME','HOMING','THUNDER','CHAINSAW'];
for (const w of weapons) {
    await page.evaluate((wp) => { window.__game.player.weapon = wp; window.__game.player.weaponTimer = 600; }, w);
    await page.waitForTimeout(120);
    await page.screenshot({ path: `/tmp/r160/weapon-${w.toLowerCase()}.png` });
}
await browser.close();
