// R487: verify main menu + stage-select after cleanup
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r487';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(500);
// Konami unlock all + cleared
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 22;
});

// Snap main menu
await page.evaluate(() => { window.__game.scene = 'mainMenu'; });
await page.waitForTimeout(400);
const m1 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (m1) await fs.writeFile(`${OUT}/01_main_menu.png`, Buffer.from(m1.replace(/^data:image\/png;base64,/, ''), 'base64'));

// Print menu items
const items = await page.evaluate(() => window.__game._mainMenuItems().map(i => i.label));
console.log('MAIN MENU:', items.join(' | '));

// Snap stage select
await page.evaluate(() => { window.__game.scene = 'stageSelect'; window.__game.stageSelectIndex = 0; });
await page.waitForTimeout(400);
const s1 = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (s1) await fs.writeFile(`${OUT}/02_stage_select.png`, Buffer.from(s1.replace(/^data:image\/png;base64,/, ''), 'base64'));

const stageIds = await page.evaluate(() => window.__game._stageSelectList());
console.log('STAGE-SELECT IDS:', stageIds.join(', '));

await browser.close();
