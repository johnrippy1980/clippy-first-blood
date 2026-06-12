// R618 smoke: progressive BANANA BARRAGE tiers for Bonzi's tag-in attack.
// Four layers, all driven on the real game instance in-page:
//  (1) _bonziBarrageTier maps coopStagesCleared.size -> 0/1/2/3 at the
//      3 / 8 / 15 thresholds (and the boundaries just below).
//  (2) _tickBananaBarrage spawns the right bullet set per tier: T0=3 sticky
//      bananas (banana:true, no pierce, 1.5 dmg); T1=5 sticky wider fan;
//      T2=5 PIERCING (banana:false, piercing:true, 2.0 dmg); T3=5 piercing
//      golden (#ffd83a, 2.5 dmg) + a stomp (camera shake requested).
//  (3) _maybeBarrageUpgradeToast fires exactly the right toast when a clear
//      crosses a threshold, and nothing when it doesn't.
//  (4) the tier helper reads from the PERSISTED Set so progress is durable.
// Exits non-zero on fail.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);

const out = await page.evaluate(async () => {
    const { achievements } = await import('/src/achievements.js');
    const g = window.__game;
    if (!g) return { err: 'no game' };
    const r = {};

    const setCoop = (n) => {
        achievements.stats.coopStagesCleared = new Set();
        for (let i = 1; i <= n; i++) achievements.stats.coopStagesCleared.add(i);
    };

    // --- (1) tier thresholds ---
    setCoop(0);  r.t0 = g._bonziBarrageTier();   // 0
    setCoop(2);  r.t2stages = g._bonziBarrageTier(); // 0 (just below 3)
    setCoop(3);  r.t3stages = g._bonziBarrageTier(); // 1
    setCoop(7);  r.t7stages = g._bonziBarrageTier(); // 1 (just below 8)
    setCoop(8);  r.t8stages = g._bonziBarrageTier(); // 2
    setCoop(14); r.t14stages = g._bonziBarrageTier(); // 2 (just below 15)
    setCoop(15); r.t15stages = g._bonziBarrageTier(); // 3

    // --- (2) bullet spawn per tier ---
    // Synthetic Bonzi-like player: just needs x/y/w/h/facing + a bullets array.
    const mkP = () => ({ x: 100, y: 100, w: 12, h: 16, facing: 1, bullets: [] });
    const fireAt = (n) => {
        setCoop(n);
        const p = mkP();
        g._pendingBananaBarrage = { player: p, delay: 1 };
        // tick twice: first decrements delay to 0, second fires (delay-- then >0 check)
        g._tickBananaBarrage(); // delay 1 -> 0, returns (delay>0 false? 0 not >0, so fires)
        return p.bullets;
    };

    // T0 (0 stages): 3 sticky bananas, no pierce, 1.5 dmg
    const b0 = fireAt(0);
    r.b0count = b0.length;                                  // 3
    r.b0sticky = b0.every(b => b.banana === true);          // true
    r.b0noPierce = b0.every(b => !b.piercing);              // true
    r.b0dmg = b0.every(b => b.damage === 1.5);              // true

    // T1 (3 stages): 5 sticky bananas wider fan, 1.5 dmg
    const b1 = fireAt(3);
    r.b1count = b1.length;                                  // 5
    r.b1sticky = b1.every(b => b.banana === true);          // true
    r.b1noPierce = b1.every(b => !b.piercing);              // true

    // T2 (8 stages): 5 PIERCING bananas, banana:false, 2.0 dmg
    const b2 = fireAt(8);
    r.b2count = b2.length;                                  // 5
    r.b2pierce = b2.every(b => b.piercing === true);        // true
    r.b2notSticky = b2.every(b => b.banana === false);      // true
    r.b2dmg = b2.every(b => b.damage === 2.0);              // true
    r.b2hasHitsSet = b2.every(b => b.hits instanceof Set);  // true (pierce needs it)

    // T3 (15 stages): 5 piercing golden bananas, 2.5 dmg, + stomp shake
    // Give the game a camera + enemies so the stomp path runs without throwing.
    const shakeCalls = [];
    const realCam = g.camera;
    g.camera = { shake: (n) => shakeCalls.push(n) };
    const realEnemies = g.enemies;
    g.enemies = { enemies: [] };
    const b3 = fireAt(15);
    r.b3count = b3.length;                                  // 5
    r.b3pierce = b3.every(b => b.piercing === true);        // true
    r.b3dmg = b3.every(b => b.damage === 2.5);              // true
    r.b3golden = b3.every(b => b.color === '#ffd83a');      // true
    r.b3stompShook = shakeCalls.length >= 1;                // true
    g.camera = realCam;
    g.enemies = realEnemies;

    // --- (3) upgrade toasts ---
    const toastTitle = () => {
        const list = g._unlockToasts || [];
        return list.length ? list[list.length - 1].title : null;
    };
    g._unlockToasts = [];
    g._maybeBarrageUpgradeToast(2, 3);   // cross 3 -> BANANA BARRAGE+
    r.toast3 = toastTitle();
    g._unlockToasts = [];
    g._maybeBarrageUpgradeToast(7, 8);   // cross 8 -> PIERCING BARRAGE
    r.toast8 = toastTitle();
    g._unlockToasts = [];
    g._maybeBarrageUpgradeToast(14, 15); // cross 15 -> GOLDEN BARRAGE
    r.toast15 = toastTitle();
    g._unlockToasts = [];
    g._maybeBarrageUpgradeToast(4, 5);   // no threshold crossed -> nothing
    r.toastNone = (g._unlockToasts || []).length;  // 0

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.t0 === 0 && out.t2stages === 0
    && out.t3stages === 1 && out.t7stages === 1
    && out.t8stages === 2 && out.t14stages === 2
    && out.t15stages === 3
    && out.b0count === 3 && out.b0sticky && out.b0noPierce && out.b0dmg
    && out.b1count === 5 && out.b1sticky && out.b1noPierce
    && out.b2count === 5 && out.b2pierce && out.b2notSticky && out.b2dmg && out.b2hasHitsSet
    && out.b3count === 5 && out.b3pierce && out.b3dmg && out.b3golden && out.b3stompShook
    && out.toast3 === 'BANANA BARRAGE+'
    && out.toast8 === 'PIERCING BARRAGE'
    && out.toast15 === 'GOLDEN BARRAGE'
    && out.toastNone === 0;
console.log(ok ? 'BONZI BARRAGE TIERS OK' : 'BONZI BARRAGE TIERS FAIL');
process.exit(ok ? 0 : 1);
