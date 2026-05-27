import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r542_intro';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE-ERR: ' + m.text()); });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
});
await page.evaluate(() => window.__game._startStage(25));
// Capture each scene as it transitions
const states = [];
for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => window.__game?.scene);
    if (states.length === 0 || states[states.length-1] !== s) {
        states.push(s);
        const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
        if (u) await fs.writeFile(`${OUT}/scene_${i.toString().padStart(2,'0')}_${s}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
    }
    if (s === 'turretPlay') break;
    if ((s === 'stageIntro' || s === 'stageCard') && i > 2) {
        await page.keyboard.press('KeyX');
    }
}
console.log('scene transitions:', states.join(' → '));
console.log('errors:', errors.length);
errors.forEach(e => console.log('  ', e));
await browser.close();
