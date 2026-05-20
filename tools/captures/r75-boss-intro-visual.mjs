// Visual snapshots of the boss intro at key timing points.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r75', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.click('#screen');

await page.evaluate(async () => {
    const g = window.__game;
    g.scene = 'play';
    try { g._startStage(1); } catch (e) { /* */ }
    await new Promise(r => setTimeout(r, 200));
    g._spawnBoss();
});

await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/r75/intro-mid.png' });

// Tick to bark reveal
await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 60; i++) g._tickBossIntro();
});
await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/r75/intro-bark.png' });

// Tick to warning flash
await page.evaluate(() => {
    const g = window.__game;
    while (g._bossIntro && g._bossIntro.age < 138 && (g._bossIntro.phase || 'villain') === 'villain') g._tickBossIntro();
});
await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/r75/intro-warning.png' });

// R157: counter-slide phase — tick villain to completion, then sample
// counter at mid-reveal to verify Clippy portrait + bark composition.
await page.evaluate(() => {
    const g = window.__game;
    while (g._bossIntro && (g._bossIntro.phase || 'villain') === 'villain') g._tickBossIntro();
    // Now in counter phase, age 0. Walk to ~age 35 — past portrait land
    // and into bark reveal.
    for (let i = 0; i < 35; i++) g._tickBossIntro();
});
await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/r75/intro-counter.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
process.exit(errors.length === 0 ? 0 : 1);
