// Capture MG bullet streaks mid-flight by sampling many frames.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r9bs', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.transition = 0;
    g.player.iFrames = 99999;
});

await page.keyboard.down('KeyX');
for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(60);
    await page.screenshot({ path: `/tmp/r9bs/mg-${i}.png` });
}
await page.keyboard.up('KeyX');

// SPREAD with multiple bullets per shot
await page.evaluate(() => {
    const g = window.__game;
    g.player.weapon = 'SPREAD';
    g.player.weaponLevel = 3;
});
await page.keyboard.down('KeyX');
for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(60);
    await page.screenshot({ path: `/tmp/r9bs/spread-${i}.png` });
}
await page.keyboard.up('KeyX');

await browser.close();
console.log('ERRORS:', errors.length);
