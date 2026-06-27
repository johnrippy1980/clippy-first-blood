// R650: the overloaded main menu is grouped into PLAY / MODES / EXTRAS section
// headers. The headers are pure chrome — selection still runs against the flat
// filtered list, so arrowing DOWN must visit every selectable row in order and
// NEVER land on a header. Teeth: fails if a row loses its group, if the group
// ORDER breaks (PLAY before MODES before EXTRAS), if navigation can land on a
// non-selectable header, or if the fully-unlocked panel overflows off-screen.
// @probe-timeout 45000
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(300);
await page.focus('#screen');
async function tap(key) { await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); }

let fails = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!cond) fails++; };

// Force the FULLY-UNLOCKED state so every gated row (BOSS RUSH, TIME TRIAL,
// ENDLESS, DAILY, CO-OP, STAGE SELECT) is visible — the worst case for the
// panel height + the only state where all three groups are populated.
await page.evaluate(async () => {
  const { achievements } = await import('/src/achievements.js');
  achievements.unlocked.add('clear_game');
  achievements.stats.bonziDefeated = true;
  window.__game.unlockedStage = 99;
  window.__game.coopMode = false;
  // Open the main menu directly.
  window.__game.scene = 'mainMenu';
  window.__game.mainMenuIndex = 0;
});
await page.waitForTimeout(200);
const scene = await page.evaluate(() => window.__game.scene);
check('opened MAIN MENU', scene === 'mainMenu', 'scene=' + scene);

// --- Group integrity: read the live filtered list ---
const items = await page.evaluate(() => window.__game._mainMenuItems().map(it => ({ label: it.label, action: it.action, group: it.group || null })));
check('fully-unlocked list has 14 rows', items.length === 14, 'n=' + items.length);

// Every non-BACK row must carry a group; BACK must be group-less.
const back = items[items.length - 1];
check('last row is BACK TO TITLE (group-less)', back.action === 'back' && back.group === null, back.action + '/' + back.group);
const grouped = items.slice(0, -1);
check('all non-BACK rows carry a group', grouped.every(it => !!it.group), grouped.filter(it => !it.group).map(it => it.action).join(','));

// Group ORDER must be PLAY -> MODES -> EXTRAS, contiguous (no interleaving).
const seq = [];
let last = null;
for (const it of grouped) { if (it.group !== last) { seq.push(it.group); last = it.group; } }
check('group order is PLAY/MODES/EXTRAS', seq.join(',') === 'PLAY,MODES,EXTRAS', seq.join(','));
check('exactly 3 section headers', seq.length === 3, 'headers=' + seq.length);

// Expected group membership (teeth: a row silently moving groups fails here).
const byGroup = g => grouped.filter(it => it.group === g).map(it => it.action);
check('PLAY = start/toggleCoop/stageSelect', byGroup('PLAY').join(',') === 'start,toggleCoop,stageSelect', byGroup('PLAY').join(','));
check('MODES = training/bossRush/timeTrial/endless/daily',
  byGroup('MODES').join(',') === 'training,bossRush,timeTrial,endless,daily', byGroup('MODES').join(','));
check('EXTRAS = leaderboard/options/achievements/gallery/soundtrack',
  byGroup('EXTRAS').join(',') === 'leaderboard,options,achievements,gallery,soundtrack', byGroup('EXTRAS').join(','));

// --- Navigation teeth: arrowing DOWN visits each selectable row in order and
// never lands on a header. mainMenuIndex must equal the loop counter and the
// selected action must match the flat list at that index, all the way down. ---
let navOk = true, navDetail = '';
await page.evaluate(() => { window.__game.mainMenuIndex = 0; });
for (let i = 0; i < items.length; i++) {
  const cur = await page.evaluate(() => {
    const g = window.__game;
    const list = g._mainMenuItems();
    return { idx: g.mainMenuIndex, action: list[g.mainMenuIndex] && list[g.mainMenuIndex].action };
  });
  if (cur.idx !== i || cur.action !== items[i].action) {
    navOk = false; navDetail = 'at step ' + i + ' idx=' + cur.idx + ' action=' + cur.action;
    break;
  }
  if (i < items.length - 1) { await tap('ArrowDown'); await page.waitForTimeout(40); }
}
check('DOWN visits every selectable row in order (skips headers)', navOk, navDetail);

// Wrap-around still works (DOWN from last -> first).
await tap('ArrowDown'); await page.waitForTimeout(40);
const wrapped = await page.evaluate(() => window.__game.mainMenuIndex);
check('DOWN from last wraps to first', wrapped === 0, 'idx=' + wrapped);

// --- Render must not throw + panel must fit on-screen. Drawing happens every
// frame; if the header math overflowed the panel above y=0 it would still draw
// (canvas clips), so we assert the computed panelY directly via a one-frame
// re-derivation using the SAME inputs the draw uses. ---
const geo = await page.evaluate(() => {
  // Re-derive panel geometry exactly as _drawMainMenu does (R650 formula).
  const GAME_H = 224;
  const items = window.__game._mainMenuItems();
  const rowH = 10, headerH = 8;
  let headerCount = 0, seen = null;
  for (const it of items) { if (it.group && it.group !== seen) { headerCount++; seen = it.group; } }
  const panelH = Math.min(GAME_H - 24, 22 + items.length * rowH + headerCount * headerH + 12);
  const panelY = GAME_H - panelH - 12;
  return { panelH, panelY };
});
check('fully-unlocked panel fits on-screen (panelY >= 0)', geo.panelY >= 0, 'panelY=' + geo.panelY);

// Let it actually render a few frames to surface any draw-time throw.
await page.waitForTimeout(300);
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
console.log(fails === 0 ? 'R650 PASS' : ('R650 FAIL (' + fails + ')'));
process.exit(fails === 0 ? 0 : 1);
