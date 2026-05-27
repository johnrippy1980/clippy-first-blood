// R562: test options interactions + mute + volume sliders
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r562';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Enter Options menu
await page.evaluate(() => { window.__game.scene = 'options'; window.__game.optionsIndex = 0; });
await page.waitForTimeout(300);
await snap('01_options_top');

// Test: lower master volume to 0%
for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(80);
}
await page.waitForTimeout(200);
await snap('02_master_at_0');
const mv = await page.evaluate(async () => (await import('/src/options.js')).options.get('masterVolume'));
console.log('Master volume after 12 left:', mv);

// Cycle down 1 — music volume
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(100);
// Set music to 50%
for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(80);
}
const muv = await page.evaluate(async () => (await import('/src/options.js')).options.get('musicVolume'));
console.log('Music volume after 5 left:', muv);
await snap('03_music_50');

// Down to SFX, set to 0
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(100);
for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(60);
}
const sfx = await page.evaluate(async () => (await import('/src/options.js')).options.get('sfxVolume'));
console.log('SFX volume after 12 left:', sfx);

// Toggle scanlines
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(100);
await page.keyboard.press('KeyX');
await page.waitForTimeout(200);
const sl = await page.evaluate(async () => (await import('/src/options.js')).options.get('scanlines'));
console.log('Scanlines after toggle:', sl);
await snap('04_scanlines_off');

// Toggle CRT curve
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(100);
await page.keyboard.press('KeyX');
await page.waitForTimeout(200);
const crt = await page.evaluate(async () => (await import('/src/options.js')).options.get('crtCurve'));
console.log('CRT curve after toggle:', crt);
await snap('05_crt_off');

// MUTE test (M key)
console.log('\n=== MUTE TEST ===');
await page.keyboard.press('KeyM');
await page.waitForTimeout(200);
const muted1 = await page.evaluate(async () => (await import('/src/audio.js')).audio.muted);
console.log('After M press 1:', muted1);
await page.keyboard.press('KeyM');
await page.waitForTimeout(200);
const muted2 = await page.evaluate(async () => (await import('/src/audio.js')).audio.muted);
console.log('After M press 2:', muted2);

console.log('\n=== ERRORS ===');
console.log('errors:', errors.length);
errors.forEach(e => console.log('  ', e));
await browser.close();
