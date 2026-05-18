// Capture 6 sequential frames during run to verify animation cycles.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__game.scene = 'play'; });
await page.waitForTimeout(400);

const cBox = await page.locator('#screen').boundingBox();

// Walk right continuously
await page.keyboard.down('ArrowRight');

for (let i = 1; i <= 6; i++) {
    await page.waitForTimeout(180);
    const f = await page.evaluate(() => {
        const p = window.__game.player;
        return { state: p.state, animFrame: p.animFrame, vx: p.vx };
    });
    console.log(`frame ${i}:`, JSON.stringify(f));
    await page.screenshot({
        path: `/tmp/clippy-anim-${i}.png`,
        clip: { x: cBox.x + cBox.width * 0.3, y: cBox.y + cBox.height * 0.5, width: 200, height: 200 },
    });
}

await page.keyboard.up('ArrowRight');
await browser.close();
