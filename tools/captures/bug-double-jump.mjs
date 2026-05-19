// Reproduce: jump, then mid-air jump again — does double-jump fire?
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

const result = await page.evaluate(async () => {
    const g = window.__game;
    g.scene = 'play';
    try { g._startStage(1); } catch (e) { /* */ }
    await new Promise(r => setTimeout(r, 200));

    const { input } = await import('/src/input.js');
    const p = g.player;

    // Snapshot state before any jumping
    const initial = {
        onGround: p.onGround,
        airJumps: p.airJumpsLeft,
        state: p.state,
        vy: p.vy,
    };

    // Simulate jump press — manually set pressed via internal API
    input.pressed.add('jump');
    input.pressTimes.set('jump', performance.now());
    p.update(g.level, g.camera);
    input.pressed.delete('jump');  // simulate per-frame clear

    // After 1st jump
    const afterFirst = {
        onGround: p.onGround,
        airJumps: p.airJumpsLeft,
        state: p.state,
        vy: p.vy,
    };

    // Tick a few frames so player rises and clears the ground
    for (let i = 0; i < 8; i++) {
        p.update(g.level, g.camera);
    }
    const midAir = {
        onGround: p.onGround,
        airJumps: p.airJumpsLeft,
        state: p.state,
        vy: p.vy,
    };

    // Second jump press while airborne
    input.pressed.add('jump');
    input.pressTimes.set('jump', performance.now());
    const vyBefore = p.vy;
    p.update(g.level, g.camera);
    input.pressed.delete('jump');

    const afterSecond = {
        onGround: p.onGround,
        airJumps: p.airJumpsLeft,
        state: p.state,
        vy: p.vy,
        vyBefore,
    };

    return { initial, afterFirst, midAir, afterSecond };
});
console.log(JSON.stringify(result, null, 2));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
