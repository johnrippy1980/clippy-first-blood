import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/polish-snaps', { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.waitForTimeout(300);
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(700);
// Skip to stage clear directly
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g.storyTimer = 0;
    // Pretend boss died
    g.player.kills = 18;
    g.player.score = 8400;
    g.player.shotsFired = 92;
    g.player.maxCombo = 7;
    g.stageStats.kills = 18;
    g.stageStats.totalEnemies = 22;
    g.stageStats.shotsFired = 92;
    g.stageStats.damageTaken = 3;
    g.stageStats.secrets = 1;
    g.stageStats.hasSecret = true;
    g.scene = 'stageClear';
    g.stageClearTimer = 0;
});
const ts = [400, 1200, 2400, 3500];
for (const t of ts) {
    await page.waitForTimeout(t - (ts.indexOf(t) > 0 ? ts[ts.indexOf(t) - 1] : 0));
    await page.screenshot({ path: `/tmp/polish-snaps/stageclear-t${t}.png` });
}
await browser.close();
console.log('done');
