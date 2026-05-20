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
    // Force shoot by setting muzzle flash + recoil and weapon
    g.player.weapon = 'LASER';
    g.player.weaponTimer = 600;
    g.player.recoilTimer = 6;
    g.player.muzzleFlashTimer = 4;
    g.player.aim = { x: 1, y: 0 };
});
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/r160/firing.png' });
await browser.close();
