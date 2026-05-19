// Full stage 1 playthrough capture: title → story → stage intro → mid-run →
// mini-boss → boss → boss kill → stage clear → stage card. Captures the
// sequence so I can review whether the *combination* of all the polish reads
// cleanly, not just the individual pieces.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/playthrough', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CON ERR:', m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/playthrough/01-title.png' });

// Start game
await page.click('#screen');
await page.waitForTimeout(200);
await page.keyboard.press('x');
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/playthrough/02-story.png' });

// Skip through story
for (let i = 0; i < 6; i++) {
    await page.keyboard.press('x');
    await page.waitForTimeout(220);
}
await page.screenshot({ path: '/tmp/playthrough/03-stage-intro.png' });
await page.keyboard.press('x');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/playthrough/04-stage-start.png' });

// Get a real state read
const state1 = await page.evaluate(() => ({
    scene: window.__game.scene,
    playerX: window.__game.player?.x | 0,
    playerHp: window.__game.player?.hp,
    enemies: window.__game.enemies?.enemies.length,
}));
console.log('AFTER INTRO:', JSON.stringify(state1));

// Just start moving right + shoot continuously
await page.keyboard.down('ArrowRight');
await page.keyboard.down('x');
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/playthrough/05-running.png' });

await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/playthrough/06-mid-run.png' });

// Jump a few times
for (let i = 0; i < 3; i++) {
    await page.keyboard.press('z');
    await page.waitForTimeout(700);
}
await page.screenshot({ path: '/tmp/playthrough/07-after-jumps.png' });

// Capture state again
const state2 = await page.evaluate(() => ({
    scene: window.__game.scene,
    playerX: window.__game.player?.x | 0,
    playerHp: window.__game.player?.hp,
    kills: window.__game.player?.kills,
    score: window.__game.player?.score,
    enemies: window.__game.enemies?.enemies.length,
}));
console.log('AFTER 4S RUN:', JSON.stringify(state2));

// Just place at boss spawn position and force boss
await page.keyboard.up('ArrowRight');
await page.keyboard.up('x');
await page.waitForTimeout(100);
await page.evaluate(() => {
    const g = window.__game;
    const exit = g.level.data.exit || { x: (g.level.data.width - 4) * 16, y: 0 };
    g.player.x = exit.x - 200;
    g.player.y = (g.level.data.height - 6) * 16;
    g.camera.x = Math.max(0, g.player.x - 100);
});
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/playthrough/08-near-boss.png' });

// Force-spawn boss directly
await page.evaluate(() => {
    const g = window.__game;
    // Trigger boss
    if (!g.bossSpawned) {
        const boss = g.enemies.spawnBoss(g.player.x + 80, (g.level.data.height - 6) * 16 + 32, 'COPIER_3000');
        g.boss = boss;
        g.bossSpawned = true;
        g._bossEntrance = { kind: 'full', age: 0 };
    }
});
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/playthrough/09-boss-entrance.png' });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/playthrough/10-boss-fight.png' });

// Fire at boss for a while
await page.keyboard.down('x');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/playthrough/11-boss-mid.png' });

// Force half-HP to trigger RAGE
await page.evaluate(() => {
    const g = window.__game;
    if (g.boss) g.boss.hp = Math.ceil(g.boss.maxHp * 0.51);
});
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/playthrough/12-boss-pre-rage.png' });
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/playthrough/13-boss-post-rage.png' });

// Force kill boss
await page.evaluate(() => {
    const g = window.__game;
    if (g.boss) g.boss.hp = 0;
});
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/playthrough/14-boss-dead.png' });

// Stage clear sequence
const stamps = [1000, 2200, 3500, 5000];
for (let i = 0; i < stamps.length; i++) {
    const delta = i === 0 ? stamps[0] : stamps[i] - stamps[i - 1];
    await page.waitForTimeout(delta);
    await page.screenshot({ path: `/tmp/playthrough/15-clear-${stamps[i]}.png` });
}

await page.keyboard.up('x');
const final = await page.evaluate(() => ({
    scene: window.__game.scene,
    score: window.__game.player?.score,
    storyTimer: window.__game.storyTimer,
}));
console.log('FINAL:', JSON.stringify(final));

await browser.close();
