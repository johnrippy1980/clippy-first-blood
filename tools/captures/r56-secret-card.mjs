// Verify "SECRET FOUND" overlay renders on the secret stage-card moment
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r56', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Stage card with secret flag at three different timer points
async function snap(label, t) {
    await page.evaluate((time) => {
        const g = window.__game;
        if (!g.player) g._startStage(1);
        g._secretDiscoveryCard = true;
        g._pendingStage = 9;
        g.scene = 'stageCard';
        g.storyTimer = time;
    }, t);
    await page.waitForTimeout(120);
    await page.screenshot({ path: `/tmp/r56/${label}.png` });
}

await snap('early-flash', 8);
await snap('mid-label', 40);
await snap('held-label', 120);

// Without the flag, regular stage card should NOT show the overlay
await page.evaluate(() => {
    const g = window.__game;
    g._secretDiscoveryCard = false;
    g._pendingStage = 2;
    g.storyTimer = 40;
});
await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/r56/normal-card.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
