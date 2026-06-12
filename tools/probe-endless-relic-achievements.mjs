// R611 smoke: confirm bestEndlessWave + relicsDrafted survive a save/_load
// round-trip (the R609 persistence gap) and that the five new achievements
// (endless_5/10/20, relic_first, relic_10) unlock at their thresholds and are
// well-formed in the gallery list. Exits non-zero on fail.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const result = await page.evaluate(async () => {
    const out = {};
    const { achievements, ACHIEVEMENT_LIST } = await import('/src/achievements.js');

    // The 5 new achievements must exist in the list with the expected shape.
    const ids = ['endless_5', 'endless_10', 'endless_20', 'relic_first', 'relic_10'];
    out.allDefined = ids.every(id => ACHIEVEMENT_LIST.some(a => a.id === id));

    // --- Persistence round-trip: set, _save, wipe in-memory, _load. ---
    achievements.unlocked.clear();
    localStorage.removeItem('clippy_achievements');
    achievements.stats.bestEndlessWave = 12;
    achievements.stats.relicsDrafted = 7;
    achievements._save();

    // Simulate a reload: blow away the in-memory copies, then _load from disk.
    achievements.stats.bestEndlessWave = 0;
    achievements.stats.relicsDrafted = 0;
    achievements._load();
    out.persistedWave = achievements.stats.bestEndlessWave;    // -> 12
    out.persistedRelics = achievements.stats.relicsDrafted;    // -> 7

    // --- Threshold unlocks. Fresh unlock set, drive stats up, check pops. ---
    achievements.unlocked.clear();
    achievements.stats.bestEndlessWave = 0;
    achievements.stats.relicsDrafted = 0;

    achievements.update({});                  // nothing should unlock at 0
    out.lockedAtZero = ids.every(id => !achievements.isUnlocked(id));

    achievements.stats.bestEndlessWave = 5;
    achievements.update({});
    out.e5 = achievements.isUnlocked('endless_5');
    out.e10_stillLocked = !achievements.isUnlocked('endless_10');

    achievements.stats.bestEndlessWave = 20;
    achievements.update({});
    out.e10 = achievements.isUnlocked('endless_10');
    out.e20 = achievements.isUnlocked('endless_20');

    achievements.stats.relicsDrafted = 1;
    achievements.update({});
    out.r1 = achievements.isUnlocked('relic_first');
    out.r10_stillLocked = !achievements.isUnlocked('relic_10');

    achievements.stats.relicsDrafted = 10;
    achievements.update({});
    out.r10 = achievements.isUnlocked('relic_10');

    // Clean up so the probe doesn't leave a stuffed save behind.
    localStorage.removeItem('clippy_achievements');
    return out;
});

console.log(JSON.stringify({ errors, result }, null, 2));
await browser.close();
const r = result;
const ok = errors.length === 0
    && r.allDefined === true
    && r.persistedWave === 12
    && r.persistedRelics === 7
    && r.lockedAtZero === true
    && r.e5 === true
    && r.e10_stillLocked === true
    && r.e10 === true
    && r.e20 === true
    && r.r1 === true
    && r.r10_stillLocked === true
    && r.r10 === true;
console.log(ok ? 'ENDLESS+RELIC ACH OK' : 'ENDLESS+RELIC ACH FAIL');
process.exit(ok ? 0 : 1);
