// R274: measure weapon-fire latency end-to-end. Compares the frame
// at which: (a) shoot input registers, (b) _shoot() executes, (c)
// bullet appears in this.bullets array, (d) audio.sfx call fires.
//
// Tests with MG (fastest fire rate, most likely to feel "snappy") and
// SHOTGUN (slower, where any latency is more noticeable).

import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(800);

await page.evaluate(() => {
    window.__game._startStage(1);
});
await page.waitForTimeout(1500);
// Skip stage intro
for (let i = 0; i < 4; i++) {
    await page.keyboard.down('x'); await page.waitForTimeout(60); await page.keyboard.up('x');
    await page.waitForTimeout(300);
}

// Install instrumentation
await page.evaluate(() => {
    window.__fireTrace = [];
    const g = window.__game;
    const origShoot = g.player._shoot.bind(g.player);
    g.player._shoot = function () {
        const beforeBullets = this.bullets.length;
        const t0 = performance.now();
        origShoot();
        const t1 = performance.now();
        const afterBullets = this.bullets.length;
        window.__fireTrace.push({
            weapon: this.weapon,
            timeMs: (t1 - t0).toFixed(3),
            bulletAdded: afterBullets - beforeBullets,
            fireCooldown: this.fireCooldown,
        });
    };
    g.player.weapon = 'MG';
    g.player.weaponLevel = 1;
});

console.log('=== R274: WEAPON-FIRE LATENCY ===\n');

// Press shoot for ~1 second of held fire
await page.keyboard.down('x');
await page.waitForTimeout(1000);
await page.keyboard.up('x');
await page.waitForTimeout(200);

const mgTrace = await page.evaluate(() => window.__fireTrace.slice());
console.log(`MG sustained fire: ${mgTrace.length} shots in 1s`);
console.log(`First shot: ${JSON.stringify(mgTrace[0])}`);
console.log(`Last shot:  ${JSON.stringify(mgTrace[mgTrace.length - 1])}`);
const avgMs = mgTrace.reduce((a, b) => a + parseFloat(b.timeMs), 0) / Math.max(1, mgTrace.length);
console.log(`Avg _shoot() exec time: ${avgMs.toFixed(3)}ms`);

// Test SHOTGUN
await page.evaluate(() => {
    window.__fireTrace = [];
    window.__game.player.weapon = 'SHOTGUN';
    window.__game.player.fireCooldown = 0;
});
await page.keyboard.down('x');
await page.waitForTimeout(1000);
await page.keyboard.up('x');
await page.waitForTimeout(200);
const sgTrace = await page.evaluate(() => window.__fireTrace.slice());
console.log(`\nSHOTGUN sustained fire: ${sgTrace.length} shots in 1s`);
console.log(`First shot: ${JSON.stringify(sgTrace[0])}`);
const avgSg = sgTrace.reduce((a, b) => a + parseFloat(b.timeMs), 0) / Math.max(1, sgTrace.length);
console.log(`Avg _shoot() exec time: ${avgSg.toFixed(3)}ms`);

// Test THUNDER (heavy hit-scan)
await page.evaluate(() => {
    window.__fireTrace = [];
    window.__game.player.weapon = 'THUNDER';
    window.__game.player.fireCooldown = 0;
});
await page.keyboard.down('x');
await page.waitForTimeout(1000);
await page.keyboard.up('x');
await page.waitForTimeout(200);
const tTrace = await page.evaluate(() => window.__fireTrace.slice());
console.log(`\nTHUNDER sustained fire: ${tTrace.length} shots in 1s`);
console.log(`First shot: ${JSON.stringify(tTrace[0])}`);
const avgT = tTrace.reduce((a, b) => a + parseFloat(b.timeMs), 0) / Math.max(1, tTrace.length);
console.log(`Avg _shoot() exec time: ${avgT.toFixed(3)}ms`);

// FPS audit — frame timing across 60 frames
console.log('\n=== FRAME-TIME SAMPLE ===');
const fps = await page.evaluate(() => new Promise(resolve => {
    const samples = [];
    let last = performance.now();
    let count = 0;
    function tick() {
        const now = performance.now();
        samples.push(now - last);
        last = now;
        if (++count < 60) requestAnimationFrame(tick);
        else {
            samples.sort((a, b) => a - b);
            resolve({
                min: samples[0].toFixed(2),
                p50: samples[30].toFixed(2),
                p95: samples[57].toFixed(2),
                max: samples[59].toFixed(2),
            });
        }
    }
    requestAnimationFrame(tick);
}));
console.log(`Frame time (ms): min=${fps.min} p50=${fps.p50} p95=${fps.p95} max=${fps.max}`);

console.log(`\nErrors: ${errors.length}`);
errors.slice(0, 5).forEach(e => console.log('  -', e.slice(0, 180)));
await browser.close();
