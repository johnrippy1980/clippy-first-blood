// R408: reach stage 22 wave 6 boss, kill it, see if wave 7 chains.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r408';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errs = [];
const logs = [];
page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') errs.push(t);
    if (t.includes('[beatem]')) logs.push(t);
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');
await page.waitForTimeout(500);
await page.evaluate(() => window.__game._startStage(22));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'beatPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
// Walk naturally through waves 0-6, killing all enemies at each wave.
// Then observe what happens at wave 7.
async function killWave() {
    await page.evaluate(() => {
        const beat = window.__game._beatEmUp;
        if (!beat) return;
        for (const e of beat.enemies) e.alive = false;
    });
}
async function getWave() {
    return await page.evaluate(() => window.__game._beatEmUp?.waveIdx);
}
async function scrollForward(amount) {
    await page.evaluate((amt) => {
        const beat = window.__game._beatEmUp;
        if (beat) beat.scroll = Math.min(beat.scroll + amt, (beat.data.stageWidth || 1536) - 256);
    }, amount);
}
// Make player invuln so they don't die
await page.evaluate(() => {
    const beat = window.__game._beatEmUp;
    if (beat?.player) beat.player.iframes = 999999;
});
// Walk through wave 0 first (auto-spawned on entry)
await page.waitForTimeout(500);
await killWave();
await page.waitForTimeout(800);
// Then walk forward chokepoint-by-chokepoint, killing each wave
for (let target = 1; target <= 6; target++) {
    // Force scroll forward to trigger chokepoint
    await scrollForward(300);
    await page.waitForTimeout(500);
    const w = await getWave();
    console.log(`reached wave ${w}, killing...`);
    await killWave();
    await page.waitForTimeout(500);
}

async function snap(label) {
    const dataUrl = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (dataUrl) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

async function getState() {
    return await page.evaluate(() => {
        const g = window.__game; const beat = g._beatEmUp;
        return {
            waveIdx: beat?.waveIdx,
            phase: beat?.phase,
            enemies: beat?.enemies?.length || 0,
            alive: beat?.enemies?.filter(e => e.alive).length || 0,
            spawned: beat?.waveSpawned,
            nextWaveAt: beat?._nextWaveAt,
            scroll: beat?.scroll,
        };
    });
}

console.log('After wave 6 spawn:', JSON.stringify(await getState()));
// Kill all enemies
await page.evaluate(() => {
    const beat = window.__game._beatEmUp;
    for (const e of beat.enemies) e.alive = false;
});
await snap('after_kill');
console.log('After kill all:', JSON.stringify(await getState()));

// Tick the engine for ~2 seconds (120 frames)
for (let tick = 0; tick < 30; tick++) {
    await page.waitForTimeout(100);
    const s = await getState();
    console.log(`tick ${tick} (~${tick*100}ms):`, JSON.stringify(s));
    if (s.waveIdx >= 8 && s.alive > 0) break;
}

await snap('settled');
console.log('errs:', errs.length);
errs.slice(0, 3).forEach(e => console.log('  ', e.substring(0,150)));
console.log('beatem logs:');
logs.forEach(l => console.log('  ', l));
await browser.close();
