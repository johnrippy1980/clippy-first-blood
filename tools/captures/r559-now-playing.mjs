import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
    window.__game.scene = 'soundtrack';
    window.__game.soundtrackIndex = 0;
});
await page.waitForTimeout(300);
// Hit X to start playing track 1 (DREAM)
await page.keyboard.press('KeyX');
await page.waitForTimeout(400);
// Scroll down 10 tracks
for (let i = 0; i < 10; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);
}
const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile('/tmp/r559_now_playing.png', Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
const current = await page.evaluate(async () => {
    const a = (await import('/src/audio.js')).audio;
    return a.currentTrack;
});
console.log('Current track after scroll:', current);
await browser.close();
