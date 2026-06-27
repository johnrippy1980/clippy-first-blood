// R562 (R649-hardened): SCANLINES toggle via the OPTIONS menu. The menu row
// order changes as options are added (R648 REDUCED MOTION, R649 DIFFICULTY), so
// don't hardcode the index — find the row whose LEFT-press flips `scanlines`,
// then assert it toggles off and back on. Teeth: fails if the scanlines toggle
// is unreachable from the menu or stops flipping the option.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.focus('#screen');

let fails = 0;
const check = (n, c, e = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (e ? ' — ' + e : '')); if (!c) fails++; };
const getScan = () => page.evaluate(async () => (await import('/src/options.js')).options.get('scanlines'));

await page.evaluate(() => { window.__game.scene = 'options'; });
await page.waitForTimeout(150);

// Find the SCANLINES row: set each index, press LEFT, see if `scanlines` flips.
const before = await getScan();
let scanIdx = -1;
const itemCount = await page.evaluate(() => window.__game ? 11 : 0); // OPTIONS has 11 rows
for (let i = 0; i < itemCount; i++) {
  const v0 = await getScan();
  await page.evaluate((idx) => { window.__game.optionsIndex = idx; }, i);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(80);
  const v1 = await getScan();
  if (typeof v0 === 'boolean' && typeof v1 === 'boolean' && v0 !== v1) { scanIdx = i; break; }
}
check('found SCANLINES toggle row', scanIdx >= 0, 'idx=' + scanIdx);

// Now sitting on the scanlines row with it flipped once. Confirm it flips back.
const flipped = await getScan();
check('scanlines flipped from initial', flipped !== before, before + ' -> ' + flipped);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(120);
const restored = await getScan();
check('scanlines toggles back', restored === before, 'restored=' + restored);

await browser.close();
console.log(fails === 0 ? 'R562 PASS' : ('R562 FAIL (' + fails + ')'));
process.exit(fails === 0 ? 0 : 1);
