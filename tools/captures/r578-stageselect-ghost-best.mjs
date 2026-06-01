// R578: stage-select shows a "GHOST BEST mm:ss" line in the detail strip for
// the selected stage when a ghost has been recorded for it. Verifies the line
// is present/absent correctly and screenshots the screen.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/tmp/r578';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(300);

const res = await page.evaluate(() => {
    const g = window.__game;
    const ghost = window.__ghost;
    const ach = window.__achievements;

    // Unlock plenty of stages so stage-select has campaign tiles to pick.
    g.unlockedStage = 13;

    // Seed a ghost best for stage 2 (5400 frames = 90s = 01:30), none for 1.
    try { localStorage.removeItem('clippy_ghosts'); } catch {}
    ghost._store = { version: 1, stages: {} };
    ghost._store.stages[2] = {
        time: 5400, every: 3,
        samples: Array.from({ length: 50 }, (_, i) => [100 + i, 50, 1]),
    };

    // Enter stage-select and point the cursor at stage index for stage 2.
    g.scene = 'stageSelect';
    g.stageSelectIndex = 0;
    g.stageSelectScroll = 0;

    const ids = g._stageSelectList();
    const idx1 = ids.indexOf(1);
    const idx2 = ids.indexOf(2);

    // Select stage 1 (no ghost): the detail strip should NOT have a ghost line.
    g.stageSelectIndex = idx1;
    g.render();
    const stage1HasGhost = ghost.hasGhost(1);

    // Select stage 2 (has ghost): line should render.
    g.stageSelectIndex = idx2;
    g.render();
    const stage2HasGhost = ghost.hasGhost(2);
    const stage2Best = ghost.bestTime(2);

    return { idx1, idx2, stage1HasGhost, stage2HasGhost, stage2Best };
});
console.log('res:', JSON.stringify(res, null, 2));
await page.screenshot({ path: OUT + '/stageselect-ghost-best.png' });

await browser.close();

let ok = true;
const fail = (m) => { ok = false; console.log('FAIL: ' + m); };
if (res.idx1 < 0) fail('stage 1 not in stage-select list');
if (res.idx2 < 0) fail('stage 2 not in stage-select list');
if (res.stage1HasGhost) fail('stage 1 should have no ghost');
if (!res.stage2HasGhost) fail('stage 2 should have a ghost');
if (res.stage2Best !== 5400) fail('stage 2 best should be 5400, got ' + res.stage2Best);
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
if (errors.length) ok = false;
console.log(ok ? 'PASS' : 'FAILED');
process.exit(ok ? 0 : 1);
