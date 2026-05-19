// Force the player into death scenes to capture the visual flow.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/death', { recursive: true });

const errors = [];
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => { errors.push('PAGE: ' + e.message); console.error('PAGE ERROR:', e.message); });
page.on('console', m => { if (m.type() === 'error') { errors.push('CON: ' + m.text()); } });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.transition = 0;
});
await page.waitForTimeout(500);

const snap = (n, l) => page.screenshot({ path: `/tmp/death/${String(n).padStart(2,'0')}-${l}.png` });
await snap(1, 'pre-death');

// Kill the player to trigger death animation. Bypass second-chance so we
// see the real game-over screen, not the rescue.
await page.evaluate(() => {
    const g = window.__game;
    g.player.hp = 1;
    g.player.lives = 0; // last life
    g.player.iFrames = 0;
    g.player.secondChanceUsed = true; // used up — kill takes effect
    g.player.hurt(99, -1, g.player.x + 60, g.player.y);
});
await page.waitForTimeout(150);
await snap(2, 'death-impact');
await page.waitForTimeout(300);
await snap(3, 'death-spin');
await page.waitForTimeout(800);
await snap(4, 'death-late');
await page.waitForTimeout(1500);
await snap(5, 'game-over');
await page.waitForTimeout(1500);
await snap(6, 'game-over-countdown');

await browser.close();
console.log('ERRORS:', errors.length);
