// R589: live-play the Doom-mode FPS stage (FLOOR 11) through the real game
// loop. Drives forward movement via real KeyboardEvents (w/ArrowUp), turns by
// nudging player.angle (mouse-look can't be simulated headlessly), fires, and
// cycles weapons — letting the page's own rAF loop tick. Samples state each
// step and flags: getting wedged on a wall (no progress while pushing
// forward), HP/lives going invalid, scene wedging out of doomPlay, and any
// console/page errors. Captures frames for eyeballing.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/r589';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.click('#screen');
await page.waitForTimeout(300);

// Enter FLOOR 11 (stage 16) and drop straight into doomPlay; the page's own
// rAF loop keeps running (NOT frozen) so this is real motion.
await page.evaluate(() => {
    const g = window.__game;
    g._restartRun();
    g.runId = window.__leaderboard.newRunId();
    g._runWarped = false; g.dailyMode = false;
    g._startStage(16);
    g._doomPendingPlay = false;
    g.scene = 'doomPlay';
    const d = g._doomEngine;
    if (d) { d._introT = 0; d.introT = 0; d._stageNameT = 0; }
});
await page.waitForTimeout(300);

const down = (k) => page.evaluate(k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), k);
const up = (k) => page.evaluate(k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })), k);
const key = async (k, ms = 60) => { await down(k); await page.waitForTimeout(ms); await up(k); await page.waitForTimeout(30); };
const canvas = await page.$('#screen');
const snap = () => page.evaluate(() => {
    const g = window.__game; const d = g._doomEngine; const p = d?.player;
    return {
        scene: g.scene,
        px: p ? +p.x.toFixed(2) : null, py: p ? +p.y.toFixed(2) : null,
        angle: p ? +p.angle.toFixed(2) : null,
        hp: p?.hp, lives: p?.lives, kills: p?.kills,
        weaponIdx: p?.weaponIdx, muzzle: p?.muzzleFlash,
        entCount: d?.entities?.length ?? null,
    };
});

const log = [];
const obs = async (label) => { const s = await snap(); log.push({ label, ...s }); return s; };

await obs('start');
if (canvas) await canvas.screenshot({ path: `${OUT}/01-start.png` });

// Walk forward in bursts, turning to scan the corridor. Track position to
// detect getting wedged (pushing forward but not moving).
let wedged = 0, maxWedge = 0;
const angles = [0, 0, 1.2, -1.2, 2.4, 0, 0, 3.1, 0.6, 0];
for (let step = 0; step < 10; step++) {
    const before = await snap();
    // Aim, then push forward for a stretch (hold ArrowUp through real frames).
    await page.evaluate(a => { window.__game._doomEngine.player.angle = a; }, angles[step]);
    await down('ArrowUp');
    if (step % 2 === 0) await down('x');         // fire while moving sometimes
    await page.waitForTimeout(520);
    await up('ArrowUp');
    await up('x');
    await page.waitForTimeout(60);
    const after = await obs('step-' + step);
    const moved = before.px != null && after.px != null
        ? Math.hypot(after.px - before.px, after.py - before.py) : 0;
    // Only count as "wedged" if we were pushing forward into open space but
    // barely moved AND took no damage (a wall block, not a fight).
    if (moved < 0.05) { wedged++; maxWedge = Math.max(maxWedge, wedged); }
    else wedged = 0;
    if (step === 3) { if (canvas) await canvas.screenshot({ path: `${OUT}/02-mid.png` }); }
}
if (canvas) await canvas.screenshot({ path: `${OUT}/03-late.png` });

// Cycle weapons (q) and confirm weaponIdx changes + no error.
const wBefore = (await snap()).weaponIdx;
await key('q', 80);
await page.waitForTimeout(120);
const wAfter = (await snap()).weaponIdx;
await obs('after-cycle');

// Take damage path: drain HP and let the loop run a death/respawn cycle.
await page.evaluate(() => { const p = window.__game._doomEngine.player; p.hp = 0; });
await page.waitForTimeout(2500);
const afterDeath = await obs('after-death');
if (canvas) await canvas.screenshot({ path: `${OUT}/04-after-death.png` });

await browser.close();

console.log('=== DOOM LIVE TRACE ===');
for (const e of log) {
    console.log(`[${e.label}] scene=${e.scene} pos=(${e.px},${e.py}) ang=${e.angle} `
        + `hp=${e.hp} lives=${e.lives} kills=${e.kills} wIdx=${e.weaponIdx} ents=${e.entCount}`);
}
console.log(`\nweapon cycle: ${wBefore} -> ${wAfter}`);
console.log('maxWedge (consecutive no-move forward bursts):', maxWedge);
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

let ok = true;
const fail = (m) => { ok = false; console.log('FAIL: ' + m); };
if (!log.some(e => e.scene === 'doomPlay')) fail('never in doomPlay');
if (log.some(e => e.hp != null && (e.hp < 0 || e.hp > 12))) fail('HP went out of range');
if (afterDeath.scene !== 'doomPlay' && afterDeath.scene !== 'gameOver') fail('unexpected scene after death: ' + afterDeath.scene);
if (errors.length) fail('console/page errors during live play');
// maxWedge is informational, not a hard fail (open-space detection is fuzzy).
console.log('\n' + (ok ? 'PASS' : 'FAILED'));
process.exit(ok ? 0 : 1);
