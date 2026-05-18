// Boss rush stage 7 — verify the gauntlet queue replays cleanly after dying
// or restarting. Regression check for the previously-fixed queue leak.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.click('#screen');
await page.waitForTimeout(300);

async function snapshotStage7() {
    await page.evaluate(() => window.__game._startStage(7));
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        const g = window.__game;
        g.scene = 'play';
        // Cross the bossTrigger so the gauntlet first boss spawns.
        g.player.x = (g.level.data.width - 6) * 16;
        g.bossSpawned = false;
    });
    await page.waitForTimeout(1500);
    return await page.evaluate(() => ({
        scene: window.__game.scene,
        bossPresent: !!window.__game.boss,
        bossName: window.__game.boss?.name,
        queueLen: window.__game._gauntletQueue?.length ?? null,
    }));
}

const first = await snapshotStage7();
console.log('1st entry:', JSON.stringify(first));

// Force-kill the boss to advance the queue, then re-enter via _startStage
await page.evaluate(() => {
    if (window.__game.boss) window.__game.boss.hp = 0;
});
await page.waitForTimeout(800);

const second = await snapshotStage7();
console.log('2nd entry:', JSON.stringify(second));

await browser.close();

const ok =
    first.bossPresent && first.queueLen != null && first.queueLen >= 2
    && second.bossPresent && second.queueLen === first.queueLen;
console.log(ok ? '\n✅ Gauntlet replay OK' : '\n❌ Gauntlet queue inconsistent');
process.exit(ok ? 0 : 1);
