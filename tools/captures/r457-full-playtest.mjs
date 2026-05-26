// R457: full-game traversal — boot every stage, check for errors, missing
// assets, soft-locks, frame-time spikes. Log everything in one report.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r457';
await fs.mkdir(OUT, { recursive: true });

const errors = [];
const warnings = [];
const stats = {};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
page.on('pageerror', e => errors.push(`PAGE ERROR: ${e.message}`));
page.on('console', m => {
    if (m.type() === 'error') errors.push(`CONSOLE ERROR: ${m.text()}`);
    if (m.type() === 'warning' && !m.text().includes('AudioContext') && !m.text().includes('willReadFrequently')) {
        warnings.push(`CONSOLE WARN: ${m.text()}`);
    }
});
page.on('response', r => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`);
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);
// Konami unlock so all stages available
await page.evaluate(() => { window.__game._konamiUnlocked = true; window.__game.unlockedStage = 22; });

const stages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

for (const n of stages) {
    const t0 = Date.now();
    await page.evaluate((s) => window.__game._startStage(s), n);
    await page.waitForTimeout(1800);
    // Skip past intro/ready
    for (let i = 0; i < 12; i++) {
        const s = await page.evaluate(() => window.__game?.scene);
        if (['play', 'beatPlay', 'fpsPlay', 'doomPlay'].includes(s)) break;
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(180);
    }
    await page.waitForTimeout(600);
    // Sample frame state
    const data = await page.evaluate(() => {
        const g = window.__game;
        return {
            scene: g.scene,
            hasLevel: !!g.level,
            hasPlayer: !!g.player,
            hasDoom: !!g._doomEngine,
            hasBeat: !!g._beatEmUp,
            hasFps: !!g._fpsArena,
            stageData: g.level?.data?.name || g._doomEngine?.data?.name || g._fpsArena?.data?.name || g._beatEmUp?.data?.name || '?',
            currentStage: g.currentStage,
        };
    });
    const loadMs = Date.now() - t0;
    stats[n] = { ...data, loadMs };
    // Capture screenshot
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/s${String(n).padStart(2, '0')}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    // Sanity checks
    if (!['play', 'beatPlay', 'fpsPlay', 'doomPlay'].includes(data.scene)) {
        errors.push(`Stage ${n}: scene stuck at "${data.scene}"`);
    }
    if (data.scene === 'play' && !data.hasLevel) errors.push(`Stage ${n}: PLAY scene but no level`);
    if (data.scene === 'doomPlay' && !data.hasDoom) errors.push(`Stage ${n}: doomPlay but no _doomEngine`);
    console.log(`s${n}: ${JSON.stringify(data)} (${loadMs}ms)`);
}

console.log('\n=== ERRORS ===');
errors.forEach(e => console.log('  ❌ ' + e));
if (!errors.length) console.log('  ✅ none');
console.log('\n=== WARNINGS ===');
warnings.slice(0, 10).forEach(w => console.log('  ⚠ ' + w));
if (!warnings.length) console.log('  ✅ none');

await fs.writeFile(`${OUT}/report.json`, JSON.stringify({ stages: stats, errors, warnings }, null, 2));
console.log(`\nReport: ${OUT}/report.json`);
await browser.close();
