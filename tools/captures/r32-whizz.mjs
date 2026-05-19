// Verify visual whizz streak: trigger near-miss, see _whizzed + particle spawn
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r32', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

await page.evaluate(async () => {
    const m = await import('/src/particles.js');
    window.__particles = m.particles;
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.transition = 0;
    g.player.iFrames = 99999;
});

// Count alive particles before
const before = await page.evaluate(() => {
    return (window.__particles?.pool || []).filter(p => p.alive).length;
});
console.log('particles alive before:', before);

// Inject an enemy bullet that flies past the player at near-miss range
await page.evaluate(async () => {
    const g = window.__game;
    const enemiesMod = await import('/src/enemies.js');
    const Bullet = enemiesMod.globalEnemyBullets.constructor;
    // Just create a bullet-shaped object since Bullet class is private —
    // push directly onto globalEnemyBullets (which gets ticked).
    const b = {
        x: g.player.x - 30,                  // 30px left
        y: g.player.y + g.player.h / 2 + 5,  // near head height
        vx: 4, vy: 0,
        prevX: g.player.x - 30,
        prevY: g.player.y + g.player.h / 2 + 5,
        dmg: 1, life: 60, color: '#ff5050',
        stuck: false, stuckLife: 0, stuckLifeMax: 20,
        update(level) {
            this.prevX = this.x; this.prevY = this.y;
            this.x += this.vx; this.y += this.vy; this.life--;
        },
        draw() {},
    };
    enemiesMod.globalEnemyBullets.push(b);
    // Mirror to enemyManager so tick picks it up
    g.enemies.bullets.push(b);
    window.__b = b;
});

// Wait for the bullet to fly past the player (30 / 4 = ~8 frames = 133ms)
await page.waitForTimeout(250);
const after = await page.evaluate(() => {
    const b = window.__b;
    const aliveCount = (window.__particles?.pool || []).filter(p => p.alive).length;
    const whiteParts = (window.__particles?.pool || []).filter(p => p.alive && p.color === '#ffffff').length;
    return { whizzed: b._whizzed, aliveCount, whiteParts, bx: b.x | 0 };
});
console.log('post:', JSON.stringify(after));
await page.screenshot({ path: '/tmp/r32/whizz.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
