// Verify audio plays after user gesture. Reports both the audio element state
// and the AudioContext state at multiple points.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const audioWarns = [];
page.on('console', m => {
    const t = m.text();
    if (/autoplay|blocked|NotAllowedError/i.test(t)) audioWarns.push(t);
});

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const beforeGesture = await page.evaluate(() => {
    const g = window.__game;
    return {
        scene: g?.scene,
        ctxState: g?.audio || undefined,
    };
});
console.log('BEFORE gesture:', JSON.stringify(beforeGesture));

// Trigger a real user gesture
await page.click('#screen');
await page.waitForTimeout(800);

const afterClick = await page.evaluate(() => {
    // Find audio modules via game
    const a = window.__audio || null;
    return {
        ctxExists: !!a?.ctx,
        ctxState: a?.ctx?.state,
        track: a?.currentTrack,
        elPaused: a?._fileEl?.paused,
        elCurrentTime: a?._fileEl?.currentTime,
    };
});
console.log('AFTER click:', JSON.stringify(afterClick));

await page.keyboard.press('KeyX');
await page.waitForTimeout(700);

const afterX = await page.evaluate(() => {
    const a = window.__audio || null;
    return {
        ctxState: a?.ctx?.state,
        track: a?.currentTrack,
        elPaused: a?._fileEl?.paused,
        elCurrentTime: a?._fileEl?.currentTime,
    };
});
console.log('AFTER X:', JSON.stringify(afterX));

console.log(`Audio warnings: ${audioWarns.length}`);
for (const w of audioWarns) console.log('  ' + w);
await browser.close();
