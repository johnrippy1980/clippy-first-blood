import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r161', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(800);

const bosses = [
    [1, 'COPIER_3000'],
    [2, 'SHREDDER'],
    [3, 'CTRL_ALT_DEL'],
    [4, 'BALLMER'],
    [5, 'GATES'],
    [6, 'CLIPPY_2'],
    [8, 'ALGORITHM'],
];
for (const [stage, kind] of bosses) {
    await page.evaluate(async (s) => {
        const g = window.__game;
        g._startStage(s);
        g.scene = 'play';
        await new Promise(r => setTimeout(r, 300));
        // Skip stage intro
        g._stageIntro = null;
        g.scene = 'play';
        // Spawn boss directly (bypass cinematic)
        g._spawnBoss();
        // Force-complete villain + counter intro
        if (g._bossIntro) {
            g._bossIntro.phase = 'counter';
            g._bossIntro.age = 999;
        }
        // Tick a few frames so the bossEntrance overlay finishes
        for (let i = 0; i < 5; i++) g._tickBossIntro();
        // Force-end entrance flourish
        g._bossEntrance = null;
        // Damage boss to ~50% so HP bar reads mid-state
        const b = g.boss || g.enemies?.activeBoss?.();
        if (b) b.hp = Math.max(1, Math.floor(b.maxHp * 0.5));
    }, stage);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/r161/boss-${kind}.png` });
}
await browser.close();
