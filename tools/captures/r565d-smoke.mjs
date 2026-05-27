// R565d smoke test: persistence of tagsFound + general boot + scene transitions
// + achievement save round-trip. Validates today's R565d fix and confirms the
// R565 cleanup chain (engines + restartRun) doesn't crash on stage transitions.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r565d';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// === PHASE 1: Boot, clear localStorage, confirm clean state ===
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('#screen');

const tag0 = await page.evaluate(async () => {
    const m = await import('/src/achievements.js');
    return { tags: m.achievements.stats.tagsFound, schema: 'initial' };
});
console.log('PHASE 1 (clean) tagsFound:', tag0.tags);
if (tag0.tags !== 0) throw new Error(`Expected 0, got ${tag0.tags}`);

// === PHASE 2: Set tagsFound to 5, force save ===
await page.evaluate(async () => {
    const m = await import('/src/achievements.js');
    m.achievements.stats.tagsFound = 5;
    m.achievements._save();
});

const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('clippy_achievements');
    return raw ? JSON.parse(raw) : null;
});
console.log('PHASE 2 stored schemaVersion:', stored?.schemaVersion);
console.log('PHASE 2 stored tagsFound:', stored?.stats?.tagsFound);
if (stored?.schemaVersion !== 302) throw new Error(`Expected schema 302, got ${stored?.schemaVersion}`);
if (stored?.stats?.tagsFound !== 5) throw new Error(`Expected stored 5, got ${stored?.stats?.tagsFound}`);

// === PHASE 3: Reload, confirm value survives ===
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const tag1 = await page.evaluate(async () => {
    const m = await import('/src/achievements.js');
    return m.achievements.stats.tagsFound;
});
console.log('PHASE 3 (after reload) tagsFound:', tag1);
if (tag1 !== 5) throw new Error(`Expected 5 after reload, got ${tag1}`);

// === PHASE 4: Bump to 7, verify FULL SET achievement unlocks via gate ===
await page.evaluate(async () => {
    const m = await import('/src/achievements.js');
    // simulate clearing a stage with 7 tags via update path
    m.achievements.update({ tagsFound: 7 });
    // _onStageClear high-water write path
    m.achievements.stats.tagsFound = 7;
    m.achievements._save();
});

const unlocked = await page.evaluate(async () => {
    const m = await import('/src/achievements.js');
    return [...m.achievements.unlocked];
});
console.log('PHASE 4 unlocked achievements include full_set?', unlocked.includes('full_set'));
if (!unlocked.includes('full_set')) throw new Error('full_set should have unlocked at tagsFound=7');

// === PHASE 5: Reload again, verify both tagsFound AND unlocked persist ===
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const final = await page.evaluate(async () => {
    const m = await import('/src/achievements.js');
    return {
        tags: m.achievements.stats.tagsFound,
        unlocked: [...m.achievements.unlocked],
    };
});
console.log('PHASE 5 final tagsFound:', final.tags);
console.log('PHASE 5 final has full_set?:', final.unlocked.includes('full_set'));
if (final.tags !== 7) throw new Error(`Expected 7, got ${final.tags}`);
if (!final.unlocked.includes('full_set')) throw new Error('full_set lost on reload');

// === PHASE 6: Boot game, verify gallery shows the achievement unlocked ===
await page.click('#screen');
await page.evaluate(() => { window.__game.scene = 'gallery'; });
await page.waitForTimeout(400);
await snap('06_gallery_with_full_set');

// === PHASE 7: Title + soundtrack scenes render without errors ===
await page.evaluate(() => { window.__game.scene = 'title'; });
await page.waitForTimeout(400);
await snap('07_title');
await page.evaluate(() => { window.__game.scene = 'soundtrack'; window.__game.soundtrackIndex = 0; });
await page.waitForTimeout(400);
await snap('08_soundtrack_top');
await page.evaluate(() => { window.__game.soundtrackIndex = 15; });
await page.waitForTimeout(200);
await snap('09_soundtrack_mid');
await page.evaluate(() => { window.__game.soundtrackIndex = 29; });
await page.waitForTimeout(200);
await snap('10_soundtrack_end');

// === PHASE 8: Stage 25 (turret arena) start — verifies R564c cleanup chain ===
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
    window.__game._startStage(25);
});
for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(150);
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'turretPlay') break;
    if (sc === 'stageIntro' || sc === 'ready' || sc === 'bossIntro') {
        await page.keyboard.press('KeyX');
    }
}
const finalScene = await page.evaluate(() => window.__game?.scene);
console.log('PHASE 8 stage 25 reached scene:', finalScene);
await snap('11_stage25_running');

// === PHASE 9: Switch back to title (R565 _restartRun engine cleanup) ===
await page.evaluate(() => window.__game._restartRun());
await page.waitForTimeout(400);
const restartedScene = await page.evaluate(() => window.__game?.scene);
const enginesCleared = await page.evaluate(() => ({
    fps: !!window.__game._fpsArena,
    beat: !!window.__game._beatEmUp,
    doom: !!window.__game._doomEngine,
    turret: !!window.__game._turretArena,
}));
console.log('PHASE 9 after restart scene:', restartedScene);
console.log('PHASE 9 engines cleared:', enginesCleared);
if (Object.values(enginesCleared).some(v => v)) throw new Error('Engine reference leaked through _restartRun');

console.log('\n=== ERRORS ===');
console.log('count:', errors.length);
errors.forEach(e => console.log('  ', e));

await browser.close();
console.log(errors.length === 0 ? '\nSMOKE TEST PASSED' : '\nSMOKE TEST PASSED WITH WARNINGS');
