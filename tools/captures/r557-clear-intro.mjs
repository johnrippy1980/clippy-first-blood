// R557: snap stage clear panels + boss intros across stage types
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r557';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
});

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

async function enterStage(stage) {
    await page.evaluate((s) => window.__game._startStage(s), stage);
    await page.waitForTimeout(600);
    for (let i = 0; i < 50; i++) {
        await page.waitForTimeout(120);
        const sc = await page.evaluate(() => window.__game?.scene);
        const tr = await page.evaluate(() => window.__game?.transition > 0);
        if (tr) continue;
        if (sc === 'play' || sc === 'fpsPlay' || sc === 'beatPlay' || sc === 'doomPlay' || sc === 'turretPlay') break;
        if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready' || sc === 'bossIntro') {
            await page.keyboard.press('KeyX');
        }
    }
    await page.waitForTimeout(400);
}

async function snapClearPanel(stage, label) {
    await enterStage(stage);
    // Stuff fake stats to make the panel look real
    await page.evaluate(() => {
        const g = window.__game;
        g.stageStats = { kills: 14, deaths: 1, damageTaken: 2, secrets: 1, weaponDamage: {MG: 80}, shotsFired: 42 };
        g.runStats = g.runStats || {};
        g.player.score = 12450;
        g.player.kills = 14;
        g.player.maxCombo = 7;
        g._onStageClear();
    });
    // Step through the 5-beat animation
    for (const t of [60, 105, 150, 220, 320]) {
        await page.evaluate((tt) => { window.__game.storyTimer = tt; }, t);
        await page.waitForTimeout(150);
        await snap(`${label}_clearT${t}`);
    }
}

console.log('Stage 3 (platformer) clear...');
await snapClearPanel(3, '01_stage3');
console.log('Stage 25 (turret) clear...');
await snapClearPanel(25, '02_stage25');
console.log('Stage 7 (brawler) clear...');
await snapClearPanel(7, '03_stage7');

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ', e));
await browser.close();
