// R585: drive the game through REAL keyboard events and the page's own rAF
// loop — no scene-forcing, no direct sim poking. This is the high-signal way
// to watch the game in motion: dispatch KeyboardEvent('keydown'/'keyup') on
// window (exactly what input.js listens for), let real frames tick, and sample
// game state + capture screenshots. Watches for: player going off-screen,
// scene wedging, console/page errors, HP/lives sanity, camera divergence.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/r585';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.click('#screen');           // focus + first-gesture audio init
await page.waitForTimeout(300);

// Real-input bridge: dispatch the exact events input.js binds to on window.
async function key(k, downMs = 60) {
    await page.evaluate(k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), k);
    await page.waitForTimeout(downMs);
    await page.evaluate(k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })), k);
    await page.waitForTimeout(40);
}
async function down(k) { await page.evaluate(k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), k); }
async function up(k) { await page.evaluate(k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })), k); }
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const snap = () => page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    const onScreen = p ? (() => {
        const sx = p.x - g.camera.viewX, sy = p.y - g.camera.viewY;
        return sx > -48 && sx < 256 + 48 && sy > -48 && sy < 224 + 48;
    })() : null;
    return {
        scene: g.scene,
        px: p ? Math.round(p.x) : null, py: p ? Math.round(p.y) : null,
        hp: p ? p.hp : null, lives: p ? p.lives : null, state: p ? p.state : null,
        camx: Math.round(g.camera.viewX), camy: Math.round(g.camera.viewY),
        onScreen,
        levelW: g.level ? g.level.width : null, levelH: g.level ? g.level.height : null,
    };
});

const log = [];
const observe = async (label) => { const s = await snap(); log.push({ label, ...s }); return s; };

await observe('title');
await shot('01-title');

// Drive from title into gameplay using real keys. Start = Enter; jump = z.
// The title/menu accepts start; press a few times to walk the menu into a run.
for (let i = 0; i < 4; i++) {
    await key('Enter', 80);
    await page.waitForTimeout(300);
    const s = await snap();
    if (s.scene === 'play' || s.scene === 'stageIntro' || s.scene === 'ready') break;
}
await page.waitForTimeout(600);
await observe('after-start');
await shot('02-after-start');

// If we're in an intro/ready gate, press start/jump to drop into play.
for (let i = 0; i < 6; i++) {
    const s = await snap();
    if (s.scene === 'play') break;
    await key('Enter', 60);
    await key('z', 60);
    await page.waitForTimeout(250);
}
await observe('entered-play');
await shot('03-entered-play');

// Now actually PLAY: hold right + tap shoot/jump for a few seconds of real
// frames. Sample every ~500ms and flag any off-screen / scene-wedge / error.
let offScreenFrames = 0, maxOffStreak = 0, streak = 0;
await down('ArrowRight');
for (let t = 0; t < 16; t++) {
    if (t % 3 === 0) await key('x', 50);     // shoot
    if (t % 5 === 2) await key('z', 50);     // jump
    await page.waitForTimeout(420);
    const s = await observe('play-' + t);
    if (s.onScreen === false) { offScreenFrames++; streak++; maxOffStreak = Math.max(maxOffStreak, streak); }
    else streak = 0;
    if (t === 6) await shot('04-mid-play');
}
await up('ArrowRight');
await shot('05-late-play');

// Force a death to exercise the R583 respawn path through the real loop:
// drain HP via the debug hook if present, else leave as-is.
const hadDeathHook = await page.evaluate(() => {
    const g = window.__game; const p = g.player;
    if (!p || g.scene !== 'play') return false;
    p.hp = 0;                                 // let the real tick notice death
    return true;
});
await page.waitForTimeout(2200);             // span the ~90-frame death anim + respawn
const afterDeath = await observe('after-death');
await shot('06-after-death');

await browser.close();

// --- Report ---
console.log('=== LIVE PLAY TRACE ===');
for (const e of log) {
    console.log(`[${e.label}] scene=${e.scene} pos=(${e.px},${e.py}) cam=(${e.camx},${e.camy}) `
        + `hp=${e.hp} lives=${e.lives} state=${e.state} onScreen=${e.onScreen} lvl=${e.levelW}x${e.levelH}`);
}
console.log('\nERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

let ok = true;
const fail = (m) => { ok = false; console.log('FAIL: ' + m); };
const reachedPlay = log.some(e => e.scene === 'play');
if (!reachedPlay) fail('never reached the play scene via real input');
if (maxOffStreak >= 3) fail('player off-screen for ' + maxOffStreak + ' consecutive samples during normal play');
if (hadDeathHook && afterDeath.onScreen === false && afterDeath.scene === 'play')
    fail('player off-screen after death/respawn (the R583 bug class)');
if (errors.length) fail('console/page errors during live play');
console.log('\n' + (ok ? 'PASS' : 'FAILED'));
process.exit(ok ? 0 : 1);
