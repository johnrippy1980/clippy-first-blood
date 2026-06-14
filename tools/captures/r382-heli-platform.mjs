// R382b: capture stage 21 helicopter (it's a PLATFORMER stage, not beatem).
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/r382b';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('#screen');
await page.waitForTimeout(200);

await page.evaluate(() => window.__game._startStage(21));
await page.waitForTimeout(700);
for (let i = 0; i < 25; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(100);
}

// Force-spawn the chase helicopter
await page.evaluate(() => {
    const g = window.__game;
    if (!g.level || !g.player) return;
    g.player.x = 600;
    g.player.invuln = 9999;
    if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
    // Look at how enemies spawn — find any spawn pattern with HELICOPTER
    if (g._spawnBoss) g._spawnBoss();
});
await page.waitForTimeout(800);

for (let i = 0; i < 10; i++) {
    await page.screenshot({ path: `${OUT}/heli_${String(i).padStart(2,'0')}.png` });
    await page.waitForTimeout(120);
}

const diag = await page.evaluate(() => {
    const g = window.__game;
    // The HELICOPTER is a BOSS (BOSS_TEMPLATES.HELICOPTER), so it lives on
    // g.boss — not in the enemy manager. The manager's array is
    // g.enemies.enemies (g.enemies is the EnemyManager, not an array).
    const arr = g?.enemies?.enemies || [];
    const heli = (g?.boss && g.boss.kind === 'HELICOPTER') ? g.boss
        : arr.find(e => e.kind === 'HELICOPTER');
    return {
        scene: g.scene,
        enemyCount: arr.length,
        enemyKinds: arr.map(e => e.kind),
        boss: !!g.boss,
        bossKind: g.boss?.kind || null,
        heli: heli ? { x: heli.x, y: heli.y, w: heli.w, h: heli.h, hp: heli.hp } : null,
    };
});
console.log('stage 21 diag:', JSON.stringify(diag));
console.log(`Errors (${errs.length}):`);
errs.slice(0, 5).forEach(e => console.log('  ', e));
await browser.close();
