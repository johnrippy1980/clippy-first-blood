// R608 boss-rush heal smoke: enter stage 24 (GAUNTLET_FULL / bossRushMode),
// drop the player below max HP, then force a gauntlet swap and confirm the
// between-boss +1 heal fires (and is gated to bossRushMode — a plain GAUNTLET
// swap must NOT heal). Boots in-browser; exits non-zero on fail.
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
    out.hasGame = !!g;
    if (!g || typeof g._startStage !== 'function') { out.err = 'no game/_startStage'; return out; }

    // Enter the post-game Boss Rush arena (stage 24, GAUNTLET_FULL).
    g._startStage(24);
    await new Promise(r => setTimeout(r, 250));
    out.bossRushMode = g.bossRushMode;
    out.maxHp = g.player.maxHp;

    // Simulate mid-gauntlet: there is a live queue and the player has taken
    // chip damage. Force HP below max, ensure a non-empty queue (stage init
    // already shifted the first boss out), then trigger the swap.
    g._gauntletQueue = ['SHREDDER', 'GATES'];
    g.player.hp = 1;
    out.hpBefore = g.player.hp;
    out.queueLenBefore = g._gauntletQueue ? g._gauntletQueue.length : 0;
    g._spawnNextGauntlet();
    out.hpAfterRush = g.player.hp;

    // Gating check: a NON-bossRush gauntlet swap must NOT heal. Flip the flag
    // off, refill the queue, drop HP, and confirm no heal.
    g.bossRushMode = false;
    g._gauntletQueue = ['SHREDDER', 'GATES'];
    g.player.hp = 1;
    g._spawnNextGauntlet();
    out.hpAfterCampaign = g.player.hp;

    return out;
});

console.log(JSON.stringify({ errors, result }, null, 2));
await browser.close();
const r = result;
const ok = errors.length === 0
    && r.bossRushMode === true
    && r.hpBefore === 1
    && r.hpAfterRush === 2          // +1 heal in boss-rush
    && r.hpAfterCampaign === 1;     // NO heal when bossRushMode is off
console.log(ok ? 'BOSSRUSH HEAL OK' : 'BOSSRUSH HEAL FAIL');
process.exit(ok ? 0 : 1);
