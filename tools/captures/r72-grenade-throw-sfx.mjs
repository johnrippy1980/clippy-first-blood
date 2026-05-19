// Verify audio.sfx('grenadeThrow') fires when player throws, and the
// audio dispatcher doesn't throw on the new branch.
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

    const player = g.player;

    const calls = [];
    const orig = audio.sfx.bind(audio);
    audio.sfx = (name) => { calls.push(name); return orig(name); };

    player.grenades = 2;
    player.thrownGrenades.length = 0;
    player._grenadeCooldown = 0;
    player._throwGrenade();

    audio.sfx = orig;
    return {
        sawThrowCall: calls.includes('grenadeThrow'),
        sawSlideCall: calls.includes('slide'),
        thrownCount: player.thrownGrenades.length,
        calls,
    };
});
console.log('Grenade throw SFX:', JSON.stringify(result));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.sawThrowCall === true
    && result.sawSlideCall === false   // no longer using slide hack
    && result.thrownCount === 1;
process.exit(ok ? 0 : 1);
