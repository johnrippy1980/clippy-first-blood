// R369: comprehensive visual audit of every game state.
// For each of: title, story beats, all stage entries, all boss fights
// in-progress, pause, options, stage-clear, game-over, epilogue.
// Outputs to /tmp/clippy-audit/<category>/<name>.png.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/clippy-audit';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();

const errs = [];
page.on('pageerror', e => errs.push(`PAGE: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errs.push(`CONSOLE: ${m.text()}`); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

const cats = ['00-title-story', '10-stages', '20-bosses', '30-menus', '40-flow'];
for (const c of cats) await fs.mkdir(`${OUT}/${c}`, { recursive: true });

await page.click('#screen');
await page.waitForTimeout(200);

// ===== 00-title-story =====
await page.evaluate(() => { window.__game.scene = 'title'; });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/00-title-story/00-title.png` });

// Main menu (press X from title)
await page.evaluate(() => { window.__game.scene = 'mainMenu'; window.__game.menuIndex = 0; });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/00-title-story/01-mainmenu.png` });

// Story sequence — visit each panel
for (let i = 0; i < 5; i++) {
    await page.evaluate((idx) => {
        const g = window.__game;
        g.scene = 'story';
        g.storyIndex = idx;
        g.storyTimer = 600;   // skip past type-in
    }, i);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/00-title-story/story-${i}.png` });
}

// ===== 10-stages =====
const stages = Array.from({ length: 22 }, (_, i) => i + 1);
for (const stage of stages) {
    await page.evaluate(n => window.__game?._startStage(n), stage);
    await page.waitForTimeout(600);
    // Mash through intro / ready
    await page.evaluate(() => {
        const g = window.__game;
        if (g && g._bossIntro) g._bossIntro.autoAdvance = true;
    });
    for (let i = 0; i < 10; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'fpsPlay' || s === 'beatPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(160);
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/10-stages/stage-${String(stage).padStart(2, '0')}.png` });
    // Action snapshot — walk right, shoot
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('KeyX');
    await page.waitForTimeout(800);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('KeyX');
    await page.screenshot({ path: `${OUT}/10-stages/stage-${String(stage).padStart(2, '0')}-action.png` });
}

// ===== 20-bosses (snap boss fights in progress) =====
const bosses = [
    { stage: 1,  name: 'copier' },
    { stage: 2,  name: 'shredder' },
    { stage: 3,  name: 'ctrl-alt-del' },
    { stage: 4,  name: 'spindler' },
    { stage: 5,  name: 'ballmer' },
    { stage: 8,  name: 'gates' },
    { stage: 11, name: 'clippy-2' },
    { stage: 12, name: 'gauntlet' },
    { stage: 13, name: 'algorithm' },
    { stage: 18, name: 'jobs' },
    { stage: 21, name: 'helicopter' },
    { stage: 22, name: 'mecha-gates' },
];
for (const b of bosses) {
    await page.evaluate(n => window.__game?._startStage(n), b.stage);
    await page.waitForTimeout(500);
    // Skip intro
    await page.evaluate(() => {
        const g = window.__game;
        if (g && g._bossIntro) g._bossIntro.autoAdvance = true;
    });
    for (let i = 0; i < 12; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'fpsPlay' || s === 'beatPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(150);
    }
    // Force boss spawn
    await page.evaluate(() => {
        const g = window.__game;
        if (g?.player && g?.level?.data?.bossTrigger?.x) {
            g.player.x = g.level.data.bossTrigger.x + 4;
            if (g.camera?.snapTo) g.camera.snapTo(g.player.x, g.player.y);
            if (typeof g._spawnBoss === 'function') {
                try { g._spawnBoss(); } catch (e) {}
            }
        }
        // Beat-em-up: skip to a wave that has the boss
        const beat = g?._beatEmUp;
        if (beat) {
            // Jump to the boss wave (penultimate or last)
            const waves = beat.data.waves || [];
            let bossWave = waves.findIndex(w => w.spawns?.some(s => s.isBoss));
            if (bossWave >= 0) {
                beat.scroll = (beat.data.stageWidth || 1024) - 256;
                beat.waveIdx = bossWave;
                beat._spawnWave?.(bossWave);
            }
        }
    });
    // Auto-advance boss intro again post-spawn
    await page.evaluate(() => {
        const g = window.__game;
        if (g && g._bossIntro) g._bossIntro.autoAdvance = true;
    });
    for (let i = 0; i < 15; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (s === 'play' || s === 'fpsPlay' || s === 'beatPlay') break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/20-bosses/${b.name}.png` });
}

// ===== 30-menus =====
const menuScenes = [
    ['pause',         () => { window.__game.scene = 'pause'; window.__game.pauseIndex = 0; }],
    ['options',       () => { window.__game.scene = 'options'; window.__game.optionsIndex = 0; }],
    ['achievements',  () => { window.__game.scene = 'achievements'; window.__game.achievementsIndex = 0; }],
    ['soundtrack',    () => { window.__game.scene = 'soundtrack'; }],
    ['gallery',       () => { window.__game.scene = 'gallery'; }],
    ['stageSelect',   () => {
        const g = window.__game; const ach = window.__achievements;
        g._konamiUnlocked = true;
        ach?.unlocked.add('clear_game');
        ach.stats.secretStageDiscovered = true;
        g.scene = 'stageSelect';
        g.stageSelectIndex = 0;
    }],
];
for (const [name, fn] of menuScenes) {
    await page.evaluate(fn);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/30-menus/${name}.png` });
}

// ===== 40-flow (stage-clear, game-over, game-complete, epilogue) =====
const flows = [
    ['game-over', () => {
        const g = window.__game;
        g.scene = 'gameOver';
        g.gameOverIndex = 0;
        g.storyTimer = 100;
    }],
    ['game-complete', () => {
        const g = window.__game;
        g.scene = 'gameComplete';
        g.storyTimer = 100;
    }],
    ['epilogue', () => {
        const g = window.__game;
        g.scene = 'epilogue';
        g.epilogueIndex = 0;
        g.storyTimer = 200;
    }],
];
for (const [name, fn] of flows) {
    await page.evaluate(fn);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/40-flow/${name}.png` });
}

console.log(`Errors (${errs.length}):`);
errs.slice(0, 8).forEach(e => console.log(' ', e));
console.log('Screenshots in', OUT);
await browser.close();
