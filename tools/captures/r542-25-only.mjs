import { chromium } from 'playwright';
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
const states = [];
for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => window.__game?.scene);
    if (states.length === 0 || states[states.length-1] !== s) states.push(s);
    if (s === 'turretPlay') break;
    if (s === 'stageIntro' || s === 'stageCard' || s === 'ready') {
        await page.keyboard.press('KeyX');
    }
}
console.log('transitions:', states.join(' → '));
console.log('errors:', errors.length);
errors.forEach(e => console.log('  ', e));
await browser.close();
