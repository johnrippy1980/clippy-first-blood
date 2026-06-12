// R610 relics smoke: verify the relic pool is well-formed, _buildRelicOffer
// returns 3 distinct un-owned relics, applying a relic mutates the player's
// relic* multipliers, _applyRunRelics rebuilds them deterministically from the
// owned list (no compounding across re-applies), and maxHp is rebuilt from the
// base + net bonus. Logic-level + in-game player poke. Exits non-zero on fail.
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
    if (!g) { out.err = 'no game'; return out; }

    // Boot a normal stage so g.player exists.
    g._startStage(1);
    await new Promise(r => setTimeout(r, 250));
    out.hasPlayer = !!g.player;
    out.baseMaxHp = g.player.maxHp;

    // Offer building: empty owned -> 3 distinct relics.
    g.runRelics = [];
    const offer = g._buildRelicOffer();
    out.offerCount = offer ? offer.choices.length : 0;
    out.offerDistinct = offer ? new Set(offer.choices.map(c => c.id)).size === offer.choices.length : false;
    out.offerIds = offer ? offer.choices.map(c => c.id) : [];

    // Take GLASS EDGE (deterministic effect: +30% dmg, -1 max hp) and apply.
    g.runRelics = ['glassEdge'];
    g._applyRunRelics();
    out.afterGlassEdge = {
        dmg: g.player.relicDmgMult,
        maxHp: g.player.maxHp,
        maxBonus: g.player.relicMaxHpBonus,
    };

    // Re-apply MUST be idempotent (no compounding): same multipliers/maxHp.
    g._applyRunRelics();
    out.afterReapply = {
        dmg: g.player.relicDmgMult,
        maxHp: g.player.maxHp,
    };

    // Stack a second relic (JUGGERNAUT: +1 max hp, -15% fire). Net maxHp bonus
    // = -1 (glassEdge) + 1 (juggernaut) = 0 -> back to base 4.
    g.runRelics = ['glassEdge', 'juggernaut'];
    g._applyRunRelics();
    out.afterStack = {
        dmg: g.player.relicDmgMult,        // 1.3
        fire: g.player.relicFireMult,      // 1.15
        maxHp: g.player.maxHp,             // 4
    };

    // Eligibility: campaign stage 1 is eligible; boss-rush is not.
    g.bossRushMode = false; g.timeTrialMode = false; g.endlessMode = false;
    g.dailyMode = false; g.trainingMode = false; g.coopMode = false;
    g.currentStage = 3;
    out.eligibleCampaign = g._relicDraftEligible();
    g.bossRushMode = true;
    out.eligibleBossRush = g._relicDraftEligible();
    g.bossRushMode = false;

    return out;
});

console.log(JSON.stringify({ errors, result }, null, 2));
await browser.close();
const r = result;
const approx = (a, b) => Math.abs(a - b) < 1e-6;
const ok = errors.length === 0
    && r.hasPlayer
    && r.baseMaxHp === 4
    && r.offerCount === 3
    && r.offerDistinct === true
    && approx(r.afterGlassEdge.dmg, 1.3)
    && r.afterGlassEdge.maxHp === 3
    && r.afterGlassEdge.maxBonus === -1
    && approx(r.afterReapply.dmg, 1.3)         // idempotent
    && r.afterReapply.maxHp === 3
    && approx(r.afterStack.dmg, 1.3)
    && approx(r.afterStack.fire, 1.15)
    && r.afterStack.maxHp === 4                 // -1 +1 = base
    && r.eligibleCampaign === true
    && r.eligibleBossRush === false;
console.log(ok ? 'RELICS OK' : 'RELICS FAIL');
process.exit(ok ? 0 : 1);
