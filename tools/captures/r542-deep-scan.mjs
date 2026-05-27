// R542: deep scan of all today's new content. Watches console for errors,
// snaps each stage briefly, exercises new mechanics.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r542';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
const warnings = [];
page.on('pageerror', e => errors.push(`PAGE: ${e.message}\n${e.stack||''}`));
page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') errors.push(`CONSOLE-ERR: ${t}`);
    if (m.type() === 'warn' && !t.includes('DevTools')) warnings.push(`CONSOLE-WARN: ${t}`);
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
});

const findings = [];
async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// =============== TURRET STAGE (25) — exhaustive ===============
console.log('\n=== TURRET STAGE (25) ===');
await page.evaluate(() => window.__game._startStage(25));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'turretPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
const inTurret = await page.evaluate(() => window.__game?.scene === 'turretPlay');
findings.push(`Turret entry: ${inTurret ? 'OK' : 'FAIL'}`);
await page.evaluate(() => { if (window.__game._turretArena) window.__game._turretArena._introT = 0; });
await snap('01_turret_arena');

// Test fire (no overheat trigger), grenade, then rapid-fire overheat
await page.keyboard.down('KeyX');
await page.waitForTimeout(800);
await page.keyboard.up('KeyX');
const heatAfter = await page.evaluate(() => window.__game?._turretArena?.player?.heat);
findings.push(`Heat builds: ${heatAfter > 0 ? 'OK' : 'FAIL'}`);
await snap('02_after_fire');

// Force overheat
await page.evaluate(() => {
    const a = window.__game._turretArena;
    if (a) { a.player.heat = 99; }
});
await page.keyboard.down('KeyX');
await page.waitForTimeout(500);
await page.keyboard.up('KeyX');
const overheated = await page.evaluate(() => window.__game?._turretArena?.player?.overheated);
findings.push(`Overheat triggers: ${overheated ? 'OK' : 'FAIL'}`);
await snap('03_overheat');
await page.waitForTimeout(2500);  // cool down

// Grenade
const gBefore = await page.evaluate(() => window.__game._turretArena.player.grenades);
await page.keyboard.press('KeyV');
await page.waitForTimeout(200);
const gAfter = await page.evaluate(() => window.__game._turretArena.player.grenades);
findings.push(`Grenade decrements: ${gAfter === gBefore - 1 ? 'OK' : `FAIL (${gBefore} → ${gAfter})`}`);

// Aim test
const aimBefore = await page.evaluate(() => ({
    x: window.__game._turretArena.player.aimX,
    y: window.__game._turretArena.player.aimY,
}));
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(300);
await page.keyboard.up('ArrowRight');
const aimAfter = await page.evaluate(() => ({
    x: window.__game._turretArena.player.aimX,
    y: window.__game._turretArena.player.aimY,
}));
findings.push(`Aim moves: ${aimAfter.x > aimBefore.x ? 'OK' : 'FAIL'}`);

// =============== CRTRON BOSS — full sequence ===============
console.log('\n=== CRTRON BOSS ===');
await page.evaluate(() => {
    const a = window.__game._turretArena;
    a.monsters = [];
    a.waveIdx = 4;
    a._voltronSpawned = false;
    a._spawnVoltron();
    a.voltron.introT = 0;
    a.voltron.scale = 0.9;
    a.player.iframes = 600;   // immortal for testing
});
await page.waitForTimeout(400);
await snap('04_voltron_spawn');

// Trigger all attack patterns
for (let attackIdx = 0; attackIdx < 4; attackIdx++) {
    await page.evaluate((i) => {
        const v = window.__game._turretArena.voltron;
        v.attackIdx = i;
        v.attackCD = 1;
    }, attackIdx);
    await page.waitForTimeout(150);
}
const projCount = await page.evaluate(() => window.__game._turretArena.bossProjectiles.length);
findings.push(`Boss projectiles spawn: ${projCount > 0 ? `OK (${projCount})` : 'FAIL'}`);
await snap('05_voltron_attacks');

// Phase 2 trigger
await page.evaluate(() => {
    const v = window.__game._turretArena.voltron;
    v.hp = 25;
});
await page.waitForTimeout(200);
const phase2 = await page.evaluate(() => window.__game._turretArena.voltron.phase);
// Phase 2 only triggers via the natural _tickVoltron flow, so step a few frames
await page.waitForTimeout(800);
const phase2After = await page.evaluate(() => window.__game._turretArena.voltron.phase);
findings.push(`Phase 2 triggers @ low HP: ${phase2After === 2 ? 'OK' : 'FAIL'}`);
await snap('06_voltron_phase2');

// BSOD wave
await page.evaluate(() => {
    window.__game._turretArena._voltronBsodWave();
});
await page.waitForTimeout(400);
await snap('07_bsod_wave');

// Death sequence
await page.evaluate(() => {
    const a = window.__game._turretArena;
    a.voltron.hp = 0;
    a._triggerVoltronDeath();
});
await page.waitForTimeout(600);
await snap('08_voltron_death_chain');
await page.waitForTimeout(500);
await snap('09_voltron_white_flash');
await page.waitForTimeout(800);
await snap('10_voltron_stamp');
// Wait for clear phase
for (let i = 0; i < 30; i++) {
    const phase = await page.evaluate(() => window.__game._turretArena?.phase);
    if (phase === 'clear') break;
    await page.waitForTimeout(80);
}
const afterDeathPhase = await page.evaluate(() => window.__game._turretArena?.phase);
findings.push(`Clear phase fires after death: ${afterDeathPhase === 'clear' ? 'OK' : `FAIL (phase=${afterDeathPhase})`}`);
await snap('11_voltron_clear');

// Advance to next stage card
await page.keyboard.press('KeyX');
await page.waitForTimeout(800);
const afterClearScene = await page.evaluate(() => window.__game?.scene);
findings.push(`Stage advances after clear: ${afterClearScene !== 'turretPlay' ? `OK (${afterClearScene})` : 'FAIL still in turretPlay'}`);
await snap('12_after_clear');

// =============== BRAWLER MELEE STAGES ===============
console.log('\n=== BRAWLER MELEE STAGES (7 BALLMER ARENA + 22 MECHA-GATES) ===');
await page.evaluate(() => window.__game._startStage(7));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'beatPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.waitForTimeout(500);
const meleeOn = await page.evaluate(() => window.__game._beatEmUp?.meleeMode);
findings.push(`Stage 7 meleeMode active: ${meleeOn ? 'OK' : 'FAIL'}`);
await snap('20_stage7_melee');

// Test debris throw
const debrisBefore = await page.evaluate(() => window.__game._beatEmUp.player.debrisAmmo);
await page.keyboard.press('KeyV');
await page.waitForTimeout(200);
const debrisAfter = await page.evaluate(() => window.__game._beatEmUp.player.debrisAmmo);
findings.push(`Debris throw decrements: ${debrisAfter === debrisBefore - 1 ? 'OK' : `FAIL (${debrisBefore} → ${debrisAfter})`}`);

// Punch test
await page.keyboard.press('KeyX');
await page.waitForTimeout(150);
const meleeState = await page.evaluate(() => !!window.__game._beatEmUp.player._meleeState);
findings.push(`Melee state on punch: ${meleeState ? 'OK' : 'FAIL'}`);
await snap('21_punch_state');

// =============== MAIN CAMPAIGN CHAIN 3 → 25 → 4 ===============
console.log('\n=== MAIN CAMPAIGN CHAIN ===');
await page.evaluate(() => window.__game._startStage(3));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.evaluate(() => window.__game._onStageClear());
await page.waitForTimeout(200);
await page.evaluate(() => { window.__game.storyTimer = 200; });
await page.keyboard.press('KeyX');  // advance from clear panel
await page.waitForTimeout(300);
const afterStage3 = await page.evaluate(() => window.__game._pendingStage);
findings.push(`Stage 3 → 25 chain: ${afterStage3 === 25 ? 'OK' : `FAIL (pending=${afterStage3})`}`);

// =============== FLOOR 11 walls + crash fix ===============
console.log('\n=== FLOOR 11 ===');
await page.evaluate(() => window.__game._startStage(16));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'doomPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.evaluate(() => { window.__game._doomEngine._introT = 0; });
await snap('30_floor11_walls');

// Trigger lethal hit to test R533 crash guard
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    d.player.hp = 1; d.player.iframes = 0; d.player.lives = 5;
    for (let i = 0; i < 3; i++) {
        d.bullets.push({
            x: d.player.x, y: d.player.y,
            vx: 0, vy: 0, life: 5,
            fromEnemy: true, dmg: 5,
        });
    }
});
await page.waitForTimeout(500);
findings.push(`Crash guard holds: ${errors.length === 0 ? 'OK' : 'FAIL'}`);

console.log('\n=== FINDINGS ===');
findings.forEach(f => console.log('  ', f));
console.log('\n=== ERRORS ===');
errors.forEach(e => console.log('  ', e));
console.log('\n=== WARNINGS ===');
warnings.forEach(w => console.log('  ', w));
await browser.close();
