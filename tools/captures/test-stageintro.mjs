// Capture stage intro reveal at multiple animation frames.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
// Use stage 4 — boardroom — for variety
await page.evaluate(() => {
    const g = window.__game;
    g.currentStage = 4;
    g.scene = 'stageIntro';
    g.storyTimer = 80;  // post-full-reveal
});
await page.waitForTimeout(80);
await page.evaluate(() => { window.__game.storyTimer = 80; });
await page.waitForTimeout(40);
await page.screenshot({ path: '/tmp/clippy-stageintro.png' });

// Mid-animation frame
await page.evaluate(() => { window.__game.storyTimer = 35; });
await page.waitForTimeout(60);
await page.screenshot({ path: '/tmp/clippy-stageintro-mid.png' });

await browser.close();
console.log('Saved /tmp/clippy-stageintro*.png');
