// Verify boss barks fire: phase-2 bark on enrage + periodic taunt
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r22', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Expose particles singleton for the probe
await page.evaluate(async () => {
    const m = await import('/src/particles.js');
    window.__particles = m.particles;
});

// Spawn a boss directly. Stage 1's boss is COPIER_3000.
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.transition = 0;
    g.player.iFrames = 99999;
    // Skip the boss arena gate; spawn boss next to player.
    if (!g.enemies.boss) {
        const Boss = g.enemies.enemies.constructor;
    }
});

// Drive the boss to half-HP via direct HP write, then poll particle list.
await page.evaluate(() => {
    const g = window.__game;
    // Find or spawn a boss
    let boss = g.enemies.enemies.find(e => e.behavior === 'boss');
    if (!boss) {
        boss = g.enemies.spawnBoss(g.player.x + 80, g.player.y + 40, 'COPIER_3000');
    }
    window.__boss = boss;
});

await page.waitForTimeout(80);
const before = await page.evaluate(() => {
    const b = window.__boss;
    return { exists: !!b, kind: b?.kind, hp: b?.hp, maxHp: b?.maxHp, phase: b?.phase, name: b?.name };
});
console.log('boss before:', JSON.stringify(before));

if (!before.exists) {
    console.log('no boss spawned — bailing');
    await browser.close();
    process.exit(0);
}

// Drop HP to 50%+1 then take a screenshot, then to 49% to trigger phase-2.
await page.evaluate(() => {
    const b = window.__boss;
    b.hp = Math.floor(b.maxHp / 2) + 1;
});
await page.waitForTimeout(40);
await page.evaluate(() => {
    const b = window.__boss;
    b.hp = Math.floor(b.maxHp / 2) - 1; // trigger phase 2
});
await page.waitForTimeout(60);
const afterEnrage = await page.evaluate(() => {
    const b = window.__boss;
    const g = window.__game;
    const floats = (g.particles?.floats || []).filter(f => f.alive).map(f => ({ text: f.text, color: f.color, life: f.life }));
    return { phase: b?.phase, pendingBark: b?._pendingBark, floats };
});
console.log('post-enrage:', JSON.stringify(afterEnrage));
await page.screenshot({ path: '/tmp/r22/enrage.png' });

// Wait for the pending bark to fire (delay was 28 frames ≈ 470ms)
await page.waitForTimeout(800);
const afterBark = await page.evaluate(() => {
    const g = window.__game;
    const b = window.__boss;
    const allFloats = (window.__particles?.floats || []).map(f => ({ alive: f.alive, text: f.text, color: f.color, life: f.life }));
    const aliveFloats = allFloats.filter(f => f.alive);
    return { boss: { phase: b?.phase, pending: b?._pendingBark, timer: b?.timer }, aliveFloats, sampleAll: allFloats.slice(0, 6), gameScene: g.scene };
});
console.log('post-bark:', JSON.stringify(afterBark));
await page.screenshot({ path: '/tmp/r22/bark.png' });

// Wait for taunt to fire (boss.timer needs to hit 300 — ~5s at 60fps)
await page.waitForTimeout(5000);
const tauntState = await page.evaluate(() => {
    const b = window.__boss;
    const allFloats = (window.__particles?.floats || []).filter(f => f.alive).map(f => f.text);
    return { timer: b.timer, alive: allFloats };
});
console.log('post-taunt:', JSON.stringify(tauntState));
await page.screenshot({ path: '/tmp/r22/taunt.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
