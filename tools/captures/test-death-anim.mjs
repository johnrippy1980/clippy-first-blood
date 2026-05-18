// Visual capture of the death animation across multiple frames.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/death-anim', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.click('#screen');
await page.waitForTimeout(300);
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(800);
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g.storyTimer = 0;
    g.player.x = 32 * 16;
    g.player.y = (g.level.data.height - 6) * 16;
    g.camera.x = Math.max(0, g.player.x - 128);
});
await page.waitForTimeout(400);
// Kill Clippy
await page.evaluate(() => window.__game.player.kill());
// Capture every 10 frames for the first 90 frames of death anim
const frames = [0, 100, 250, 500, 800, 1200];
for (const ms of frames) {
    await page.waitForTimeout(Math.max(0, ms - (frames.indexOf(ms) > 0 ? frames[frames.indexOf(ms) - 1] : 0)));
    await page.screenshot({ path: `/tmp/death-anim/t-${ms}.png` });
}
const final = await page.evaluate(() => ({
    state: window.__game.player.state,
    deathTimer: window.__game.player.deathTimer,
    isDead: window.__game.player.isDead(),
}));
console.log('final:', JSON.stringify(final));
await browser.close();
