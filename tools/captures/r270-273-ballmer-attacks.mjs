// R270/R271/R272/R273: verify Ballmer stage with chair attacks + floppy
// projectiles + intro card + office SFX wiring.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r270-273', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('CON ' + m.text()); });
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);

// Jump to FPS Ballmer stage
await page.evaluate(() => {
    window.__game._startStage(16);
});
// R272: stage intro should fire first
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/r270-273/01-intro-card.png' });

// Skip intro
await page.keyboard.down('x');
await page.waitForTimeout(80);
await page.keyboard.up('x');
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/r270-273/02-arena-loaded.png' });

// Force-advance to segment 1 (grunts with floppy projectiles)
await page.evaluate(() => {
    const a = window.__game._fpsArena;
    a.turrets.forEach(t => { t.hp = 0; t.alive = false; });
});
await page.waitForTimeout(1200);
// Wait for grunts to fire some floppies
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/r270-273/03-floppy-projectiles.png' });

const floppyState = await page.evaluate(() => {
    const a = window.__game._fpsArena;
    const floppies = a.enemyBullets.filter(b => b.isFloppy);
    return { totalBullets: a.enemyBullets.length, floppies: floppies.length };
});
console.log('Floppy projectiles in flight:', JSON.stringify(floppyState));

// Force-advance to segment 2 then 3 (boss)
await page.evaluate(() => {
    const a = window.__game._fpsArena;
    a.grunts.forEach(g => { g.hp = 0; g.alive = false; });
});
await page.waitForTimeout(1200);
await page.evaluate(() => {
    const a = window.__game._fpsArena;
    a.turrets.forEach(t => { t.hp = 0; t.alive = false; });
});
// Wait through bossEntry phase
await page.waitForTimeout(2200);
await page.screenshot({ path: '/tmp/r270-273/04-ballmer-active.png' });
// Let Ballmer fire chairs
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/r270-273/05-chairs-flying.png' });

const chairState = await page.evaluate(() => {
    const a = window.__game._fpsArena;
    const chairs = a.enemyBullets.filter(b => b.isChair);
    return { totalBullets: a.enemyBullets.length, chairs: chairs.length };
});
console.log('Chairs in flight:', JSON.stringify(chairState));

console.log('\nErrors:', errs.length);
errs.forEach(e => console.log('  ', e.slice(0, 140)));
await browser.close();
