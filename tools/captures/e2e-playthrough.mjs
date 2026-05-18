// E2E: stage 1 → kill all enemies + boss → stage_clear → card → stage 2 intro
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(800);
await page.evaluate(() => { window.__game.scene = 'play'; });

// Cheat-kill all enemies and force boss spawn
await page.evaluate(() => {
    const g = window.__game;
    g.player.hp = g.player.maxHp;
    g.player.iFrames = 9999;
    for (const e of g.enemies.enemies) { e.hp = 0; e.alive = false; }
    g.bossSpawned = false; g.miniBossSpawned = true;
    g.player.x = 58 * 16 - 4;
});
await page.waitForTimeout(300);

let s = await page.evaluate(() => {
    const g = window.__game;
    return { t: 'after_kill_all', scene: g.scene, x: Math.round(g.player.x), boss: g.boss ? { hp: g.boss.hp, alive: g.boss.alive } : null };
});
console.log(JSON.stringify(s));

// Cross the bossTrigger so the boss spawns
await page.evaluate(() => {
    const g = window.__game;
    g.player.x = g.level.data.bossTrigger.x + 16;
});
await page.waitForTimeout(600);

s = await page.evaluate(() => {
    const g = window.__game;
    return { t: 'after_cross_trigger', scene: g.scene, boss: g.boss ? { hp: g.boss.hp, alive: g.boss.alive } : null, bossSpawned: g.bossSpawned };
});
console.log(JSON.stringify(s));

// If boss spawned, kill it
await page.evaluate(() => {
    const g = window.__game;
    if (g.boss && g.boss.alive) {
        g.boss.hp = 0; g.boss.alive = false;
    }
});
await page.waitForTimeout(1500);

s = await page.evaluate(() => {
    const g = window.__game;
    return { t: 'after_boss_kill', scene: g.scene, storyTimer: g.storyTimer };
});
console.log(JSON.stringify(s));

// Wait for stage_clear input gate (storyTimer > 130)
await page.waitForTimeout(2500);
// Press X to advance through stage clear screen
await page.keyboard.press('KeyX');
await page.waitForTimeout(500);
s = await page.evaluate(() => {
    const g = window.__game;
    return { t: 'after_clear_X', scene: g.scene, pending: g._pendingStage, storyTimer: g.storyTimer };
});
console.log(JSON.stringify(s));
await page.screenshot({ path: '/tmp/e2e-card.png' });

// Wait inside card scene then press X to advance to stage_intro
await page.waitForTimeout(1500);
await page.keyboard.press('KeyX');
await page.waitForTimeout(800);
s = await page.evaluate(() => {
    const g = window.__game;
    return { t: 'after_card_X', scene: g.scene, currentStage: g.currentStage };
});
console.log(JSON.stringify(s));
await page.screenshot({ path: '/tmp/e2e-stage2-intro.png' });

console.log(`\nErrors: ${errs.length}`);
errs.forEach(e => console.log('  ERR: ' + e));
await browser.close();
