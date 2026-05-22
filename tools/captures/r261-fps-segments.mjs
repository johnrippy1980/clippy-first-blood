// R261: capture each FPS-stage segment to validate the Contra-base
// rebuild — corridor depth, Clippy framing, turrets/grunts/barrier/boss.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r261', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('CON ' + m.text()); });
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);

// Jump to FPS stage (loader index 15)
await page.evaluate(() => {
    window.__game._startStage(15);
});
// Wait through the fade transition into FPS_PLAY scene
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/r261/seg0-turret-wave.png' });

// Probe state
let probe = await page.evaluate(() => {
    const a = window.__game._fpsArena;
    return {
        exists: !!a,
        phase: a?.phase,
        segment: a?.segment,
        turrets: a?.turrets?.length,
        grunts: a?.grunts?.length,
        playerHp: a?.player?.hp,
    };
});
console.log('Initial:', JSON.stringify(probe));

// Force-kill segment 0 turrets, advance to segment 1
await page.evaluate(() => {
    const a = window.__game._fpsArena;
    a.turrets.forEach(t => { t.hp = 0; t.alive = false; });
});
// Wait through the advance transition
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/r261/seg1-grunts.png' });
probe = await page.evaluate(() => {
    const a = window.__game._fpsArena;
    return { phase: a?.phase, segment: a?.segment, grunts: a?.grunts?.length };
});
console.log('After advance 1:', JSON.stringify(probe));

// Let grunts run a bit so they scale up
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/r261/seg1-grunts-mid.png' });

// Force-kill grunts → segment 2
await page.evaluate(() => {
    const a = window.__game._fpsArena;
    a.grunts.forEach(g => { g.hp = 0; g.alive = false; });
});
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/r261/seg2-barrier.png' });
probe = await page.evaluate(() => {
    const a = window.__game._fpsArena;
    return { phase: a?.phase, segment: a?.segment, turrets: a?.turrets?.length, barriers: a?.barriers?.length };
});
console.log('After advance 2:', JSON.stringify(probe));

// Force-kill turrets → segment 3 (boss)
await page.evaluate(() => {
    const a = window.__game._fpsArena;
    a.turrets.forEach(t => { t.hp = 0; t.alive = false; });
});
await page.waitForTimeout(1800);
await page.screenshot({ path: '/tmp/r261/seg3-boss-entry.png' });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/r261/seg3-boss-active.png' });
probe = await page.evaluate(() => {
    const a = window.__game._fpsArena;
    return {
        phase: a?.phase,
        segment: a?.segment,
        core: a?.core ? { hp: a.core.hp, alive: a.core.alive } : null,
        shields: a?.shields?.map(s => ({ alive: s.alive, hp: s.hp })),
    };
});
console.log('Boss:', JSON.stringify(probe));

console.log('\nErrors:', errs.length);
errs.forEach(e => console.log('  ', e.slice(0, 140)));
await browser.close();
