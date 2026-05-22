// R245: verify LASER bullet pierces multiple enemies in a row.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);

const result = await page.evaluate(async () => {
    const g = window.__game;
    g._startStage(1);
    g.storyTimer = 999;
    g.scene = 'play';
    await new Promise(r => setTimeout(r, 300));
    g.scene = 'play';
    g.bossSpawned = true;

    g.player.weapon = 'LASER';
    g.player.facing = 1;
    g.player.x = 80;
    g.player.y = g.level.height - 48;
    g.player.aim = { x: 1, y: 0 };
    g.player.fireCooldown = 0;
    g.player.bullets = [];

    // Line up 3 enemies along the ray, ~20px apart.
    const enemies = g.enemies.enemies.filter(e => e.alive).slice(0, 3);
    if (enemies.length < 3) return { error: 'need 3 enemies, got ' + enemies.length };
    for (let i = 0; i < 3; i++) {
        enemies[i].x = g.player.x + 40 + i * 20;
        enemies[i].y = g.player.y;
        enemies[i].hp = 100;
        enemies[i].alive = true;
    }

    const before = enemies.map(e => e.hp);
    g.player._shoot();
    const bulletCountAfterShoot = g.player.bullets.length;
    // Bullet needs to TRAVEL (player update advances bullet.x), then enemy
    // update checks for collision against each bullet's current position.
    for (let i = 0; i < 60; i++) {
        g.player.update(g.level, g.camera);
        g.enemies.update(g.level, g.player);
    }
    const after = enemies.map(e => e.hp);
    return {
        before, after, dmg: before.map((b, i) => b - after[i]),
        bulletsAfterShoot: bulletCountAfterShoot,
        bulletsAfterTicks: g.player.bullets.length,
    };
});
console.log(JSON.stringify(result, null, 2));
console.log('Errors:', errs.length, errs.slice(0, 3));

let ok = true;
if (!result.dmg) { console.log('FAIL: no dmg array'); ok = false; }
else {
    // Each of the 3 enemies should have taken damage (piercing works).
    for (let i = 0; i < 3; i++) {
        if ((result.dmg[i] || 0) <= 0) { console.log(`FAIL: enemy ${i} took no damage`); ok = false; }
    }
}
if (ok) console.log('✅ R245 PASS — LASER pierces multiple enemies');
else process.exitCode = 1;

await browser.close();
