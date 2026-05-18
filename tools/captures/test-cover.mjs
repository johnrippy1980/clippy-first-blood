// Position Clippy next to each themed cover tile, capture screenshots.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');

async function shot(stage, playerCol, label) {
    await page.evaluate((s) => window.__game._startStage(s), stage);
    await page.waitForTimeout(800);
    await page.evaluate(([col]) => {
        const g = window.__game;
        g.scene = 'play';
        // Block boss spawning so the screen doesn't dim out
        g.bossSpawned = true;
        g.miniBossSpawned = true;
        g.boss = null;
        g.player.x = col * 16;
        g.player.y = (g.level.data.height - 4) * 16;
        g.player.vx = 0;
        g.player.vy = 0;
        // Snap camera centered on the cover tile
        g.camera.viewX = Math.max(0, col * 16 - 128);
        g.camera.viewY = Math.max(0, (g.level.data.height - 14) * 16);
    }, [playerCol]);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `/tmp/clippy-cover-${label}.png` });
    console.log('shot', label);
}

// Modified covers placed inside the stage builder near the listed columns.
// For each stage, set the camera to look at the cover-tile column directly
// rather than relying on _startStage's spawn point.
await shot(1, 19, 'jungle');       // tree at col 19
await shot(2, 24, 'breakroom');    // vending machine at col 24
await shot(3, 16, 'serverroom');   // server rack at col 16
await shot(4, 46, 'boardroom');    // door at col 46 (past mini-boss trigger)
await shot(5, 24, 'keynote');      // podium at col 24
await shot(6, 52, 'founder');      // crimson statue at col 52
await shot(8, 24, 'cloud');        // floating data pillar at col 24

await browser.close();
