// Capture muzzle position across aim angles to verify bullets leave the
// visible barrel tip in every direction.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r10', { recursive: true });

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

// Lock player to fixed pos and snapshot multiple aim angles.
const angles = [
    { name: 'right', ax: 1, ay: 0 },
    { name: 'upright', ax: 0.7, ay: -0.7 },
    { name: 'up', ax: 0, ay: -1 },
    { name: 'upleft', ax: -0.7, ay: -0.7 },
    { name: 'left', ax: -1, ay: 0 },
    { name: 'downright', ax: 0.7, ay: 0.7 },
    { name: 'down', ax: 0, ay: 1 },
];
for (const a of angles) {
    await page.evaluate((aim) => {
        const g = window.__game;
        g.player.aim = { x: aim.ax, y: aim.ay };
        g.player.facing = aim.ax >= 0 ? 1 : -1;
        g.player.vx = 0; g.player.vy = 0;
        g.player.recoilTimer = 6;
    }, a);
    // Fire one bullet to render flash + spawn position
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(80);
    await page.screenshot({ path: `/tmp/r10/aim-${a.name}.png` });
}

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
