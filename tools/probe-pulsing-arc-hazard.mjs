// R625 smoke: the pulsing electric-arc hazard tile (TILE.ARC = 11). Unlike the
// static SPIKE/HAZARD tiles, the arc only damages during its deterministic
// "live" window and telegraphs first. Drives the REAL Level.isHazard /
// arcPhase clock and the REAL player hazard-contact path. Verifies:
//  (1) TILE.ARC registered as id 11.
//  (2) arcPhase() cycles off (0..79) -> warn (80..99) -> live (100..119) by
//      the level frame counter, with a 120-frame period.
//  (3) isHazard on an ARC tile is FALSE during off+warn and TRUE during live
//      (the warn window is a fair, non-damaging telegraph).
//  (4) the real player hazard check hurts the player when standing in a LIVE
//      arc and does NOT hurt during off/warn.
//  (5) the Founder's Lair stage actually places ARC tiles (level wiring landed).
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
    const { TILE, GAME } = await import('/src/constants.js');
    const g = window.__game;
    if (!g) return { err: 'no game' };
    const r = {};

    // --- (1) tile id ---
    r.arcId = TILE.ARC;   // 11

    g._startStage(11);    // Founder's Lair (makeStage6 -> STAGE_LOADERS[11])
    await new Promise(res => setTimeout(res, 350));
    const level = g.level;
    if (!level) return { err: 'no level' };

    // --- (2) arcPhase cycle ---
    const phaseAt = (f) => { level.frame = f; return level.arcPhase(); };
    r.phaseOff0   = phaseAt(0);    // 'off'
    r.phaseOff79  = phaseAt(79);   // 'off'
    r.phaseWarn80 = phaseAt(80);   // 'warn'
    r.phaseWarn99 = phaseAt(99);   // 'warn'
    r.phaseLive100 = phaseAt(100); // 'live'
    r.phaseLive119 = phaseAt(119); // 'live'
    r.phaseWrap120 = phaseAt(120); // 'off' (period 120)

    // --- (5) find a real ARC tile placed in stage 6 ---
    let arcTx = -1, arcTy = -1;
    for (let ty = 0; ty < level.data.height && arcTx < 0; ty++) {
        for (let tx = 0; tx < level.data.width; tx++) {
            if (level.tiles[ty][tx] === TILE.ARC) { arcTx = tx; arcTy = ty; break; }
        }
    }
    r.arcPlaced = arcTx >= 0;
    if (arcTx < 0) return r;   // nothing else to test without a tile

    // Pixel center of the arc tile.
    const px = arcTx * GAME.TILE + GAME.TILE / 2;
    const py = arcTy * GAME.TILE + GAME.TILE / 2;

    // --- (3) isHazard tracks the phase ---
    const hazAt = (f) => { level.frame = f; return level.isHazard(px, py); };
    r.hazOff   = hazAt(10);    // false
    r.hazWarn  = hazAt(85);    // false (telegraph, still safe)
    r.hazLive  = hazAt(105);   // true

    // --- (4) real player hazard-contact path ---
    // Position the player's feet inside the arc tile and run player.update so
    // the actual foot-corner hazard check fires. Park them on the tile.
    const p = g.player;
    const hurtAt = (f) => {
        level.frame = f;
        p.iFrames = 0;
        const hpBefore = p.hp;
        // Place feet so both foot corners sample the arc tile.
        p.x = arcTx * GAME.TILE + 2;
        p.y = arcTy * GAME.TILE + GAME.TILE - p.h;
        p.vx = 0; p.vy = 0;
        // Freeze the level clock during this one player tick (player.update
        // doesn't advance level.frame; the game loop does). So the phase we
        // set holds for the contact check.
        p.update(level, null);
        return p.hp < hpBefore;
    };
    r.playerHurtLive = hurtAt(105);  // true — shocked in the live window
    p.hp = p.maxHp; p.iFrames = 0;
    r.playerHurtOff  = hurtAt(10);   // false — safe when off
    p.hp = p.maxHp; p.iFrames = 0;
    r.playerHurtWarn = hurtAt(85);   // false — telegraph is non-damaging

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.arcId === 11
    && out.phaseOff0 === 'off'
    && out.phaseOff79 === 'off'
    && out.phaseWarn80 === 'warn'
    && out.phaseWarn99 === 'warn'
    && out.phaseLive100 === 'live'
    && out.phaseLive119 === 'live'
    && out.phaseWrap120 === 'off'
    && out.arcPlaced === true
    && out.hazOff === false
    && out.hazWarn === false
    && out.hazLive === true
    && out.playerHurtLive === true
    && out.playerHurtOff === false
    && out.playerHurtWarn === false;
console.log(ok ? 'PULSING ARC HAZARD OK' : 'PULSING ARC HAZARD FAIL');
process.exit(ok ? 0 : 1);
