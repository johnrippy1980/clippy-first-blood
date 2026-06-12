// R617 smoke: co-op variants of the single-player skill achievements.
//   TWO GHOSTS      — gate on coopNoDamageStages >= 1
//   COMBINED ARMS   — gate on coopBestCombo >= 20 (with progress tuple)
//   NO ONE LEFT BEHIND — gate on coopFlawlessCampaign === true
//   DREAM TEAM      — gate on coopBestScore >= 100000
// Three layers:
//  (1) Gating — each new stat trips ONLY its own achievement, and a clean
//      stats object trips none of them (no single-player leakage).
//  (2) Progress — COMBINED ARMS reports [n,20] partial progress below 20.
//  (3) Persistence — the four new fields survive a _save -> _load round-trip
//      through achievements.js at the bumped schemaVersion.
// Runs in the page so it shares the real achievements.js module.
// Exits non-zero on fail.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);

const out = await page.evaluate(async () => {
    const { achievements, ACHIEVEMENT_LIST } = await import('/src/achievements.js');
    const r = {};

    const def = id => ACHIEVEMENT_LIST.find(a => a.id === id);
    // Confirm all four new defs exist and are coopOnly.
    const ids = ['coop_ghost', 'coop_combo_20', 'coop_no_death', 'coop_high_score'];
    r.allPresent = ids.every(id => !!def(id));
    r.allCoopOnly = ids.every(id => def(id)?.coopOnly === true);

    // --- (1) gating: build a stats object with each field set, check gates ---
    const cleanCoop = {
        coopNoDamageStages: 0, coopBestCombo: 0, coopBestScore: 0,
        coopFlawlessCampaign: false,
    };
    r.cleanFiresNone = ids.every(id => !def(id).gate({ ...cleanCoop }));

    r.ghostGate = def('coop_ghost').gate({ ...cleanCoop, coopNoDamageStages: 1 });
    r.comboGate = def('coop_combo_20').gate({ ...cleanCoop, coopBestCombo: 20 });
    r.comboGate19 = def('coop_combo_20').gate({ ...cleanCoop, coopBestCombo: 19 }); // false
    r.noDeathGate = def('coop_no_death').gate({ ...cleanCoop, coopFlawlessCampaign: true });
    r.scoreGate = def('coop_high_score').gate({ ...cleanCoop, coopBestScore: 100000 });
    r.scoreGate99 = def('coop_high_score').gate({ ...cleanCoop, coopBestScore: 99999 }); // false

    // Cross-leak guard: setting only ghost must NOT trip combo/score/noDeath.
    const onlyGhost = { ...cleanCoop, coopNoDamageStages: 5 };
    r.ghostNoLeak = !def('coop_combo_20').gate(onlyGhost)
        && !def('coop_no_death').gate(onlyGhost)
        && !def('coop_high_score').gate(onlyGhost);

    // --- (2) progress tuple on COMBINED ARMS ---
    r.comboProg12 = def('coop_combo_20').progress({ coopBestCombo: 12 }); // [12,20]
    r.comboProgCap = def('coop_combo_20').progress({ coopBestCombo: 99 }); // [20,20]

    // --- (3) persistence round-trip ---
    achievements.stats.coopNoDamageStages = 3;
    achievements.stats.coopBestCombo = 24;
    achievements.stats.coopBestScore = 150000;
    achievements.stats.coopFlawlessCampaign = true;
    achievements._save();
    // Clobber in memory then reload from localStorage.
    achievements.stats.coopNoDamageStages = 0;
    achievements.stats.coopBestCombo = 0;
    achievements.stats.coopBestScore = 0;
    achievements.stats.coopFlawlessCampaign = false;
    achievements._load();
    r.loadedNoDmg = achievements.stats.coopNoDamageStages;
    r.loadedCombo = achievements.stats.coopBestCombo;
    r.loadedScore = achievements.stats.coopBestScore;
    r.loadedFlawless = achievements.stats.coopFlawlessCampaign;
    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.allPresent === true
    && out.allCoopOnly === true
    && out.cleanFiresNone === true
    && out.ghostGate === true
    && out.comboGate === true
    && out.comboGate19 === false
    && out.noDeathGate === true
    && out.scoreGate === true
    && out.scoreGate99 === false
    && out.ghostNoLeak === true
    && JSON.stringify(out.comboProg12) === JSON.stringify([12, 20])
    && JSON.stringify(out.comboProgCap) === JSON.stringify([20, 20])
    && out.loadedNoDmg === 3
    && out.loadedCombo === 24
    && out.loadedScore === 150000
    && out.loadedFlawless === true;
console.log(ok ? 'COOP SKILL ACHIEVEMENTS OK' : 'COOP SKILL ACHIEVEMENTS FAIL');
process.exit(ok ? 0 : 1);
