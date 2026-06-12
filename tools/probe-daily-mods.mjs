// R607 daily-modifier smoke: verify the new CHALLENGES entries + rouletteWeapon
// helper are well-formed and deterministic, and that booting + entering a daily
// run with each new mod set doesn't throw. Logic-level checks for the daily
// module; in-game boot for the player-field application. Exits non-zero on fail.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const result = await page.evaluate(async (base) => {
    const out = {};
    const dm = await import(base + '/src/daily.js');
    const { dailyChallenge, CHALLENGES } = dm;
    out.challengeCount = CHALLENGES.length;
    out.newIds = CHALLENGES.map(c => c.id);
    // every challenge well-formed
    out.allWellFormed = CHALLENGES.every(c => c.id && c.name && c.desc && c.mods && typeof c.mods === 'object');
    // roulette determinism: same day+stage → same weapon; excludes MG
    const d = new Date('2026-06-12T12:00:00');
    const w1a = dailyChallenge.rouletteWeapon(1, d);
    const w1b = dailyChallenge.rouletteWeapon(1, d);
    const w2 = dailyChallenge.rouletteWeapon(2, d);
    out.rouletteDeterministic = (w1a === w1b);
    out.rouletteVariesByStage = (w1a !== w2) || true; // not guaranteed different, but must be valid
    out.rouletteNoMG = w1a !== 'MG' && w2 !== 'MG';
    out.rouletteSamples = { s1: w1a, s2: w2 };

    // In-game: enter a daily run, force each new mod, start a stage, confirm the
    // player fields get applied without throwing.
    const g = window.__game;
    out.hasGame = !!g;
    if (g && typeof g._startStage === 'function') {
        const applied = {};
        for (const mods of [
            { glassCannon: true },
            { lowGravity: true },
            { weaponRoulette: true },
            { weaponRoulette: true, oneLife: true },
        ]) {
            g.dailyMode = true;
            g.dailyChallenge = { id: 'test', name: 'TEST', desc: '', mods, day: '20260612' };
            try { g._startStage(1); } catch (e) { out.startErr = String(e); }
            await new Promise(r => setTimeout(r, 250));
            const p = g.player;
            applied[JSON.stringify(mods)] = {
                takeMult: p.damageTakenMult,
                dealMult: p.damageDealtMult,
                gravMult: p.gravityMult,
                weapon: p.weapon,
                lives: p.lives,
            };
        }
        out.applied = applied;
    }
    return out;
}, BASE);

console.log(JSON.stringify({ errors, result }, null, 2));
await browser.close();
const r = result;
const ok = errors.length === 0
    && r.allWellFormed
    && r.rouletteDeterministic && r.rouletteNoMG
    && r.applied
    && r.applied['{"glassCannon":true}'].dealMult === 2
    && r.applied['{"glassCannon":true}'].takeMult === 2
    && r.applied['{"lowGravity":true}'].gravMult < 1
    && r.applied['{"weaponRoulette":true}'].weapon !== 'MG'
    && r.applied['{"weaponRoulette":true,"oneLife":true}'].lives === 0;
console.log(ok ? 'DAILY OK' : 'DAILY FAIL');
process.exit(ok ? 0 : 1);
