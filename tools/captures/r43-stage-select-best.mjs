// Verify per-stage best score renders on stage select (pip + detail line)
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r43', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Seed best scores into a few stages, jump to stage select, screenshot
await page.evaluate(async () => {
    const ach = await import('/src/achievements.js');
    ach.achievements.stats.stageBestScores = { 1: 12500, 2: 8200, 4: 25000 };
    const g = window.__game;
    g.unlockedStage = 5;
    g.stageSelectIndex = 0; // stage 1 selected
    g.scene = 'stageSelect';
});

await page.waitForTimeout(150);
await page.screenshot({ path: '/tmp/r43/stage1.png' });

// Switch to stage 4 (highest best)
await page.evaluate(() => {
    window.__game.stageSelectIndex = 3;
});
await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/r43/stage4.png' });

// Stage 3 — no best recorded, should show no BEST line
await page.evaluate(() => {
    window.__game.stageSelectIndex = 2;
});
await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/r43/stage3-nobest.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
