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
// Stage 4 first
await page.evaluate(() => window.__game._startStage(4));
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(120);
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'play') break;
    if (s === 'stageIntro' || s === 'stageCard' || s === 'ready') {
        await page.keyboard.press('KeyX');
    }
}
console.log('after stage 4 init:', await page.evaluate(() => window.__game?.scene));
console.log('after stage 4 turretMode:', await page.evaluate(() => window.__game?._turretMode));
console.log('after stage 4 turretArena:', await page.evaluate(() => !!window.__game?._turretArena));

// Now stage 25
await page.evaluate(() => window.__game._startStage(25));
await page.waitForTimeout(200);
console.log('after stage 25 init scene:', await page.evaluate(() => window.__game?.scene));
console.log('after stage 25 init turretMode:', await page.evaluate(() => window.__game?._turretMode));
console.log('after stage 25 init turretArena:', await page.evaluate(() => !!window.__game?._turretArena));
console.log('after stage 25 init pendingPlay:', await page.evaluate(() => window.__game?._turretPendingPlay));
console.log('current stage:', await page.evaluate(() => window.__game?.currentStage));

const states = [];
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(120);
    const s = await page.evaluate(() => window.__game?.scene);
    if (states.length === 0 || states[states.length-1] !== s) states.push(s);
    if (s === 'turretPlay') break;
    if (s === 'stageIntro' || s === 'stageCard' || s === 'ready') {
        await page.keyboard.press('KeyX');
    }
}
console.log('25 transitions:', states.join(' → '));
console.log('errors:', errors.length);
errors.forEach(e => console.log('  ', e));
await browser.close();
