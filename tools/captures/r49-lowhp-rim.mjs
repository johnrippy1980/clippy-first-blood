// Verify low-HP red rim wash applies to player sprite (not iframed)
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r49', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Stage 1, set player to low HP, clear iframes
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.player.hp = 1; // ≤ 30% of maxHp (typically 4)
    g.player.iFrames = 0;
});
await page.waitForTimeout(150);
await page.screenshot({ path: '/tmp/r49/lowhp.png' });

// Sanity — verify HP state still 1 (rim doesn't kill the sprite)
const result = await page.evaluate(() => {
    const g = window.__game;
    return { hp: g.player.hp, iFrames: g.player.iFrames, alive: g.player.state !== 'die' };
});
console.log('low-hp render state:', JSON.stringify(result));

// Comparison: full HP — should have NO red rim
await page.evaluate(() => {
    const g = window.__game;
    g.player.hp = g.player.maxHp;
});
await page.waitForTimeout(150);
await page.screenshot({ path: '/tmp/r49/fullhp.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
