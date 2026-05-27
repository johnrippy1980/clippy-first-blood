import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r560';
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

// Snap each stage's intro card by triggering stage 1 → onStageClear → which queues stage 2's card
async function snapStageCard(currentStage, nextStage, label) {
    await page.evaluate((s) => window.__game._startStage(s), currentStage);
    await page.waitForTimeout(500);
    // Skip into PLAY
    for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(120);
        const sc = await page.evaluate(() => window.__game?.scene);
        if (sc === 'play' || sc === 'fpsPlay' || sc === 'beatPlay' || sc === 'doomPlay' || sc === 'turretPlay') break;
        if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') await page.keyboard.press('KeyX');
    }
    // Force STAGE_CARD scene with nextStage
    await page.evaluate((ns) => {
        window.__game._pendingStage = ns;
        window.__game.storyTimer = 0;
        window.__game.scene = 'stageCard';
    }, nextStage);
    // Step into the card animation
    await page.evaluate(() => { window.__game.storyTimer = 60; });
    await page.waitForTimeout(200);
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Snap cards for several key stages
await snapStageCard(1, 2, '02_breakroom');
await snapStageCard(2, 3, '03_serverroom');
await snapStageCard(3, 25, '25_holdtheline');
await snapStageCard(25, 4, '04_pipeline');
await snapStageCard(4, 23, '23_block11');
await snapStageCard(23, 5, '05_boardroom');
await snapStageCard(11, 12, '12_bossrush');
await snapStageCard(13, 14, '14_recyclebin');

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ', e));
await browser.close();
