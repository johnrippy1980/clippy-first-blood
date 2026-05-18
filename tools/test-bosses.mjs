// Spawn each boss on its stage and screenshot.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/clippy-bosses';
await fs.mkdir(OUT, { recursive: true });

const STAGES_AND_BOSSES = [
    [1, 'COPIER_3000'],
    [2, 'SHREDDER'],
    [3, 'CTRL_ALT_DEL'],
    [4, 'BALLMER'],
    [5, 'GATES'],
    [6, 'CLIPPY_2'],
    [8, 'ALGORITHM'],
];

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', e => errs.push(`${e.message}`));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

for (const [stage, boss] of STAGES_AND_BOSSES) {
    await page.evaluate(([s, b]) => {
        const g = window.__game;
        g._startStage(s);
    }, [stage, boss]);
    await page.waitForTimeout(2200);
    await page.evaluate((b) => {
        const g = window.__game;
        g.scene = 'play';
        // Push player past boss trigger so boss spawns
        g.player.x = g.level.data.bossTrigger.x + 16;
        g.bossSpawned = false;  // re-arm so spawnBoss fires
    }, boss);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/boss-${stage}-${boss}.png` });
}

await browser.close();
console.log(`Errors: ${errs.length}`);
errs.slice(0, 8).forEach(e => console.log('  ' + e));
console.log(`Screenshots in ${OUT}/`);
