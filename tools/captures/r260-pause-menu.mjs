// R260: capture pause menu mid-gameplay to verify HUD-hide + framing.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r260', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);
await page.focus('#screen');

async function tap(key) {
    await page.keyboard.down(key);
    await page.waitForTimeout(60);
    await page.keyboard.up(key);
}
// Boot through to gameplay
for (let i = 0; i < 8; i++) { await tap('x'); await page.waitForTimeout(500); }

// Play for a moment so kills+score accumulate
await page.keyboard.down('ArrowRight');
await page.keyboard.down('x');
await page.waitForTimeout(2000);
await page.keyboard.up('ArrowRight');
await page.keyboard.up('x');

// Pause
await tap('p');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/r260/pause.png' });

const state = await page.evaluate(() => ({ scene: window.__game.scene }));
console.log('Scene:', state.scene);
console.log('Errors:', errs.length, errs.slice(0, 3));
await browser.close();
