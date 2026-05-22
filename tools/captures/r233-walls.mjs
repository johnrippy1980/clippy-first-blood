// R233: capture stage 1's new tutorial wall + shimmer effect. Park the
// camera at the wall and screenshot a few frames so the shimmer cycle
// is visible across the sequence.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r233', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(800);

// Walk player to the stage 1 tutorial wall (x=30 tiles, h-3) so the
// wall sits center-screen.
const TILE = 16;
const wallX = 30 * TILE;
await page.evaluate(async (wx) => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    await new Promise(r => setTimeout(r, 200));
    g._stageIntro = null;
    g.scene = 'play';
    // Teleport player right next to the wall
    g.player.x = wx - 24;
    g.player.y = g.level.height - 48;
    g.camera.follow(g.player, g.player.facing);
    g.camera.x = g.camera.targetX;
}, wallX);
await page.waitForTimeout(300);

// Snapshot at 0ms, 500ms, 1000ms, 1500ms — the shimmer should sweep
// across the brick over these frames.
for (let i = 0; i < 4; i++) {
    await page.screenshot({ path: `/tmp/r233/wall-${i}.png` });
    await page.waitForTimeout(500);
}

// Walls report — count walls on stages 1..9 to confirm placement
const report = await page.evaluate(() => {
    const g = window.__game;
    const out = [];
    for (let s = 1; s <= 9; s++) {
        try {
            g._startStage(s);
            const data = g.level?.data;
            const walls = data?.wallSpawns || [];
            out.push({ stage: s, walls: walls.length, drops: walls.map(w => w.drop) });
        } catch (e) {
            out.push({ stage: s, error: String(e).slice(0, 80) });
        }
    }
    return out;
});
console.log(JSON.stringify(report, null, 2));
console.log('Errors:', errs.length, errs.slice(0, 3));
await browser.close();
