import { chromium } from 'playwright';
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
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(120);
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'beatPlay') break;
    if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') await page.keyboard.press('KeyX');
}
const track = await page.evaluate(async () => {
    const a = (await import('/src/audio.js')).audio;
    return a.currentTrack;
});
console.log('Stage 7 track:', track, '(expected sweat)');
// Total manifest count
const total = await page.evaluate(async () => {
    const m = await import('/src/constants.js');
    return m.TRACK_MANIFEST.length;
});
console.log('Manifest size:', total);
console.log('errors:', errors.length);
errors.forEach(e => console.log('  ', e));
await browser.close();
