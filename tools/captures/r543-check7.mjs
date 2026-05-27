import { chromium } from 'playwright';
import fs from 'fs/promises';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
});
await page.evaluate(() => window.__game._startStage(7));
await page.waitForTimeout(500);
for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(150);
    const sc = await page.evaluate(() => window.__game?.scene);
    const tr = await page.evaluate(() => window.__game?.transition);
    if (tr > 0) continue;
    if (sc === 'beatPlay') break;
    if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') {
        await page.keyboard.press('KeyX');
    }
}
console.log('settled scene:', await page.evaluate(() => window.__game?.scene));
console.log('beatMode:', await page.evaluate(() => window.__game?._beatMode));
console.log('beatEmUp exists:', await page.evaluate(() => !!window.__game?._beatEmUp));
console.log('bgImg loaded:', await page.evaluate(() => !!window.__game?._beatEmUp?.bgImg));
console.log('errors:', errors.length);
errors.forEach(e => console.log('  ', e));
// Wait more, snap
await page.waitForTimeout(2000);
const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile('/tmp/r543/stage_07_retry.png', Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
await browser.close();
