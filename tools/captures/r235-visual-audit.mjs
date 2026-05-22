// R235: visual audit — take a mid-action screenshot of each stage so
// I can spot polish issues (visual bugs, ugly placeholders, dead spots).
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r235', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(800);

// Title screen
await page.screenshot({ path: '/tmp/r235/00-title.png' });

// Each stage, mid-section + ground-level pose so geometry + bg both read.
const diag = [];
for (let s = 1; s <= 9; s++) {
    await page.evaluate((stage) => {
        const g = window.__game;
        g._startStage(stage);
        g.storyTimer = 999;
        g.bossSpawned = true;
    }, s);
    // Wait long enough for stage card fade + storyTimer auto-advance to land
    // in PLAY. Stage card runs ~1.5s, plus fade overlay ~0.5s.
    await page.waitForTimeout(2500);
    const d = await page.evaluate(async () => {
        const g = window.__game;
        g.scene = 'play';
        const w = g.level.width;
        g.player.x = w * 0.30;
        g.player.y = g.level.height - 48;
        g.player.vx = 0; g.player.vy = 0;
        g.camera.follow(g.player, g.player.facing);
        g.camera.x = g.camera.targetX;
        return {
            scene: g.scene, levelW: g.level.width, levelH: g.level.height,
            playerX: g.player.x, playerY: g.player.y, playerState: g.player.state,
            camX: Math.round(g.camera.x), camY: Math.round(g.camera.y),
            theme: g.level.data?.theme,
        };
    }, s);
    await page.waitForTimeout(500);
    const d2 = await page.evaluate(() => ({ scene: window.__game.scene, playerHp: window.__game.player.hp }));
    diag.push({ stage: s, ...d, postScene: d2.scene, postHp: d2.playerHp });
    await page.screenshot({ path: `/tmp/r235/stage-${s}-mid.png` });
}
console.log(JSON.stringify(diag, null, 2));

console.log('Errors:', errs.length, errs.slice(0, 3));
await browser.close();
