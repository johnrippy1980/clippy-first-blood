// R268: capture each segment of the Ballmer office FPS stage.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r268', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('CON ' + m.text()); });
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);

// Jump to FPS Ballmer stage (loader index 16)
await page.evaluate(() => {
    window.__game._startStage(16);
});
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/r268/seg0-fax-turrets.png' });

let probe = await page.evaluate(() => {
    const a = window.__game._fpsArena;
    return {
        exists: !!a,
        phase: a?.phase,
        segment: a?.segment,
        spriteKeys: a?.spriteKeys,
        bgImgLoaded: !!a?.bgImg,
        turrets: a?.turrets?.length,
        bossName: window.__game.level?.data?.bossKind,
    };
});
console.log('Initial:', JSON.stringify(probe));

// Advance segment 0 → 1
await page.evaluate(() => {
    const a = window.__game._fpsArena;
    a.turrets.forEach(t => { t.hp = 0; t.alive = false; });
});
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/r268/seg1-suits.png' });

// Let grunts scale up so we see them
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/r268/seg1-suits-mid.png' });

// Advance segment 1 → 2
await page.evaluate(() => {
    const a = window.__game._fpsArena;
    a.grunts.forEach(g => { g.hp = 0; g.alive = false; });
});
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/r268/seg2-security.png' });

// Advance segment 2 → 3 (Ballmer)
await page.evaluate(() => {
    const a = window.__game._fpsArena;
    a.turrets.forEach(t => { t.hp = 0; t.alive = false; });
});
await page.waitForTimeout(1800);
await page.screenshot({ path: '/tmp/r268/seg3-ballmer-entry.png' });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/r268/seg3-ballmer-active.png' });

probe = await page.evaluate(() => {
    const a = window.__game._fpsArena;
    return {
        phase: a?.phase,
        segment: a?.segment,
        core: a?.core ? { hp: a.core.hp, alive: a.core.alive } : null,
        shields: a?.shields?.map(s => ({ alive: s.alive, hp: s.hp })),
    };
});
console.log('Boss state:', JSON.stringify(probe));

console.log('\nErrors:', errs.length);
errs.forEach(e => console.log('  ', e.slice(0, 140)));
await browser.close();
