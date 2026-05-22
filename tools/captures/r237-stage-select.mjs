// R237: capture stage-select grid + soundtrack screen + achievements to
// audit the menu-side polish.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r237', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);

const screens = [
    ['stageSelect', 'stage-select'],
    ['soundtrack',  'soundtrack'],
    ['achievements','achievements'],
    ['sceneGallery','scene-gallery'],
    ['options',     'options'],
];
for (const [scene, name] of screens) {
    await page.evaluate((s) => {
        const g = window.__game;
        g.scene = s;
        g._menuReturnScene = 'mainMenu';
    }, scene);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/r237/${name}.png` });
}
console.log('Errors:', errs.length, errs.slice(0, 3));
await browser.close();
