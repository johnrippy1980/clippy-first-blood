// R641: punt/chain audio juice for the mine/sapper line.
//   (1) Punting a deployed mine fires the dedicated 'minePunt' SFX (a metallic
//       kick-clang), NOT the borrowed 'select' UI blip it used before.
//   (2) A sympathetic chain cascade (R636) voices each link with a rising
//       'mineChainPop' (step climbs per link) instead of N flat 'explosion's —
//       and the chained links suppress their own flat 'explosion' so the
//       cascade reads as a building ripple, not a wall of identical booms.
//   (3) The new sfx names dispatch without throwing.
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
    const { GAME, STATE } = await import('/src/constants.js');
    const { audio } = await import('/src/audio.js');
    const g = window.__game;
    if (!g) return { err: 'no game' };
    g._startStage(1);
    await new Promise(res => setTimeout(res, 350));
    const level = g.level;
    const r = {};

    // Force audio actually active so the dispatch runs the synth bodies (would
    // early-return on !ctx || muted). We don't need to HEAR anything — we just
    // need sfx() to reach the switch so a bad case would throw.
    const realSfx = audio.sfx.bind(audio);
    const calls = [];
    audio.sfx = (name, arg) => { calls.push({ name, arg }); return realSfx(name, arg); };

    // ---- new names dispatch without throwing (ctx may be suspended, but the
    // switch is reached before any node work that needs a running context). ----
    r.dispatchThrew = false;
    try { audio.sfx('minePunt'); audio.sfx('mineChainPop', 0); audio.sfx('mineChainPop', 3); }
    catch (e) { r.dispatchThrew = true; r.dispatchErr = String(e && e.message); }

    const groundY = (level.data.height - 3) * GAME.TILE;
    const bullets = g.enemies.bullets;

    const mkPlayer = (state) => ({
        x: 40 * GAME.TILE + 80, y: groundY - 14, w: 12, h: 14, vx: 0, vy: 0,
        facing: 1, waterHidden: false, grassHidden: false, state: state ?? -1,
        bullets: [], score: 0, combo: 0, comboTimer: 0, kills: 0, maxCombo: 0,
        hitPauseFrames: 0, requestShake: 0,
        _addOvercharge() {}, tauntKill() {}, _comboLabel() { return 'COMBO'; },
        onBulletHit(b, e, killed) {
            if (killed) { this.kills++; this.combo++; this.comboTimer = 90;
                this.maxCombo = Math.max(this.maxCombo, this.combo);
                this.score += 100 + this.combo * 10; }
        },
    });

    const spawnSapper = () => {
        g.enemies.spawn(40 * GAME.TILE, groundY, 'sapper');
        const s = g.enemies.enemies[g.enemies.enemies.length - 1];
        s._grace = 0; s.activated = true;
        const p = mkPlayer();
        for (let f = 0; f < 40; f++) s.update(level, p);
        return s;
    };

    // ===== (1) PUNT fires 'minePunt', not 'select'. =====
    {
        bullets.length = 0; g.enemies.enemies.length = 0;
        const player = mkPlayer(STATE.SLIDE);
        const mine = (() => {
            const s = spawnSapper();
            s._dropMine(level);
            const si = g.enemies.enemies.indexOf(s);
            if (si >= 0) g.enemies.enemies.splice(si, 1);
            return bullets.filter(b => b._mine).pop();
        })();
        for (let i = 0; i < 60; i++) mine.update(level);
        mine.x = player.x + 2; mine.y = player.y + player.h - 2;
        mine._mineSettled = true; mine._mineArm = 0;
        calls.length = 0;
        g.enemies.update(level, player);   // punt frame
        const names = calls.map(c => c.name);
        r.puntFiredMinePunt = names.includes('minePunt');
        r.puntDidNotFireSelect = !names.includes('select');
    }

    // ===== (2) CHAIN cascade voices rising 'mineChainPop', suppresses flat
    // 'explosion' on the chained links. Seed a packed cluster and detonate it. =
    {
        bullets.length = 0; g.enemies.enemies.length = 0;
        // Plant 4 settled, armed, chain-capable mines in a tight line so each
        // sits inside the next one's chain radius.
        const mines = [];
        for (let k = 0; k < 4; k++) {
            const s = spawnSapper();
            s._dropMine(level);
            const si = g.enemies.enemies.indexOf(s);
            if (si >= 0) g.enemies.enemies.splice(si, 1);
            const m = bullets.filter(b => b._mine).pop();
            for (let i = 0; i < 60; i++) m.update(level);
            m.x = 40 * GAME.TILE + 40 + k * 6;   // 6px apart — well within chainR
            m.y = groundY - 8;
            m._mineSettled = true; m._mineArm = 0; m._chaining = false; m._minePunt = false;
            mines.push(m);
        }
        const chainR = mines[0]._mineChainR || 28;
        r.cluster = mines.length;
        r.chainR = chainR;
        calls.length = 0;
        // Seed the cascade at the first mine's position.
        const det = g.enemies._chainDetonateMines(
            [{ x: mines[0].x, y: mines[0].y, r: chainR, vsEnemies: true }], level);
        r.detonated = det;
        const popCalls = calls.filter(c => c.name === 'mineChainPop');
        const explodeCalls = calls.filter(c => c.name === 'explosion' || c.name === 'explode');
        r.chainPops = popCalls.length;
        r.chainSteps = popCalls.map(c => c.arg);
        // steps must climb 0,1,2,... (one per detonated link)
        r.stepsClimb = popCalls.every((c, i) => c.arg === i);
        // chained links must NOT each fire a flat boom (the pop carries them)
        r.noFlatBoomOnChain = explodeCalls.length === 0;
    }

    audio.sfx = realSfx;
    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();

const ok = errors.length === 0
    && out.dispatchThrew === false
    && out.puntFiredMinePunt === true
    && out.puntDidNotFireSelect === true
    && out.detonated >= 2
    && out.chainPops === out.detonated
    && out.stepsClimb === true
    && out.noFlatBoomOnChain === true;
console.log(ok ? 'R641 PUNT/CHAIN AUDIO OK' : 'R641 PUNT/CHAIN AUDIO FAIL');
process.exit(ok ? 0 : 1);
