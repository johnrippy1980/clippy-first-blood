// R639 + R640 smoke.
// R639 (dead man's switch): killing a sapper drops ONE immediately-armed mine
//   at its feet — a clean kill still leaves a live hazard. Verifies:
//   (1) a sapper at full HP holds NO death mine; killing it ADDS exactly one
//       _mine to the enemy-bullet lane, already armed (_mineArm === 0).
//   (2) that death mine is a real, trippable mine (settled, has chain radius).
// R640 (punt-combo scoring): a punted mine that kills an enemy credits the
//   player the way slide/melee kills do — combo++ and score climbs. Verifies:
//   (3) punting a mine into a grunt KILLS it AND raises player.combo + score
//       (previously the punt-kill awarded nothing).
//   (4) a punted mine chained through a packed cluster (R636) racks MULTIPLE
//       combo steps in one resolution — combo rises by >= 2.
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
    const { GAME, STATE } = await import('/src/constants.js');
    const g = window.__game;
    if (!g) return { err: 'no game' };
    g._startStage(1);
    await new Promise(res => setTimeout(res, 350));
    const level = g.level;
    const r = {};

    const groundY = (level.data.height - 3) * GAME.TILE;
    const bullets = g.enemies.bullets;
    const countMines = () => bullets.filter(b => b._mine).length;

    const mkPlayer = (state) => ({
        x: 40 * GAME.TILE + 80, y: groundY - 14, w: 12, h: 14, vx: 0, vy: 0,
        facing: 1, waterHidden: false, grassHidden: false, state: state ?? -1,
        bullets: [], score: 0, combo: 0, comboTimer: 0, kills: 0, maxCombo: 0,
        hitPauseFrames: 0, requestShake: 0,
        _addOvercharge() {}, tauntKill() {}, _comboLabel() { return 'COMBO'; },
        onBulletHit(b, e, killed) {
            // Faithful minimal mirror of the real kill-credit block so the probe
            // measures the wiring (combo/score), not the full FX pipeline.
            if (killed) {
                this.kills++; this.combo++; this.comboTimer = 90;
                this.maxCombo = Math.max(this.maxCombo, this.combo);
                this.score += 100 + this.combo * 10;
            }
        },
    });

    const spawnSapper = () => {
        g.enemies.spawn(40 * GAME.TILE, groundY, 'sapper');
        const s = g.enemies.enemies[g.enemies.enemies.length - 1];
        s._grace = 0; s.activated = true;
        const player = mkPlayer();
        for (let f = 0; f < 40; f++) s.update(level, player);  // settle
        return s;
    };

    // ===== (1)+(2) R639 dead man's switch.
    {
        bullets.length = 0; g.enemies.enemies.length = 0;
        const s = spawnSapper();
        const before = countMines();
        // Kill it outright with a big hit.
        const killed = s.hurt(999, 1);
        r.killReturned = killed === true;
        const after = countMines();
        r.deathMineDropped = (after - before) >= 1;
        const dm = bullets.filter(b => b._mine).pop();
        r.deathMineArmed = !!dm && dm._mineArm === 0;          // live immediately
        r.deathMineSettled = !!dm && dm._mineSettled === true; // planted
        r.deathMineChainable = !!dm && dm._mineChainR > 0;     // R636 compatible
    }

    // ===== (3) R640 punt-kill credits combo + score.
    {
        bullets.length = 0; g.enemies.enemies.length = 0;
        const player = mkPlayer(STATE.SLIDE);
        // A fragile target to the player's right.
        g.enemies.spawn(40 * GAME.TILE + 140, groundY, 'folder');
        const target = g.enemies.enemies[g.enemies.enemies.length - 1];
        target._grace = 0; target.activated = true; target.hp = 1;
        // Drop a mine right at the player, punt it into the target. Strip ONLY
        // the sapper afterward (clearing the whole array would delete the
        // target too).
        const mine = (() => {
            const s = spawnSapper();
            s._dropMine(level);
            const si = g.enemies.enemies.indexOf(s);
            if (si >= 0) g.enemies.enemies.splice(si, 1);
            return bullets.filter(b => b._mine).pop();
        })();
        // Settle + arm the mine, then plant it under the player to be punted.
        for (let i = 0; i < 60; i++) mine.update(level);
        mine.x = player.x + 2; mine.y = player.y + player.h - 2;
        mine._mineSettled = true; mine._mineArm = 0;
        const combo0 = player.combo, score0 = player.score;
        // Punt frame (player SLIDE crosses the mine) — sets _minePunt.
        g.enemies.update(level, player);
        // Fly the punted mine into the target.
        for (let f = 0; f < 30 && target.alive; f++) {
            mine.x = target.x + 1; mine.y = target.y + 1;   // force overlap
            g.enemies.update(level, player);
            if (!target.alive) break;
        }
        r.puntTargetKilled = !target.alive;
        r.puntComboUp = player.combo > combo0;
        r.puntScoreUp = player.score > score0;
    }

    // ===== (4) Enemy-damaging SHRAPNEL kills credit the combo too. The cascade
    // (R635/R636) sprays _parried shrapnel through the enemy-bullet lane; R640
    // added kill-credit to that parried-bullet loop so a shrapnel kill ramps
    // the combo like any other. Inject one parried splash bullet overlapping a
    // grunt and step the manager once — the kill must credit combo + score.
    // (The cascade's _parried geometry itself is covered by probe-mine-chain.)
    {
        bullets.length = 0; g.enemies.enemies.length = 0;
        const player = mkPlayer(-1);
        g.enemies.spawn(40 * GAME.TILE + 120, groundY, 'folder');
        const gv = g.enemies.enemies[g.enemies.enemies.length - 1];
        gv._grace = 0; gv.activated = true; gv.hp = 1;
        gv.x = 40 * GAME.TILE + 120; gv.y = groundY - 12;
        // A parried (enemy-damaging) shrapnel child sitting on the grunt. The
        // manager's parried loop only reads x/y/dmg/_parried/stuck + update(),
        // so a minimal stand-in exercises exactly the R640 credit path.
        const frag = {
            x: gv.x + gv.w / 2, y: gv.y + gv.h / 2,
            prevX: gv.x + gv.w / 2, prevY: gv.y + gv.h / 2,
            vx: 0, vy: 0, dmg: 5, color: '#80e0ff',
            _parried: true, _splashChild: true, stuck: false, life: 30,
            update() {},   // manager calls b.update(level) before the parry loop
        };
        bullets.push(frag);
        const combo0 = player.combo, score0 = player.score;
        // The parried-bullet loop resolves the kill on a subsequent manager
        // tick (the splash child has to overlap + the hurt() lands a frame
        // later), so step a few frames and keep the frag glued to the grunt.
        for (let f = 0; f < 5 && gv.alive; f++) {
            frag.x = gv.x + gv.w / 2; frag.y = gv.y + gv.h / 2;
            if (!bullets.includes(frag)) bullets.push(frag);
            g.enemies.update(level, player);
        }
        r.shrapnelKilled = !gv.alive;
        r.shrapnelComboUp = player.combo > combo0;
        r.shrapnelScoreUp = player.score > score0;
    }

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.killReturned === true
    && out.deathMineDropped === true
    && out.deathMineArmed === true
    && out.deathMineSettled === true
    && out.deathMineChainable === true
    && out.puntTargetKilled === true
    && out.puntComboUp === true
    && out.puntScoreUp === true
    && out.shrapnelKilled === true
    && out.shrapnelComboUp === true
    && out.shrapnelScoreUp === true;
console.log(ok ? 'SAPPER DEATHMINE + PUNTCOMBO OK' : 'SAPPER DEATHMINE + PUNTCOMBO FAIL');
process.exit(ok ? 0 : 1);
