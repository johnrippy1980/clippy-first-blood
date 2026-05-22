// R266: capture all 3 gallery tabs (scenes / enemies / bosses) to verify
// label wrapping + tab switching + thumbnail rendering.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r266', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(800);

await page.focus('#screen');
// Force-unlock everything so all tiles render with thumbnails
await page.evaluate(() => {
    window.__game.unlockedStage = 99;
    if (window.__game.achievements?.unlocked) {
        window.__game.achievements.unlocked.add('clear_game');
    }
});

// Open the gallery via direct scene switch
await page.evaluate(() => {
    window.__game.scene = 'gallery';
    window.__game._menuReturnScene = 'title';
    window.__game.galleryIndex = 0;
    window.__game.galleryTab = 'scenes';
});
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/r266/tab-1-scenes.png' });

// Press Tab to switch to enemies
await page.keyboard.down('Tab');
await page.waitForTimeout(80);
await page.keyboard.up('Tab');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/r266/tab-2-enemies.png' });

// Press Tab again to switch to bosses
await page.keyboard.down('Tab');
await page.waitForTimeout(80);
await page.keyboard.up('Tab');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/r266/tab-3-bosses.png' });

const finalState = await page.evaluate(() => ({
    scene: window.__game.scene,
    tab: window.__game.galleryTab,
}));
console.log('Final state:', JSON.stringify(finalState));
console.log('Errors:', errs.length);
errs.forEach(e => console.log('  ', e.slice(0, 140)));
await browser.close();
