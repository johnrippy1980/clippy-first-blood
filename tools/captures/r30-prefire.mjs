// Verify enemy pre-fire telegraph: _preFire ramps 0→1 in 8 frames before shot
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r30', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.transition = 0;
    g.player.iFrames = 99999;
    // Move player next to a holepunch (sniper-type)
    const sniper = g.enemies.enemies.find(e => e.type === 'folder');
    if (sniper) {
        g.player.x = sniper.x - 80;
        g.player.y = sniper.y;
        // Force-activate
        sniper.activated = true;
        sniper._grace = 0;
        window.__sniper = sniper;
    }
});

// Diagnose: are we even running _hoverSniper? Check distance, activated, behavior
// Wait a beat for the boss-entrance card (if any) to settle
await page.waitForTimeout(2000);
const diag = await page.evaluate(() => {
    const e = window.__sniper;
    const g = window.__game;
    return {
        scene: g.scene,
        type: e?.type, behavior: e?.behavior, activated: !!e?.activated,
        x: e?.x | 0, px: g.player.x | 0,
        dx: Math.abs(g.player.x - e.x) | 0,
        timer: e?.timer, _aimX: e?._aimX, _preFire: e?._preFire,
    };
});
console.log('diag:', JSON.stringify(diag));

// Sample _preFire over a 240ms window — should see a ramp before each shot
const samples = [];
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(40);
    const s = await page.evaluate(() => {
        const e = window.__sniper;
        return { timer: e.timer, preFire: e._preFire || 0 };
    });
    samples.push(s);
}
const nonZero = samples.filter(s => s.preFire > 0);
console.log(`total samples: ${samples.length}, nonzero preFire frames: ${nonZero.length}`);
console.log(`sample preFires:`, JSON.stringify(nonZero.slice(0, 8)));
await page.screenshot({ path: '/tmp/r30/prefire.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
