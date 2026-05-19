// Verify _respawn spawns a shock ring + dust and calls audio.sfx('respawn').
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r66', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

const result = await page.evaluate(async () => {
    const { particles } = await import('/src/particles.js');
    const { audio } = await import('/src/audio.js');
    const g = window.__game;
    g.scene = 'play';
    try { g._startStage(1); } catch (e) { /* noop */ }
    await new Promise(r => setTimeout(r, 200));

    // Spy on audio.sfx — capture the next call name.
    const calls = [];
    const orig = audio.sfx.bind(audio);
    audio.sfx = (name) => { calls.push(name); return orig(name); };

    const ringsBefore = particles.rings.filter(r => r.alive).length;
    const aliveBefore = particles.pool.filter(p => p.alive).length;

    g._respawn();

    const ringsAfter = particles.rings.filter(r => r.alive).length;
    const aliveAfter = particles.pool.filter(p => p.alive).length;

    audio.sfx = orig;
    return {
        ringsAdded: ringsAfter - ringsBefore,
        particlesAdded: aliveAfter - aliveBefore,
        sawRespawnCall: calls.includes('respawn'),
        calls,
    };
});
console.log('Respawn beat:', JSON.stringify(result));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
const ok = errors.length === 0
    && result.ringsAdded >= 1
    && result.particlesAdded >= 4
    && result.sawRespawnCall === true;
process.exit(ok ? 0 : 1);
