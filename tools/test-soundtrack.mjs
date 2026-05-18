// Verify soundtrack gallery renders and tracks can be selected/played.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__game.scene = 'play'; });

// Open pause → navigate to SOUNDTRACK
await page.keyboard.press('KeyP');
await page.waitForTimeout(150);
// SOUNDTRACK is the 4th option (RESUME, OPTIONS, ACHIEVEMENTS, SOUNDTRACK)
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(80);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(80);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(80);
await page.keyboard.press('KeyX');
await page.waitForTimeout(200);

await page.screenshot({ path: '/tmp/clippy-soundtrack.png' });
let state = await page.evaluate(() => ({
    scene: window.__game.scene,
    idx: window.__game.soundtrackIndex,
    playing: window.__game._soundtrackPlaying,
    track: window.__audio?.currentTrack,
}));
console.log('Opened soundtrack:', JSON.stringify(state));

// Play track 1
await page.keyboard.press('KeyX');
await page.waitForTimeout(300);
state = await page.evaluate(() => ({
    track: window.__audio?.currentTrack,
    playing: window.__game._soundtrackPlaying,
}));
console.log('After play:', JSON.stringify(state));
await page.screenshot({ path: '/tmp/clippy-soundtrack-playing.png' });

// Move to track 2
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(150);
await page.keyboard.press('KeyX');
await page.waitForTimeout(300);
state = await page.evaluate(() => ({
    idx: window.__game.soundtrackIndex,
    track: window.__audio?.currentTrack,
}));
console.log('After switch:', JSON.stringify(state));
await page.screenshot({ path: '/tmp/clippy-soundtrack-track2.png' });

console.log(`Errors: ${errs.length}`);
errs.forEach(e => console.log('  ' + e));
await browser.close();
