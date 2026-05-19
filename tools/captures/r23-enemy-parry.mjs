// Verify mini-boss parry: shoot bullets, force guardActive, confirm bullets
// flip out of player.bullets into enemies.bullets with _enemyParried flag.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r23', { recursive: true });

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
});

// Spawn a miniboss next to the player. The Boss instance is exposed via
// enemies.spawnBoss. Then mark it isMini.
await page.evaluate(() => {
    const g = window.__game;
    const px = g.player.x;
    const py = g.player.y;
    const boss = g.enemies.spawnBoss(px + 80, py + 40, 'COPIER_3000');
    boss.isMini = true;
    window.__mini = boss;
});

await page.waitForTimeout(60);
const seen = await page.evaluate(() => {
    const m = window.__mini;
    return { exists: !!m, isMini: m?.isMini, guardCycle: m?._guardCycle };
});
console.log('miniboss spawned:', JSON.stringify(seen));

// Force the guard window NOW by setting guardCycle near cycleLen-12 (start of guard).
await page.evaluate(() => {
    const m = window.__mini;
    m._guardCycle = 180 - 12; // next tick lands inside guard window (cycleLen-24..cycleLen)
});

// Spawn a player bullet aimed straight at the miniboss center, very close so it
// hits within one tick.
await page.evaluate(() => {
    const g = window.__game;
    const m = window.__mini;
    // Crude: use the same Bullet shape the player uses. Look at player.bullets
    // entries to mirror structure.
    const sample = g.player.bullets[0] || {};
    const b = {
        x: m.x + m.w / 2 - 6,
        y: m.y + m.h / 2,
        vx: 4, vy: 0,
        damage: 1, dmg: 1,
        life: 60, color: '#ffe080',
        weapon: 'MG',
        update(level) { this.x += this.vx; this.y += this.vy; this.life--; },
        draw() {},
        hits: new Set(),
        piercing: false,
        stuck: false,
    };
    g.player.bullets.push(b);
    window.__shot = b;
});

await page.waitForTimeout(100);
const post = await page.evaluate(() => {
    const m = window.__mini;
    const b = window.__shot;
    const g = window.__game;
    return {
        guardActive: m._guardActive,
        playerBulletCount: g.player.bullets.length,
        enemyBulletCount: g.enemies.bullets.length,
        bulletEnemyParried: b._enemyParried,
        bulletVx: b.vx,
        bulletColor: b.color,
        miniHp: m.hp,
        miniMaxHp: m.maxHp,
    };
});
console.log('post-fire:', JSON.stringify(post));
await page.screenshot({ path: '/tmp/r23/parry.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
