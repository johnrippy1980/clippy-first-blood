// Force an achievement unlock during play and verify the banner renders.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(800);
await page.evaluate(() => { window.__game.scene = 'play'; });
await page.waitForTimeout(200);

// Push a fake banner to the queue with mid-fade-in age
await page.evaluate(async () => {
    const { achievements } = await import('/src/achievements.js');
    achievements.banner.push({ id: 'first_blood', age: 30 });
});
await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/clippy-banner.png' });

console.log(`Errors: ${errs.length}`);
errs.forEach(e => console.log('  ' + e));
await browser.close();
console.log('Saved /tmp/clippy-banner.png');
