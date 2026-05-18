// Verify the boardroom story page renders the painted bitmap, not the procedural fallback.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'story';
    g.storyPage = 2;          // boardroom page
    g.storyTimer = 120;       // past the X TO CONTINUE delay
});
// Settle, then re-pin storyPage right before the screenshot in case a stray
// input.isPressed('shoot') from the page.click leaked into _tickStory.
await page.waitForTimeout(200);
await page.evaluate(() => { window.__game.storyPage = 2; window.__game.storyTimer = 120; });
await page.waitForTimeout(60);
const state = await page.evaluate(() => ({
    scene: window.__game.scene,
    page: window.__game.storyPage,
}));
console.log('Story state:', JSON.stringify(state));
await page.screenshot({ path: '/tmp/clippy-story-boardroom.png' });
await browser.close();
console.log('Saved /tmp/clippy-story-boardroom.png');
