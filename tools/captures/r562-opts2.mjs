import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => { window.__game.scene = 'options'; window.__game.optionsIndex = 0; });
await page.waitForTimeout(200);
// Press left 12 times on Master Volume
for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(60);
}
const opts = await page.evaluate(async () => {
    const o = (await import('/src/options.js')).options;
    return {
        masterVol: o.get('masterVol'),
        musicVol: o.get('musicVol'),
        sfxVol: o.get('sfxVol'),
    };
});
console.log('After 12 left on Master:', JSON.stringify(opts));
await browser.close();
