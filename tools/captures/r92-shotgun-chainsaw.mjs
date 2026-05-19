// Verify SHOTGUN fires a cone of 6+ pellets, and CHAINSAW damages an
// enemy in melee range without spawning a projectile.
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
    const g = window.__game;
    g.scene = 'play';
    try { g._startStage(1); } catch (e) { /* */ }
    await new Promise(r => setTimeout(r, 200));

    const p = g.player;
    p.facing = 1;
    p.aim = { x: 1, y: 0 };
    p.fireCooldown = 0;

    // SHOTGUN test — fire once, count pellets
    p.weapon = 'SHOTGUN';
    p.weaponLevel = 1;
    p.bullets.length = 0;
    p._shoot();
    const shotgunPellets = p.bullets.length;
    const allShotgun = p.bullets.every(b => b.weapon === 'SHOTGUN');

    // CHAINSAW test — drop a test enemy in melee range, fire, verify dmg
    p.weapon = 'CHAINSAW';
    p.weaponLevel = 1;
    p.bullets.length = 0;
    p.fireCooldown = 0;
    const muzzle = p._muzzleWorldPos();
    const testEnemy = {
        x: p.x + 10, y: p.y, w: 14, h: 14,
        alive: true,
        hpBefore: 5, hp: 5,
        hurt(dmg) { this.hp -= dmg; if (this.hp <= 0) { this.alive = false; return true; } return false; },
    };
    g.enemies.enemies.push(testEnemy);
    p._shoot();
    const chainsawProjectiles = p.bullets.length;
    const enemyDamaged = testEnemy.hp < testEnemy.hpBefore;
    // Remove test enemy so we don't crash render (it has no .draw)
    g.enemies.enemies.splice(g.enemies.enemies.indexOf(testEnemy), 1);

    return {
        shotgunPellets,
        allShotgun,
        chainsawProjectiles,
        enemyHpBefore: 5,
        enemyHpAfter: testEnemy.hp,
        enemyDamaged,
    };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

const ok = errors.length === 0
    && result.shotgunPellets >= 6
    && result.allShotgun
    && result.chainsawProjectiles === 0
    && result.enemyDamaged;
process.exit(ok ? 0 : 1);
