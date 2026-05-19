// Verify spam-tapping V with 0 grenades only fires ONE fail beat within
// the cooldown window (no audio/text flood).
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
    const { audio } = await import('/src/audio.js');
    const g = window.__game;
    g.scene = 'play';
    try { g._startStage(1); } catch (e) { /* */ }
    await new Promise(r => setTimeout(r, 200));

    const { input } = await import('/src/input.js');
    const player = g.player;
    player.grenades = 0;
    player._grenadeCooldown = 0;

    const calls = [];
    const orig = audio.sfx.bind(audio);
    audio.sfx = (name) => { calls.push(name); return orig(name); };

    // Stub isPressed to return true for 'grenade' (simulating a held press
    // across N frames — isPressed is consumed per-frame in the real input
    // layer but here we re-stub each tick).
    const origIsPressed = input.isPressed.bind(input);
    input.isPressed = (name) => name === 'grenade';

    // Tick _handleGrenadeInput across 10 frames — only the first should fail-beat
    for (let i = 0; i < 10; i++) {
        player._handleGrenadeInput();
    }
    const failCallsImmediate = calls.filter(c => c === 'comboBreak').length;

    // Run 30 more frames to drain the cooldown, expecting a second fail
    for (let i = 0; i < 35; i++) {
        player._handleGrenadeInput();
    }
    const failCallsAfterDrain = calls.filter(c => c === 'comboBreak').length;

    input.isPressed = origIsPressed;
    audio.sfx = orig;
    return { failCallsImmediate, failCallsAfterDrain };
});
console.log('Fail-cooldown:', JSON.stringify(result));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
// Expect exactly 1 fail beat during spam (cooldown blocks the rest),
// then 1 more after we explicitly drain.
const ok = errors.length === 0
    && result.failCallsImmediate === 1
    && result.failCallsAfterDrain === 2;
process.exit(ok ? 0 : 1);
