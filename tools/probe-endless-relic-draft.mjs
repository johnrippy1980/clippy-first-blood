// R613 smoke: Endless mode offers a relic draft on every 5th wave clear and,
// on confirm, applies the relic to the live player and resumes the survival
// arena (PLAY) rather than handing off to the campaign stage card. Drives the
// wave-clear path at wave 5 directly, then exercises the relic-pick confirm.
// Exits non-zero on fail.
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
    const g = window.__game;
    const { input } = await import('/src/input.js');
    if (!g) { out.err = 'no game'; return out; }

    // Boot Endless (stage 27). _startStage arms endlessMode + _initEndless.
    g.runRelics = [];
    g._relicOffer = null;
    g._relicReturnEndless = false;
    g._startStage(27);
    await new Promise(r => setTimeout(r, 400));
    g.scene = 'play';
    out.endlessMode = g.endlessMode;
    out.hasEndless = !!g._endless;

    // Drive the wave-clear path AT wave 5: set the wave manager to a freshly
    // cleared wave-5 active state with no pending spawns and no live grunts,
    // then tick the wave logic once so the milestone draft fires.
    const e = g._endless;
    e.wave = 5;
    e.state = 'active';
    e.pendingSpawns = 0;
    e.spawnCd = 0;
    // Ensure no live enemies so the "wave cleared" branch is taken.
    g.enemies.enemies = g.enemies.enemies.filter(() => false);
    g._tickEndlessWaves();

    out.afterClear_scene = g.scene;                 // -> relicPick
    out.afterClear_returnFlag = g._relicReturnEndless; // -> true
    out.afterClear_hasOffer = !!g._relicOffer;
    out.afterClear_offerCount = g._relicOffer ? g._relicOffer.choices.length : 0;

    // Confirm the pick. Capture the chosen id + a stat to verify it applied.
    const chosenId = g._relicOffer.choices[g._relicOffer.index].id;
    const dmgBefore = g.player.relicDmgMult;
    input.pressed.add('shoot');
    g._tickRelicPick();
    input.pressed.delete('shoot');

    out.chosenId = chosenId;
    out.afterPick_scene = g.scene;                  // -> play (resume Endless)
    out.afterPick_returnFlag = g._relicReturnEndless; // -> false (consumed)
    out.afterPick_relics = g.runRelics.slice();
    out.afterPick_offerCleared = g._relicOffer === null;
    out.afterPick_endlessIntact = !!g._endless && g._endless.wave === 5;
    // Relic applied: relic* multipliers were rebuilt from the owned list.
    // Verify the chosen relic is now in runRelics (the apply reads from it).
    out.afterPick_relicOwned = g.runRelics.includes(chosenId);
    out.dmgBefore = dmgBefore;
    out.dmgAfter = g.player.relicDmgMult;

    return out;
});

console.log(JSON.stringify({ errors, result }, null, 2));
await browser.close();
const r = result;
const ok = errors.length === 0
    && r.endlessMode === true
    && r.hasEndless === true
    && r.afterClear_scene === 'relicPick'
    && r.afterClear_returnFlag === true
    && r.afterClear_hasOffer === true
    && r.afterClear_offerCount === 3
    && r.afterPick_scene === 'play'
    && r.afterPick_returnFlag === false
    && r.afterPick_relics.length === 1
    && r.afterPick_relics[0] === r.chosenId
    && r.afterPick_offerCleared === true
    && r.afterPick_endlessIntact === true
    && r.afterPick_relicOwned === true;
console.log(ok ? 'ENDLESS RELIC DRAFT OK' : 'ENDLESS RELIC DRAFT FAIL');
process.exit(ok ? 0 : 1);
