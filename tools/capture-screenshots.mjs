// Headless screenshot capture for visual smoke-testing. Captures key game
// scenes after the painted-sprite upgrade rounds so we can eyeball what
// the player actually sees. Run once per round, compare against last round's
// captures to spot regressions.
//
// Writes to tools/screenshots/<scene>.png — gitignored.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const outDir = '/Users/jrippy/clippy-first-blood/tools/screenshots';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);

async function shot(name, setup) {
    await page.evaluate(setup);
    await page.waitForTimeout(400);
    await page.locator('#screen').screenshot({ path: `${outDir}/${name}.png` });
    console.log(`captured ${name}`);
}

// 1. Title screen
await shot('01-title', () => { window.__game.scene = 'title'; });

// 2. Mid-gameplay, stage 1
await shot('02-stage1-play', () => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
});

// 3. Grunt enemy close-up — stage 1 has folder enemies
await shot('03-grunt-folder', () => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    // Spawn a folder near the player
    g.enemies.spawn(g.player.x + 30, g.player.y, 'folder');
});

// 4. Boss spawn — first boss
await shot('04-boss-copier', () => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.player.x = (g.level.data.width - 6) * 16;
    g.camera.x = Math.max(0, g.player.x - 128);
    g._spawnBoss();
    g._finishBossIntro();
});

// 5. Stage 6 (founder) — visually distinct boss
await shot('05-boss-founder', () => {
    const g = window.__game;
    g._startStage(6);
    g.scene = 'play';
    g.player.x = (g.level.data.width - 6) * 16;
    g.camera.x = Math.max(0, g.player.x - 128);
    g._spawnBoss();
    g._finishBossIntro();
});

// 6. Final boss — algorithm
await shot('06-boss-algorithm', () => {
    const g = window.__game;
    g._startStage(8);
    g.scene = 'play';
    g.player.x = (g.level.data.width - 6) * 16;
    g.camera.x = Math.max(0, g.player.x - 128);
    g._spawnBoss();
    g._finishBossIntro();
});

// 7. Clippy back-dashing — verifies new v2_backdash.png in motion
await shot('07-clippy-backdash', () => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.player.state = 'backdash';
    g.player.backdashTimer = 12;
    g.player.facing = 1;
});

// 8. Clippy mid-air shooting — verifies new v2_jump_aim.png
await shot('08-clippy-jump-aim', () => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.player.state = 'jump';
    g.player.y -= 30;
    g.player.vy = 0;
    g.player.facing = 1;
    g.player.fireCooldown = 5;  // looks like just fired
});

await browser.close();
console.log('done — screenshots in', outDir);
