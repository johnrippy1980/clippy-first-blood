// Verify THUNDER weapon hit-scans along the aim ray rather than firing
// straight down. Spawn an enemy directly in front of Clippy, fire THUNDER,
// and confirm the bullet's hit point lands ON the enemy.
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
    // Force horizontal aim and give Clippy the THUNDER weapon
    p.weapon = 'THUNDER';
    p.facing = 1;
    p.aim = { x: 1, y: 0 };
    p.fireCooldown = 0;
    p.bullets.length = 0;

    // Drop a test enemy 60 px ahead of Clippy, same Y as muzzle
    const muzzle = p._muzzleWorldPos();
    const enemyX = muzzle.x + 60;
    const enemyY = muzzle.y - 8;
    const testEnemy = { x: enemyX, y: enemyY, w: 16, h: 16, alive: true };
    g.enemies.enemies.push(testEnemy);

    p._shoot();
    const b = p.bullets[p.bullets.length - 1];
    if (!b) {
        g.enemies.enemies.splice(g.enemies.enemies.indexOf(testEnemy), 1);
        return { ok: false, msg: 'no bullet spawned' };
    }
    // Remove the plain-object test enemy so the render loop doesn't call .draw on it
    g.enemies.enemies.splice(g.enemies.enemies.indexOf(testEnemy), 1);

    return {
        ok: true,
        weapon: b.weapon,
        muzzleX: muzzle.x,
        muzzleY: muzzle.y,
        enemyX, enemyY,
        boltX: b.boltX,
        boltY: b.boltY,
        bulletX: b.x,
        bulletY: b.y,
        chainStartX: b.chainStartX,
        chainStartY: b.chainStartY,
        // Bolt should land inside the test enemy AABB
        bolt_in_enemy: b.boltX >= enemyX && b.boltX <= enemyX + 16 && b.boltY >= enemyY && b.boltY <= enemyY + 16,
        // Bolt must NOT just sit at the muzzle (the old broken behavior)
        moved_from_muzzle: Math.abs(b.boltX - muzzle.x) > 8,
        // Bolt must NOT have fallen straight down (old visual bug — boltY << muzzle.y + 200)
        not_straight_down: !(Math.abs(b.boltX - muzzle.x) < 4 && b.boltY > muzzle.y + 20),
    };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));

const ok = errors.length === 0
    && result.ok
    && result.bolt_in_enemy
    && result.moved_from_muzzle
    && result.not_straight_down;
process.exit(ok ? 0 : 1);
