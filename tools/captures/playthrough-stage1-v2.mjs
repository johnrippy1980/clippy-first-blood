// V2 stage 1 playthrough — drives ALL stages: title → story → stage intro
// → real-ish gameplay → boss kill → stage clear panel → stage 2 card →
// stage 2 intro → death + game-over + countdown. Inspect each captured
// screenshot for layout, readability, animation issues.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/playthrough2', { recursive: true });

const errors = [];
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => { errors.push('PAGE: ' + e.message); console.error('PAGE ERROR:', e.message); });
page.on('console', m => { if (m.type() === 'error') { errors.push('CON: ' + m.text()); console.log('CON ERR:', m.text()); } });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const snap = (n, label) => page.screenshot({ path: `/tmp/playthrough2/${String(n).padStart(2,'0')}-${label}.png` });

await snap(1, 'title');

// Start game
await page.click('#screen');
await page.waitForTimeout(200);
await page.keyboard.press('x');
await page.waitForTimeout(600);
await snap(2, 'story-beat-1');

// Walk through all 4 story beats
for (let i = 0; i < 5; i++) {
    await page.keyboard.press('x');
    await page.waitForTimeout(400);
}
await snap(3, 'after-story');

// Should now be in stageIntro — capture at various beats
await page.waitForTimeout(50); await snap(4, 'intro-early');
await page.waitForTimeout(400); await snap(5, 'intro-mid');
await page.waitForTimeout(600); await snap(6, 'intro-late');

// Skip to play
await page.keyboard.press('x');
await page.waitForTimeout(800);
await snap(7, 'play-start');

// Play for real — bind to game loop running, drive right + shoot
// Skip the death issue from before by playing for a controlled duration
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(800);
await page.keyboard.down('x');
await page.waitForTimeout(2000);
await snap(8, 'play-midrun');
const midState = await page.evaluate(() => ({
    scene: window.__game.scene,
    playerX: window.__game.player?.x | 0,
    hp: window.__game.player?.hp,
    lives: window.__game.player?.lives,
    kills: window.__game.player?.kills,
    score: window.__game.player?.score,
    enemies: window.__game.enemies?.enemies.length,
}));
console.log('MIDRUN:', JSON.stringify(midState));

// Jump some
for (let i = 0; i < 4; i++) {
    await page.keyboard.press('z');
    await page.waitForTimeout(500);
}
await snap(9, 'play-after-jumps');

// Slide
await page.keyboard.down('ArrowDown');
await page.keyboard.press('z'); // slide
await page.waitForTimeout(200);
await snap(10, 'play-sliding');
await page.keyboard.up('ArrowDown');

// Drop input + give iframes + teleport near boss
await page.keyboard.up('ArrowRight');
await page.keyboard.up('x');
await page.evaluate(() => {
    const g = window.__game;
    const trig = g.level.data.bossTrigger || { x: (g.level.data.width - 6) * 16 };
    g.player.x = trig.x + 10;
    g.player.y = (g.level.data.height - 6) * 16;
    g.camera.x = Math.max(0, g.player.x - 128);
    g.player.iFrames = 99999;
    g.player.hp = g.player.maxHp;
});
await page.waitForTimeout(400);
await snap(11, 'pre-boss');
await page.waitForTimeout(800);
await snap(12, 'boss-spawn');

// Wait through entrance
await page.waitForTimeout(2000);
await snap(13, 'boss-fight');

// Force-kill boss step by step to trigger RAGE and death naturally
await page.evaluate(() => {
    const g = window.__game;
    if (g.boss) g.boss.hp = Math.ceil(g.boss.maxHp * 0.52);
});
await page.keyboard.down('x');
await page.waitForTimeout(500);
await snap(14, 'boss-near-rage');
await page.waitForTimeout(400);
await snap(15, 'boss-post-rage');

// Damage to <25% (low-HP boss bar tier)
await page.evaluate(() => {
    const g = window.__game;
    if (g.boss) g.boss.hp = Math.ceil(g.boss.maxHp * 0.20);
});
await page.waitForTimeout(200);
await snap(16, 'boss-low-hp');

// Final kill via hurt() so the boss properly dies
await page.evaluate(() => {
    const g = window.__game;
    if (g.boss && g.boss.alive) {
        // Apply enough damage to actually kill via the proper path
        g.boss.hurt(g.boss.hp, 1, {});
    }
});
await page.keyboard.up('x');
await page.waitForTimeout(400);
await snap(17, 'boss-killed');

// Stage clear sequence
const clearStamps = [500, 1500, 2800, 4200, 5500];
for (let i = 0; i < clearStamps.length; i++) {
    const delta = i === 0 ? clearStamps[0] : clearStamps[i] - clearStamps[i - 1];
    await page.waitForTimeout(delta);
    await snap(18 + i, 'clear-' + clearStamps[i]);
}

const clearState = await page.evaluate(() => ({
    scene: window.__game.scene,
    storyTimer: window.__game.storyTimer,
}));
console.log('CLEAR STATE:', JSON.stringify(clearState));

// Advance to stage card
await page.keyboard.press('x');
await page.waitForTimeout(500);
await snap(23, 'stage-card-early');
await page.waitForTimeout(1500);
await snap(24, 'stage-card-mid');

await browser.close();
console.log('ERRORS:', errors.length);
if (errors.length) for (const e of errors) console.log('  ', e);
