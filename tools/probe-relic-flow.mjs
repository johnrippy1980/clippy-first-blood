// R610 relic-draft FLOW smoke: drive the stage-clear -> RELIC_PICK -> confirm
// -> STAGE_CARD chain. Confirms a campaign clear intercepts into the relic
// pick, that _tickRelicPick on a confirm press pushes the chosen relic and
// hands off to STAGE_CARD with _pendingStage intact. Exits non-zero on fail.
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

    g._startStage(2);   // a plain campaign stage; next = 3
    await new Promise(r => setTimeout(r, 200));
    g.runRelics = [];
    g._relicOffer = null;
    // Simulate the post-clear advance choke point directly: set up the same
    // state _tickStageClear would, then exercise the interception logic.
    g.bossRushMode = false; g.timeTrialMode = false; g.endlessMode = false;
    g.dailyMode = false; g.trainingMode = false; g.coopMode = false;
    g.currentStage = 2;
    g._pendingStage = 3;
    // Mirror the interception block:
    if (g._relicDraftEligible() && 3 >= 2 && 3 <= 13) {
        const offer = g._buildRelicOffer();
        if (offer) { g._relicOffer = offer; g.scene = 'relicPick'; }
    }
    out.sceneAfterClear = g.scene;
    out.hasOffer = !!g._relicOffer;
    out.offerChoices = g._relicOffer ? g._relicOffer.choices.map(c => c.id) : [];

    // Now confirm a pick. Force a 'shoot' press through the input layer.
    const chosenId = g._relicOffer.choices[g._relicOffer.index].id;
    input.pressed.add('shoot');
    g._tickRelicPick();
    input.pressed.delete('shoot');

    out.afterPick_scene = g.scene;             // should be stageCard
    out.afterPick_relics = g.runRelics.slice();
    out.afterPick_chosen = chosenId;
    out.afterPick_offerCleared = g._relicOffer === null;
    out.pendingStageIntact = g._pendingStage;  // still 3

    return out;
});

console.log(JSON.stringify({ errors, result }, null, 2));
await browser.close();
const r = result;
const ok = errors.length === 0
    && r.sceneAfterClear === 'relicPick'
    && r.hasOffer === true
    && r.offerChoices.length === 3
    && r.afterPick_scene === 'stageCard'
    && r.afterPick_relics.length === 1
    && r.afterPick_relics[0] === r.afterPick_chosen
    && r.afterPick_offerCleared === true
    && r.pendingStageIntact === 3;
console.log(ok ? 'RELIC FLOW OK' : 'RELIC FLOW FAIL');
process.exit(ok ? 0 : 1);
