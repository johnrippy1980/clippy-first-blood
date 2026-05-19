// Capture mid-stage gameplay for fidelity audit
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r44', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Drop straight into stage 1, mid-stage
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.player.x = 600;
    g.player.weapon = 'SPREAD';
    g.player.score = 8400;
    g.player.combo = 7;
    g.player.comboTimer = 70;
});

await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/r44/play-stage1.png' });

// Pause menu
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'pause';
});
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/r44/pause.png' });

// Game over
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'gameOver';
    g.player.lives = 0;
    g.runStats = g.runStats || { kills: 12, deaths: 3, time: 240, score: 12500 };
});
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/r44/gameover.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
