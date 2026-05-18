// Verify story sequence end-to-end and audio continuity.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'http://localhost:8765/';
const OUT = '/tmp/clippy-story';
await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', e => errs.push(`${e.message}`));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/00-boot.png` });

// First gesture
await page.click('#screen');
await page.waitForTimeout(600);

const audio0 = await page.evaluate(() => ({
    state: window.__audio?.ctx?.state,
    track: window.__audio?.currentTrack,
    paused: window.__audio?._fileEl?.paused,
    ct: window.__audio?._fileEl?.currentTime,
}));
console.log('Title after click:', JSON.stringify(audio0));
await page.screenshot({ path: `${OUT}/01-title.png` });

// Start story
await page.keyboard.press('KeyX');
await page.waitForTimeout(600);
const audio1 = await page.evaluate(() => ({
    track: window.__audio?.currentTrack,
    paused: window.__audio?._fileEl?.paused,
    ct: window.__audio?._fileEl?.currentTime,
}));
console.log('After start (story):', JSON.stringify(audio1));
await page.screenshot({ path: `${OUT}/02-story-page-1.png` });

// Advance through story pages (5 total — boardroom inserted as page 3)
for (let i = 0; i < 5; i++) {
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/03-story-page-${i + 2}.png` });
}

// Continue advancing — should reach stage_intro
await page.keyboard.press('KeyX');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/04-stage-intro.png` });

const audio2 = await page.evaluate(() => ({
    track: window.__audio?.currentTrack,
    paused: window.__audio?._fileEl?.paused,
    ct: window.__audio?._fileEl?.currentTime,
}));
console.log('After stage intro:', JSON.stringify(audio2));

// Wait for stage intro fade
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/05-play-start.png` });
const audio3 = await page.evaluate(() => ({
    scene: window.__game?.scene,
    track: window.__audio?.currentTrack,
    paused: window.__audio?._fileEl?.paused,
    ct: window.__audio?._fileEl?.currentTime,
}));
console.log('Play start:', JSON.stringify(audio3));

await browser.close();
console.log(`\nErrors: ${errs.length}`);
errs.slice(0,5).forEach(e => console.log('  ' + e));
console.log(`Screenshots in ${OUT}/`);
