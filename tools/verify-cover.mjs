// Verify each cover-tile placement renders correctly in its stage.
// Pans the camera to each cover-tile column, captures screenshot.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');

// Stage → list of cover columns from level.js placements
const COVER_LAYOUT = {
    1: [19, 44],
    2: [24, 52],
    3: [16, 56],
    4: [46, 60],
    5: [24, 60],
    6: [52],
    8: [24, 48],
};

async function snap(stage, col) {
    await page.evaluate((s) => window.__game._startStage(s), stage);
    await page.waitForTimeout(800);
    await page.evaluate(([col]) => {
        const g = window.__game;
        g.scene = 'play';
        g.bossSpawned = true; g.miniBossSpawned = true; g.boss = null;
        // Place player AT the cover so cam tracks it. Camera typically follows
        // player so this is the most natural way to frame the cover tile.
        g.player.x = col * 16 - 8;
        g.player.y = (g.level.data.height - 2) * 16 - g.player.h;
        g.player.vx = 0; g.player.vy = 0;
        // Directly set camera to center on cover
        g.camera.x = Math.max(0, col * 16 - 128 + 8);
        g.camera.y = Math.max(0, (g.level.data.height - 14) * 16);
    }, [col]);
    // Let one frame run so camera follow + sprite render settle
    await page.waitForTimeout(120);
    const file = `/tmp/cover-stage${stage}-col${col}.png`;
    await page.screenshot({ path: file });
    console.log(`saved ${file}`);
}

for (const [stage, cols] of Object.entries(COVER_LAYOUT)) {
    for (const col of cols) {
        await snap(Number(stage), col);
    }
}
await browser.close();
