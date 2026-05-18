// Capture the achievement grid screen.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');

// Unlock half the achievements so the grid shows a mix of states
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(800);
await page.evaluate(async () => {
    const ach = (await import('/src/achievements.js')).achievements;
    const ids = ['first_blood', 'clear_stage_1', 'clear_stage_4', 'no_dmg_stage',
                 'combo_5', 'combo_10', 'combo_20', 'all_weapons', 'second_chance'];
    for (const id of ids) ach.unlocked.add(id);
    const g = window.__game;
    g.scene = 'achievements';
    g.achievementsIndex = 5;
});
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/clippy-achievements.png' });

// Navigate to cursor index 11 (locked) to verify ??? state
await page.evaluate(() => { window.__game.achievementsIndex = 11; });
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/clippy-achievements-locked.png' });

await browser.close();
console.log('Saved /tmp/clippy-achievements*.png');
