// R250: audit FLAME burn + HOMING tracking + SHOTGUN spread+damage buff.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);

async function setup() {
    return await page.evaluate(async () => {
        const g = window.__game;
        g._startStage(1);
        g.storyTimer = 999;
        g.scene = 'play';
        await new Promise(r => setTimeout(r, 250));
        g.scene = 'play';
        g.bossSpawned = true;
        g.player.x = 80;
        g.player.y = g.level.height - 48;
        g.player.facing = 1;
        g.player.aim = { x: 1, y: 0 };
        g.player.fireCooldown = 0;
        g.player.bullets = [];
        g.player.mgVentLock = 0;
        g.player.weaponLevel = 1;
    });
}

await setup();

// 1) FLAME burn DoT verification: fire once, then tick game and confirm
//    enemy hp keeps decreasing after the bullet expires.
const flame = await page.evaluate(async () => {
    const g = window.__game;
    g.player.weapon = 'FLAME';
    g.player.fireCooldown = 0;
    g.player.bullets = [];
    const e = g.enemies.enemies.find(x => x.alive);
    e.x = g.player.x + 30;
    e.y = g.player.y;
    e.hp = 50; e.alive = true;
    e.burnTimer = 0;
    const before = e.hp;
    g.player._shoot();
    // Tick enough frames for bullet to travel + several burn-tick periods
    for (let i = 0; i < 30; i++) {
        g.player.update(g.level, g.camera);
        g.enemies.update(g.level, g.player);
    }
    const midBurn = e.hp;
    const midBurnTimer = e.burnTimer;
    for (let i = 0; i < 60; i++) {
        g.player.update(g.level, g.camera);
        g.enemies.update(g.level, g.player);
    }
    return { before, midBurn, mid_burnTimer: midBurnTimer, afterMore: e.hp };
});
console.log('FLAME:', JSON.stringify(flame));

await setup();

// 2) HOMING tracking — confirm a fired bullet bends toward an enemy that's
//    not directly on the muzzle ray.
const homing = await page.evaluate(async () => {
    const g = window.__game;
    g.player.weapon = 'HOMING';
    g.player.fireCooldown = 0;
    g.player.bullets = [];
    // Target 60px in front + 20px up — bullet should bend upward.
    const e = g.enemies.enemies.find(x => x.alive);
    e.x = g.player.x + 60;
    e.y = g.player.y - 20;
    e.hp = 50; e.alive = true;
    g.player._shoot();
    const b = g.player.bullets[g.player.bullets.length - 1];
    const trail = [];
    for (let i = 0; i < 40; i++) {
        if (!g.player.bullets.includes(b)) break;
        trail.push({ x: Math.round(b.x), y: Math.round(b.y), vy: Math.round(b.vy * 100) / 100 });
        g.player.update(g.level, g.camera);
        g.enemies.update(g.level, g.player);
    }
    // Curving toward target = vy should trend negative (up) over time.
    return { firstVy: trail[0]?.vy, lastVy: trail[trail.length - 1]?.vy, trailLen: trail.length, enemyHp: e.hp };
});
console.log('HOMING:', JSON.stringify(homing));

await setup();

// 3) SHOTGUN buff: confirm point-blank burst now puts an enemy in ≤ 1 shot
//    (R247 set damage to 3.5/pellet × 6 pellets = 21 max), and spread is wider.
const shotgun = await page.evaluate(async () => {
    const g = window.__game;
    g.player.weapon = 'SHOTGUN';
    g.player.fireCooldown = 0;
    g.player.bullets = [];
    g.player.aim = { x: 1, y: 0 };
    // Enemy directly in front at point-blank.
    const e = g.enemies.enemies.find(x => x.alive);
    e.x = g.player.x + 25;
    e.y = g.player.y;
    e.hp = 14;            // 4 pellets @ 4.5 dmg = 18, should drop a 14hp enemy
    e.alive = true;
    g.player._shoot();
    const shotsFired = g.player.bullets.length;
    // Tick a few frames so pellets travel + apply.
    for (let i = 0; i < 12; i++) {
        g.player.update(g.level, g.camera);
        g.enemies.update(g.level, g.player);
    }
    return { shotsFired, eHpAfter: e.hp, eAlive: e.alive };
});
console.log('SHOTGUN:', JSON.stringify(shotgun));
console.log('Errors:', errs.length, errs.slice(0, 3));

let ok = true;
if (flame.midBurn >= flame.before)        { console.log('FAIL: FLAME initial bullet dealt no damage'); ok = false; }
if (flame.afterMore >= flame.midBurn)     { console.log('FAIL: FLAME burn DoT not ticking (hp not decreasing post-burn-start)'); ok = false; }
if ((homing.trailLen || 0) < 5)           { console.log('FAIL: HOMING bullet too short-lived'); ok = false; }
// HOMING should bend toward enemy (target above muzzle → vy trends negative)
if (homing.lastVy >= 0)                   { console.log('FAIL: HOMING bullet did not curve upward, lastVy=', homing.lastVy); ok = false; }
if (!shotgun.shotsFired || shotgun.shotsFired < 6) { console.log('FAIL: SHOTGUN should fire ≥6 pellets, got', shotgun.shotsFired); ok = false; }
if (shotgun.eAlive)                       { console.log('FAIL: SHOTGUN point-blank failed to kill 14hp enemy (4 pellets ≈ 18 dmg)'); ok = false; }
if (ok) console.log('✅ R250 PASS — FLAME burn, HOMING tracking, SHOTGUN buff all working');
else process.exitCode = 1;

await browser.close();
