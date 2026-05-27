// R543: full programmatic campaign scan. Visits every stage, force-clears,
// watches for console errors + verifies the next stage loads cleanly.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r543';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const allErrors = [];
const perStageIssues = {};
page.on('pageerror', e => allErrors.push({ stage: 'unknown', msg: 'PAGE: ' + e.message + '\n' + (e.stack || '') }));
page.on('console', m => {
    if (m.type() === 'error') allErrors.push({ stage: 'unknown', msg: 'CONSOLE: ' + m.text() });
});
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
});

const stages = [1, 2, 3, 25, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
                14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

async function tryEnterStage(stage) {
    const issues = [];
    const errCountBefore = allErrors.length;
    await page.evaluate((s) => window.__game._startStage(s), stage);

    // Wait for any of the play scenes (try multiple frames + skip cards).
    // R543 fix: drain any active transition before sampling. _startStage
    // queues a fade-to-STAGE_INTRO that takes ~30 frames to commit. If we
    // sample scene during that drain we see the PREVIOUS stage's scene
    // (=='play') and incorrectly conclude the stage launched into the
    // platformer when it's actually mid-transition to fpsPlay/beatPlay/etc.
    let finalScene = null;
    // Hard 500ms wait to drain the initial transition window
    await page.waitForTimeout(500);
    for (let i = 0; i < 50; i++) {
        await page.waitForTimeout(120);
        const s = await page.evaluate(() => window.__game?.scene);
        const inTransition = await page.evaluate(() => window.__game?.transition > 0);
        if (inTransition) continue;   // wait for transition to settle
        if (s === 'play' || s === 'fpsPlay' || s === 'beatPlay' ||
            s === 'doomPlay' || s === 'turretPlay') {
            finalScene = s;
            break;
        }
        if (s === 'stageIntro' || s === 'stageCard' || s === 'ready') {
            await page.keyboard.press('KeyX');
        }
    }
    if (!finalScene) {
        const s = await page.evaluate(() => window.__game?.scene);
        issues.push(`Did not reach play scene; ended on '${s}'`);
    }
    // Snap
    try {
        const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
        if (u) await fs.writeFile(`${OUT}/stage_${String(stage).padStart(2,'0')}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
    } catch (e) { issues.push('snap failed: ' + e.message); }

    // Tag any new errors with this stage
    for (let i = errCountBefore; i < allErrors.length; i++) {
        allErrors[i].stage = String(stage);
    }
    const errsForThisStage = allErrors.slice(errCountBefore);
    if (errsForThisStage.length > 0) {
        issues.push(`${errsForThisStage.length} console error(s)`);
    }
    return { stage, finalScene, issues, errors: errsForThisStage };
}

const report = [];
for (const s of stages) {
    process.stdout.write(`Stage ${s}... `);
    const r = await tryEnterStage(s);
    report.push(r);
    process.stdout.write(`scene=${r.finalScene || 'NONE'} issues=${r.issues.length}\n`);
}

console.log('\n=== REPORT ===');
for (const r of report) {
    if (r.issues.length === 0) {
        console.log(`  Stage ${r.stage}: OK (${r.finalScene})`);
    } else {
        console.log(`  Stage ${r.stage}: ${r.issues.join(', ')}`);
        for (const e of r.errors) console.log('      ', e.msg);
    }
}
console.log(`\nTotal errors: ${allErrors.length}`);
await browser.close();
