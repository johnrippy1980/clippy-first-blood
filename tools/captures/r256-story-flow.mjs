// R256: capture title → story flow + story slides + stage cards.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r256', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(800);

// Title screen (no menu open)
await page.screenshot({ path: '/tmp/r256/01-title.png' });

await page.focus('#screen');
async function tap(key) {
    await page.keyboard.down(key);
    await page.waitForTimeout(60);
    await page.keyboard.up(key);
}

// Open menu, snap, then start
await tap('x');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/r256/02-menu.png' });

// Confirm "START GAME"
await tap('x');
await page.waitForTimeout(800);
// Snap each story slide
for (let i = 1; i <= 5; i++) {
    await page.screenshot({ path: `/tmp/r256/03-story-${i}.png` });
    await tap('x');
    await page.waitForTimeout(600);
}

// Stage card / READY
await page.screenshot({ path: '/tmp/r256/04-stage-or-ready.png' });
await tap('x');
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/r256/05-next.png' });

const state = await page.evaluate(() => ({ scene: window.__game.scene }));
console.log('Final scene:', state.scene);
console.log('Errors:', errs.length, errs.slice(0, 3));
await browser.close();
