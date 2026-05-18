import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/polish-snaps', { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/polish-snaps/01-title.png' });

await page.click('#screen');
await page.waitForTimeout(300);
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(800);
await page.evaluate(() => { window.__game.scene = 'play'; window.__game.storyTimer = 0; });
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/polish-snaps/02-stage1-start.png' });

// Move right for a couple seconds
await page.evaluate(() => {
    const g = window.__game;
    g.player.vx = 1.5;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/polish-snaps/03-stage1-midrun.png' });

await browser.close();
console.log('done');
