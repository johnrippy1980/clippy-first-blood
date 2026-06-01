// V2 stage 1 playthrough — drives the full cinematic chain: title → main menu
// → story → stage intro → real-ish gameplay → boss kill → stage clear panel →
// stage card. Inspect each captured screenshot for layout, readability, and
// animation issues. Also asserts the scene at each phase so a broken transition
// fails loudly instead of silently screenshotting the wrong screen.
//
// R592: made SCENE-DRIVEN. The old version used fixed waitForTimeout delays and
// a hard-coded "press x 5 times" loop to clear the story. When the story grew
// longer those fixed counts left the script still in `story` while it pressed on
// into gameplay steps — screenshotting the wrong scene and only "working" by
// accident. Now every transition polls window.__game.scene: we tap the advance
// key until the scene actually changes, and assert we landed where expected.
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

const snap = (n, label) => page.screenshot({ path: `/tmp/playthrough2/${String(n).padStart(2, '0')}-${label}.png` });
const scene = () => page.evaluate(() => window.__game?.scene);

// Poll the scene until it equals `target` (or any of `target` if array), up to
// `budgetMs`. Returns the scene actually seen. Throws on timeout so a broken
// transition fails the run rather than silently proceeding.
const waitForScene = async (target, budgetMs = 6000) => {
    const targets = Array.isArray(target) ? target : [target];
    const deadline = Date.now() + budgetMs;
    let s = await scene();
    while (!targets.includes(s) && Date.now() < deadline) {
        await page.waitForTimeout(100);
        s = await scene();
    }
    if (!targets.includes(s)) {
        throw new Error(`waitForScene timed out: wanted ${targets.join('|')}, stuck at "${s}"`);
    }
    return s;
};

// --- TITLE ---
await waitForScene('title');
await snap(1, 'title');

// Title → main menu (press start), then pick START GAME → story.
await page.click('#screen');
await page.waitForTimeout(200);
await page.keyboard.press('x');
// Title may go straight to story OR via the main menu panel — handle both.
let s = await waitForScene(['mainMenu', 'story']);
if (s === 'mainMenu') {
    await snap(2, 'main-menu');
    // START GAME is the top item and selected by default; confirm it.
    await page.keyboard.press('x');
    s = await waitForScene('story');
}
await snap(3, 'story-beat-1');

// --- STORY (variable number of beats) ---
// Tap x through a couple of beats so we capture the typewriter mid-story, then
// use the built-in SKIP-ALL (P/pause) to jump straight to stage 1 rather than
// hard-counting pages. Each story page needs up to TWO x presses (first snaps
// the typewriter reveal to full, second advances) — counting them is brittle as
// the story grows, so skip-all is the robust path here.
await page.keyboard.press('x');
await page.waitForTimeout(250);
await page.keyboard.press('x');
await page.waitForTimeout(250);
await snap(3, 'story-mid');

// SKIP-ALL the story (P/pause jumps straight to stage 1), then capture the
// stageIntro card if we pass through it, then advance to play. We poll the
// scene the whole way rather than counting presses, so story length can change
// freely. driveToScene taps a key until the live scene reaches a target set.
const driveToScene = async (key, targets, { maxTaps = 30, gap = 160 } = {}) => {
    const want = Array.isArray(targets) ? targets : [targets];
    let cur = await scene();
    for (let i = 0; i < maxTaps && !want.includes(cur); i++) {
        await page.keyboard.press(key);
        await page.waitForTimeout(gap);
        cur = await scene();
    }
    return cur;
};

// Story → (stageIntro | ready | play). P skips the whole story in one press,
// but it routes through a fade to stageIntro that takes ~30 frames to land, so
// give the poll generous settle time (the skip itself is instant, the scene
// readout lags behind the fade).
s = await driveToScene('p', ['stageIntro', 'ready', 'play'], { maxTaps: 6, gap: 500 });
console.log('left story → scene:', s);
await snap(4, 'after-story');

if (s === 'stageIntro') {
    await snap(5, 'intro-early');
    await page.waitForTimeout(400);
    await snap(6, 'intro-mid');
}

// stageIntro/ready → play. X advances both the intro card and the READY card;
// each transition fades, so keep gaps comfortably above the fade length.
s = await driveToScene('x', 'play', { maxTaps: 12, gap: 400 });
console.log('entering play → scene:', s);
await waitForScene('play', 6000);
await snap(7, 'play-start');

// --- REAL GAMEPLAY ---
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
if (midState.scene !== 'play') errors.push('MIDRUN scene was not play: ' + midState.scene);

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

// Drop input + give iframes + teleport near boss trigger.
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

// Boss should spawn (scene may shift to bossIntro then back to play). Wait for
// either the boss object to exist or a bossIntro cinematic.
let bs = await waitForScene(['play', 'bossIntro'], 4000);
await page.waitForTimeout(600);
await snap(12, 'boss-spawn');

// If the bossIntro cinematic is up (villain slide → Clippy counter), capture it
// then run it to completion via the engine's test escape hatch (autoAdvance)
// rather than hand-timing key presses through its two phases.
if (bs === 'bossIntro') {
    await snap(13, 'boss-intro-cinematic');
    await page.evaluate(() => { if (window.__game._bossIntro) window.__game._bossIntro.autoAdvance = true; });
    // Cinematic ends by finishing into play with the boss spawned.
    await waitForScene('play', 6000);
    await page.waitForTimeout(400);
}
// Now in the live fight. Wait for the boss object to actually exist.
await page.waitForTimeout(800);
await page.evaluate(async () => {
    const g = window.__game;
    for (let i = 0; i < 60 && !g.boss; i++) await new Promise(r => requestAnimationFrame(r));
});
await snap(13, 'boss-fight');

// Force-kill boss step by step to trigger RAGE, then a clean death.
await page.evaluate(() => {
    const g = window.__game;
    if (g.boss) g.boss.hp = Math.ceil(g.boss.maxHp * 0.52);
});
await page.keyboard.down('x');
await page.waitForTimeout(500);
await snap(14, 'boss-near-rage');
await page.waitForTimeout(400);
await snap(15, 'boss-post-rage');

await page.evaluate(() => {
    const g = window.__game;
    if (g.boss) g.boss.hp = Math.ceil(g.boss.maxHp * 0.20);
});
await page.waitForTimeout(200);
await snap(16, 'boss-low-hp');

await page.evaluate(() => {
    const g = window.__game;
    if (g.boss && g.boss.alive) g.boss.hurt(g.boss.hp, 1, {});
});
await page.keyboard.up('x');
await page.waitForTimeout(400);
await snap(17, 'boss-killed');

// --- STAGE CLEAR --- (poll for it rather than guessing the kill→clear delay)
const clearScene = await waitForScene(['stageClear', 'stageCard'], 8000);
console.log('clear scene:', clearScene);
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

// Advance to the painted stage card.
await page.keyboard.press('x');
await page.waitForTimeout(500);
await snap(23, 'stage-card-early');
await page.waitForTimeout(1500);
await snap(24, 'stage-card-mid');

await browser.close();
console.log('ERRORS:', errors.length);
if (errors.length) for (const e of errors) console.log('  ', e);
process.exit(errors.length ? 1 : 0);
