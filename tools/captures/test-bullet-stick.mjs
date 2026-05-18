// Verify bullet impact-stick: fire toward a solid tile and watch the bullet
// stay parked against the wall, then fade out.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/bullet-stick', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text()); });
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.click('#screen');
await page.waitForTimeout(300);
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(600);
// Force play, plant Clippy near a solid wall to the right
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g.storyTimer = 0;
    // Drop player against a wall. Search horizontally for a wall tile near surface.
    const lvl = g.level;
    let foundX = null, foundY = null;
    for (let tx = 8; tx < lvl.data.width - 4; tx++) {
        for (let ty = lvl.data.height - 8; ty < lvl.data.height - 2; ty++) {
            const t = lvl.tileAt(tx * 16, ty * 16);
            if (t === 1) { // SOLID
                foundX = tx; foundY = ty;
                break;
            }
        }
        if (foundX) break;
    }
    if (foundX != null) {
        g.player.x = foundX * 16 - 40;
        g.player.y = (foundY - 2) * 16;
        g.camera.x = Math.max(0, g.player.x - 60);
    }
    // Equip MG for visible streaks
    g.player.weapon = 'MG';
    g.player.facing = 1;
    g.player.aim.x = 1; g.player.aim.y = 0;
});
await page.waitForTimeout(300);

// Aim straight DOWN into the floor and fire MG bullets — guaranteed wall hit.
const trace = await page.evaluate(async () => {
    const g = window.__game;
    const out = [];
    // Force MG + aim down
    g.player.weapon = 'MG';
    g.player.aim = { x: 0, y: 1 };
    g.player.aimLock = 30; // some inputs respect a lock; mirror in case
    out.push({ before: true, scene: g.scene, weapon: g.player.weapon });
    g.player.fireCooldown = 0;
    g.player._shoot();
    g.player.fireCooldown = 0;
    g.player._shoot();
    g.player.fireCooldown = 0;
    g.player._shoot();
    out.push({ afterShoot: g.player.bullets.length });
    let everStuck = 0, finalRendered = null;
    for (let f = 0; f < 60; f++) {
        await new Promise(r => requestAnimationFrame(r));
        const stuck = g.player.bullets.filter(b => b.stuck);
        if (stuck.length > everStuck) everStuck = stuck.length;
        if (f < 20 || f % 10 === 0) {
            const b0 = g.player.bullets[0];
            out.push({ f, total: g.player.bullets.length, stuck: stuck.length, b0: b0 ? { x: b0.x|0, y: b0.y|0, vx: +b0.vx.toFixed(1), vy: +b0.vy.toFixed(1), life: b0.life, stuck: !!b0.stuck, sl: b0.stuckLife } : null });
        }
    }
    out.push({ everStuck });
    return out;
}).then(async (t) => {
    // After trace, fire one more salvo and screenshot the stuck moment
    await page.evaluate(() => {
        const g = window.__game;
        g.player.weapon = 'MG';
        g.player.aim = { x: 0, y: 1 };
        g.player.fireCooldown = 0; g.player._shoot();
        g.player.fireCooldown = 0; g.player._shoot();
        g.player.fireCooldown = 0; g.player._shoot();
    });
    await page.waitForTimeout(80);
    await page.screenshot({ path: '/tmp/bullet-stick/stuck.png' });
    return t;
});
for (const row of trace) console.log(JSON.stringify(row));
await browser.close();
