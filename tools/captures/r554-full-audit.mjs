// R554: fresh-eyes full game audit
// 1) Visit every play scene in detail
// 2) Exercise input (walk, jump, shoot, pause)
// 3) Watch console for ANY errors or warnings
// 4) Snapshot mid-play to catch visual bugs
// 5) Test edge cases (pause, unpause, scene transitions)

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r554';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const issues = [];
const warns = [];
page.on('pageerror', e => issues.push({ kind: 'PAGE_ERR', msg: e.message, stack: e.stack }));
page.on('console', m => {
    if (m.type() === 'error') issues.push({ kind: 'CONSOLE_ERR', msg: m.text() });
    else if (m.type() === 'warn' && !m.text().includes('DevTools')) warns.push(m.text());
});
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
});

async function snap(label) {
    try {
        const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
        if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
    } catch (e) {}
}

async function exerciseStage(stage, label) {
    const startErrs = issues.length;
    await page.evaluate((s) => window.__game._startStage(s), stage);
    // Drain initial transition
    await page.waitForTimeout(600);
    for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(120);
        const sc = await page.evaluate(() => window.__game?.scene);
        const tr = await page.evaluate(() => window.__game?.transition > 0);
        if (tr) continue;
        if (sc === 'play' || sc === 'fpsPlay' || sc === 'beatPlay' || sc === 'doomPlay' || sc === 'turretPlay') {
            break;
        }
        if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready' || sc === 'bossIntro') {
            await page.keyboard.press('KeyX');
        }
    }
    await page.waitForTimeout(800);   // let render settle
    await snap(`${label}_settled`);

    // Exercise input — walk, jump, shoot
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('KeyX');   // shoot
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyX');
    await page.keyboard.press('Space'); // jump
    await page.waitForTimeout(200);
    await snap(`${label}_active`);

    // Pause + unpause
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(200);
    await snap(`${label}_paused`);
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(200);

    const newErrs = issues.slice(startErrs);
    return { stage, label, errors: newErrs };
}

const report = [];
// Cover ALL play-scene types
const targets = [
    [1,  '01_jungle'],
    [2,  '02_breakroom'],
    [3,  '03_serverroom'],
    [4,  '04_pipeline'],
    [5,  '05_boardroom'],
    [6,  '06_ballmer_office_fps'],
    [7,  '07_ballmer_arena_brawler'],
    [8,  '08_keynote'],
    [9,  '09_keynote_corridor_fps'],
    [10, '10_gates_arena'],
    [11, '11_founder'],
    [12, '12_bossrush'],
    [13, '13_cloud'],
    [14, '14_recyclebin'],
    [15, '15_training'],
    [16, '16_floor11_doom'],
    [17, '17_timetrial'],
    [18, '18_rdf_jobs'],
    [19, '19_core_breach_fps'],
    [20, '20_mecha_approach_brawler'],
    [21, '21_mecha_corridor'],
    [22, '22_mecha_gates_brawler'],
    [23, '23_block11_doom'],
    [24, '24_bossrushmode'],
    [25, '25_holdtheline_turret'],
];
for (const [n, lbl] of targets) {
    process.stdout.write(`Stage ${n} (${lbl})... `);
    const r = await exerciseStage(n, lbl);
    report.push(r);
    process.stdout.write(`${r.errors.length} new error(s)\n`);
}

console.log('\n=== AGGREGATE REPORT ===');
let totalErrors = 0;
for (const r of report) {
    if (r.errors.length > 0) {
        console.log(`\n• Stage ${r.stage} ${r.label}:`);
        for (const e of r.errors) {
            console.log(`   [${e.kind}] ${e.msg.substring(0, 200)}`);
            totalErrors++;
        }
    }
}
console.log(`\nTotal new console errors during exercise: ${totalErrors}`);
console.log(`Total warnings: ${warns.length}`);
if (warns.length > 0) {
    console.log('First 5 warnings:');
    warns.slice(0, 5).forEach(w => console.log('  ', w.substring(0, 200)));
}
await browser.close();
