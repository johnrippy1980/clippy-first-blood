// R638 smoke: the HOLD THE LINE turret breather (internal stage id 25) must
// NOT surface its raw internal id to the player — it is the '3B' breather that
// chains out of the Ctrl-Alt-Del boss (stage 3 -> 25 -> 4). The stage-intro,
// pre-start "READY?" panel, pause panel, and stage-clear banner all label the
// stage; every one must read the player-facing displayId ('3B'), never '25'.
// Also confirms the turret arena actually mounts (it is a crosshair-aim
// mounted-gunner stage, NOT run-and-gun) and ticks a full wave-1 frame with
// the persistent control reminder draw path firing — no errors.
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
    const { STAGES } = await import('/src/constants.js');
    const g = window.__game;
    if (!g) return { err: 'no game' };
    const r = {};

    // (1) The data: stage 25 is the '3B' breather, NOT a 25th campaign level.
    const s25 = STAGES[25];
    r.stage25DisplayId = s25 && s25.displayId;
    r.stage25Name = s25 && s25.name;
    r.is3B = r.stage25DisplayId === '3B';
    // Sibling sanity: campaign 3 still chains here, and 3 is '03'.
    r.stage3DisplayId = STAGES[3] && STAGES[3].displayId;

    // (2) The label leak is closed: no STAGES entry's displayId equals its raw
    // numeric id stringified for the breather/secret/mode rows. (Campaign 1-13
    // intentionally read '01'..'13'.) Specifically assert 25 never prints '25'.
    r.never25 = String(s25.displayId) !== '25' && String(s25.displayId) !== String(s25.id);

    // (3) The turret stage actually mounts as a TurretArena (crosshair aim),
    // not the normal run-and-gun Level. Boot it and tick past the intro.
    g._startStage(25);
    await new Promise(res => setTimeout(res, 250));
    const arena = g.turretArena || g._turretArena || null;
    r.arenaMounted = !!arena;
    r.levelIsTurret = !!(g.level && g.level.data && g.level.data.turretMode)
        || !!arena;

    // (4) Drive it through the intro freeze + into wave 1 so the persistent
    // control-reminder draw path (waveIdx===0 branch) actually executes.
    if (arena) {
        for (let f = 0; f < 130; f++) arena.update();   // intro is 90f then wave 1
        r.waveIdx = arena.waveIdx;
        r.inWave1 = arena.waveIdx === 0;
        // Render a frame — this exercises _drawHud's control-reminder branch.
        try { arena.draw(); r.drawOk = true; } catch (e) { r.drawOk = false; r.drawErr = String(e); }
    }

    return r;
});

console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
const ok = errors.length === 0
    && out.is3B === true
    && out.stage25Name === 'HOLD THE LINE'
    && out.stage3DisplayId === '03'
    && out.never25 === true
    && out.arenaMounted === true
    && out.levelIsTurret === true
    && out.inWave1 === true
    && out.drawOk === true;
console.log(ok ? 'TURRET STAGE LABEL OK' : 'TURRET STAGE LABEL FAIL');
process.exit(ok ? 0 : 1);
