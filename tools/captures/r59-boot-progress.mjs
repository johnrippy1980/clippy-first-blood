// Verify boot-screen progress bar renders at varying %
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r59', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Force boot scene and varying load %
async function snap(label, done, total) {
    await page.evaluate(([d, t]) => {
        const g = window.__game;
        g.scene = 'boot';
        g.bootTimer = 30;
        g.assetsReady = false;
        // Override sprites counters
        import('/src/sprites.js').then(({ sprites }) => {
            sprites.settledAssets = d;
            sprites.totalAssets = t;
        });
    }, [done, total]);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `/tmp/r59/${label}.png` });
}

await snap('0pct', 0, 50);
await snap('30pct', 15, 50);
await snap('80pct', 40, 50);

// Ready state — bar should be hidden
await page.evaluate(() => {
    const g = window.__game;
    g.assetsReady = true;
    g.scene = 'boot';
    g.bootTimer = 30;
});
await page.waitForTimeout(150);
await page.screenshot({ path: '/tmp/r59/ready-no-bar.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
