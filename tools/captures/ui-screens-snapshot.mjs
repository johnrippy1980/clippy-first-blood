import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r165', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(800);

const scenes = ['title', 'achievements', 'options', 'soundtrack', 'stageSelect', 'gameOver'];
for (const s of scenes) {
    await page.evaluate(async (sn) => {
        const g = window.__game;
        if (g.player) {
            g.player.score = 12345;
            g.player.kills = 42;
        }
        g.totalTime = 7200;
        g.scene = sn;
        if (sn === 'gameOver') g.lives = 0;
        await new Promise(r => setTimeout(r, 200));
    }, s);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/r165/${s}.png` });
}
await browser.close();
