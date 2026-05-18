// Verify the stage-clear payoff sequence (explosion → title → results).
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__game.scene = 'play'; });

// Jump straight to stage clear by killing boss
await page.evaluate(() => {
    const g = window.__game;
    g.player.score = 12345;
    g.player.maxCombo = 7;
    g.player.kills = 14;
    g.player.shotsFired = 50;
    g.stageStats.kills = 14;
    g.stageStats.damageTaken = 0;
    g._spawnBoss();
    // Kill the boss to trigger clear sequence
    const boss = g.enemies.activeBoss();
    if (boss) { boss.hp = 0; boss.alive = false; }
});

// Sample 5 frames across the sequence
await page.waitForTimeout(100);
await page.screenshot({ path: '/tmp/clippy-clear-0explode.png' });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/clippy-clear-1title.png' });
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/clippy-clear-2panel.png' });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/clippy-clear-3stats.png' });
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/clippy-clear-4final.png' });

const state = await page.evaluate(() => ({
    scene: window.__game.scene,
    storyTimer: window.__game.storyTimer,
}));
console.log('Final state:', JSON.stringify(state));
console.log(`Errors: ${errs.length}`); errs.forEach(e => console.log('  ' + e));
await browser.close();
