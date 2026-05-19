// Verify NEW BEST tag fires when stage score exceeds previous best
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r42', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Test 1: first ever clear of stage 1 — NEW BEST should fire
const t1 = await page.evaluate(async () => {
    const ach = await import('/src/achievements.js');
    ach.achievements.stats.stageBestScores = {}; // reset
    const g = window.__game;
    g._startStage(1);
    g.player.score = 5000;
    g.currentStage = 1;
    g.scene = 'play';
    g._clearScheduled = false;
    g._onStageClear();
    return { newBest: g._stageNewBest, stored: ach.achievements.stats.stageBestScores[1] };
});
console.log('first clear:', JSON.stringify(t1));

// Test 2: replay with LOWER score — NEW BEST should NOT fire
const t2 = await page.evaluate(async () => {
    const ach = await import('/src/achievements.js');
    const g = window.__game;
    g._startStage(1);
    g.player.score = 3000;
    g.currentStage = 1;
    g.scene = 'play';
    g._clearScheduled = false;
    g._onStageClear();
    return { newBest: g._stageNewBest, stored: ach.achievements.stats.stageBestScores[1] };
});
console.log('lower replay:', JSON.stringify(t2));

// Test 3: replay with HIGHER score — NEW BEST should fire
const t3 = await page.evaluate(async () => {
    const ach = await import('/src/achievements.js');
    const g = window.__game;
    g._startStage(1);
    g.player.score = 8000;
    g.currentStage = 1;
    g.scene = 'play';
    g._clearScheduled = false;
    g._onStageClear();
    return { newBest: g._stageNewBest, stored: ach.achievements.stats.stageBestScores[1] };
});
console.log('higher replay:', JSON.stringify(t3));

// Visual check: drive panel to point where SCORE row is shown + score has tallied
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'stageClear';
    g.storyTimer = 300;
    g._stageNewBest = true;
    g.player.score = 8000;
});
await page.waitForTimeout(150);
await page.screenshot({ path: '/tmp/r42/newbest.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
