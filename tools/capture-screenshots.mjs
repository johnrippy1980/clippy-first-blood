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

async function shot(name, setup, ...args) {
    await page.evaluate(setup, ...args);
    // 1200ms post-set so painted bg has 70+ frames to composite. The
    // earlier 400ms wait sometimes captured a black frame because the
    // first paint of a new stage hadn't run yet.
    await page.waitForTimeout(1200);
    await page.locator('#screen').screenshot({ path: `${outDir}/${name}.png` });
    console.log(`captured ${name}`);
}

// 1. Title screen
await shot('01-title', () => { window.__game.scene = 'title'; });

// 2. Mid-gameplay, stage 1
await shot('02-stage1-play', () => {
    const g = window.__game;
    g._startStage(1);
    g.transition = 0; g.transitionTarget = null;
    g.storyTimer = 9999;
    g.scene = 'play';
    g.stageTime = 180; // inside the controls-hint window
});

// 3. Grunt enemy close-up — stage 1 has folder enemies
await shot('03-grunt-folder', () => {
    const g = window.__game;
    g._startStage(1);
    g.transition = 0; g.transitionTarget = null;
    g.storyTimer = 9999;
    g.scene = 'play';
    // Spawn a folder near the player
    g.enemies.spawn(g.player.x + 30, g.player.y, 'folder');
});

// 4. Boss spawn — first boss. _startStage routes through STAGE_INTRO
// splash; bypass it so the screenshot lands on the actual boss room.
await shot('04-boss-copier', () => {
    const g = window.__game;
    g._startStage(1);
    g.transition = 0; g.transitionTarget = null;
    g.storyTimer = 9999;
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
    g.transition = 0; g.transitionTarget = null;
    g.storyTimer = 9999;
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
    g.transition = 0; g.transitionTarget = null;
    g.storyTimer = 9999;
    g.scene = 'play';
    g.player.x = (g.level.data.width - 6) * 16;
    g.camera.x = Math.max(0, g.player.x - 128);
    g._spawnBoss();
    g._finishBossIntro();
});

// Inter-stage cards — painted cinematic shown between stage clear and
// the next stage intro. Sample at storyTimer=120 so both dialog beats
// have animated in and the Ken-Burns pan is mid-travel.
for (const next of [2, 3, 4, 5, 6, 7, 8]) {
    await shot(`card-stage${next}`, (n) => {
        const g = window.__game;
        g._startStage(n - 1);  // load previous stage so currentStage is set
        g.transition = 0; g.transitionTarget = null;
        g._pendingStage = n;
        g.scene = 'stageCard';
        g.storyTimer = 120;
    }, next);
}

// 6a-6c. Boss-intro cinematic — painted backdrop + slide-in portrait +
// boss name + bark. Sample at age 70 so portrait has settled and dim
// is at peak. Stages 1, 6, 8 cover the three boss-intro plate styles
// (jungle copier, founder lair, cloud algorithm).
for (const stage of [1, 2, 3, 4, 5, 6, 7, 8]) {
    await shot(`bossintro-stage${stage}`, (s) => {
        const g = window.__game;
        g._startStage(s);
        g.transition = 0; g.transitionTarget = null;
        g.storyTimer = 9999;
        g._spawnBoss();
        // Fast-forward into the held middle frame (post slide-in, pre flash)
        if (g._bossIntro) g._bossIntro.age = 70;
    }, stage);
}

// 7. Clippy back-dashing — verifies new v2_backdash.png in motion
await shot('07-clippy-backdash', () => {
    const g = window.__game;
    g._startStage(1);
    g.transition = 0; g.transitionTarget = null;
    g.storyTimer = 9999;
    g.scene = 'play';
    g.player.state = 'backdash';
    g.player.backdashTimer = 12;
    g.player.facing = 1;
});

// 8. Clippy mid-air shooting — verifies new v2_jump_aim.png
await shot('08-clippy-jump-aim', () => {
    const g = window.__game;
    g._startStage(1);
    g.transition = 0; g.transitionTarget = null;
    g.storyTimer = 9999;
    g.scene = 'play';
    g.player.state = 'jump';
    g.player.y -= 30;
    g.player.vy = 0;
    g.player.facing = 1;
    g.player.fireCooldown = 5;  // looks like just fired
});

// 8a-8h. Per-weapon visual baseline — each weapon's procedural barrel
// renders distinctly so a pickup feels different from the previous one.
for (const w of ['MG', 'SHOTGUN', 'SPREAD', 'LASER', 'FLAME', 'HOMING', 'THUNDER', 'CHAINSAW']) {
    await shot(`weapon-${w.toLowerCase()}`, (weapon) => {
        const g = window.__game;
        g._startStage(1);
        g.transition = 0; g.transitionTarget = null;
        g.storyTimer = 9999;
        g.scene = 'play';
        g.player.weapon = weapon;
        g.player.weaponLevel = 1;
        g.player.facing = 1;
        // Aim ~30° down-right so the barrel reads at a recognizable angle
        g.player.aim = { x: 0.866, y: 0.5 };
        g.player.aimAngle = 0.5;
        g.player.fireCooldown = 5; // muzzle flash visible
        g.player.recoilTimer = 5;
    }, w);
}

// 9-13. Per-stage mid-play captures so every painted bg + tile theme +
// player position has a baseline. Used to catch regressions like the
// "stuck on cover" stage-2 freeze the user reported.
// Bypass the stage-intro splash + fade-transition state machine that
// _startStage routes through, jumping straight to PLAY.
for (const s of [2, 3, 5, 7, 8]) {
    await shot(`stage${s}-play`, (stage) => {
        const g = window.__game;
        g._startStage(stage);
        g.transition = 0;
        g.transitionTarget = null;
        g.storyTimer = 9999;
        g.scene = 'play';
    }, s);
}

// 14-18. Story cards 1-5 — every page execs see before the first stage
for (let p = 0; p < 5; p++) {
    await shot(`story-page${p + 1}`, (page) => {
        const g = window.__game;
        g.scene = 'story';
        g.storyPage = page;
        // Past-end storyTimer so typewriter is fully revealed for the screenshot
        g.storyTimer = 999;
    }, p);
}

// 19. Pause menu — execs may pause to ask a question
await shot('pause-menu', () => {
    const g = window.__game;
    g._startStage(1);
    g.transition = 0; g.transitionTarget = null;
    g.storyTimer = 9999;
    g.scene = 'pause';
    g.pauseIndex = 0;
    g._pauseAnim = 30; // skip the fade-in animation
});

// 20. Game-over screen — execs may see this if Clippy dies during demo
await shot('game-over', () => {
    const g = window.__game;
    g._startStage(1);
    g.transition = 0; g.transitionTarget = null;
    g.player.lives = 0;
    g.player.score = 4250;
    g.player.kills = 12;
    g.player.maxCombo = 6;
    g.totalTime = 1860;  // 31s
    g.runStats.stagesCleared.add(1);
    g.scene = 'gameOver';
    g.gameOverIndex = 0;
    g.storyTimer = 120;  // past panel + menu reveal threshold
});

// 21. Stage-clear panel — the payoff beat after killing boss 1
await shot('stage-clear', () => {
    const g = window.__game;
    g._startStage(1);
    g.transition = 0; g.transitionTarget = null;
    g.storyTimer = 9999;
    g.scene = 'stageClear';
    g._clearScheduled = true;
    g.stageStats = { kills: 12, deaths: 0, damageTaken: 1, secrets: 0, weaponDamage: { MG: 120 }, shotsFired: 45, totalEnemies: 14 };
    g.player.score = 12500;
});

await browser.close();
console.log('done — screenshots in', outDir);
