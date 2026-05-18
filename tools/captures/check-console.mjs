// Sample console output during one minute of simulated play to see if anything
// chatters or warns under normal conditions.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const lines = [];
page.on('pageerror', e => lines.push('ERROR: ' + e.message));
page.on('console', m => {
    if (m.type() !== 'log') lines.push(`${m.type().toUpperCase()}: ${m.text()}`);
});
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(500);

// Tick through stages 1-4 with a few seconds of simulated play in each
for (const stage of [1, 2, 3, 4]) {
    await page.evaluate(s => window.__game._startStage(s), stage);
    await page.waitForTimeout(2000);
}
console.log('--- console output during play ---');
for (const l of lines) console.log(l);
console.log(`(${lines.length} non-log messages)`);
await browser.close();
