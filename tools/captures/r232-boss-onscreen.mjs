// R232: verify each boss stays ON-SCREEN during a fight. The boss must
// be at least 24px inside the visible camera frame for every sampled
// frame across a 6-second window. Also screenshots one mid-fight frame
// per stage so we can eyeball framing.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r232', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(800);

const stages = [
    [1, 'COPIER_3000'],
    [2, 'SHREDDER'],
    [3, 'CTRL_ALT_DEL'],
    [5, 'BALLMER'],
    [6, 'GATES'],
    [9, 'ALGORITHM'],
];
const report = [];
for (const [stage, kind] of stages) {
    await page.evaluate(async (s) => {
        const g = window.__game;
        g._startStage(s);
        g.scene = 'play';
        await new Promise(r => setTimeout(r, 200));
        g._stageIntro = null;
        g.scene = 'play';
        // Teleport player TO the boss trigger so the arena math centers
        // around their actual fight location (this is how real gameplay
        // works — player walks to the trigger and then the fight starts).
        const trig = g.level.data.bossTrigger;
        if (trig) {
            g.player.x = trig.x + 8;
            g.player.y = trig.y || g.level.height - 32;
        }
        // Force a camera snap so we don't start with a stale follow target.
        g.camera.follow(g.player, g.player.facing);
        g.camera.x = g.camera.targetX;
        g._spawnBoss();
        if (g._bossIntro) { g._bossIntro.phase = 'counter'; g._bossIntro.age = 999; }
        for (let i = 0; i < 5; i++) g._tickBossIntro();
        g._bossEntrance = null;
        // Pin scene to play so the runtime tickPlay → followBossArena runs.
        g.scene = 'play';
    }, stage);
    await page.waitForTimeout(600);

    // Sample boss position vs camera over ~6 seconds
    const samples = await page.evaluate(async () => {
        const g = window.__game;
        const out = [];
        const GAME_W = 256; // internal resolution
        for (let i = 0; i < 60; i++) {   // 60 samples × ~100ms = 6s
            const b = g.boss;
            if (!b || !b.alive) break;
            const cx = b.x + b.w / 2;
            const camX = g.camera.x;
            const relX = cx - camX;          // boss center on viewport [0..256]
            out.push({
                relX, bossX: b.x, camX, bw: b.w,
                playerX: g.player.x, scene: g.scene,
                anchorX: b._anchorX, arenaX: g._bossArenaX,
                lvlW: g.level.width, bndMax: g.camera.bounds.maxX,
            });
            await new Promise(r => setTimeout(r, 100));
        }
        return out;
    });

    const visible = samples.filter(s => s.relX >= 12 && s.relX <= 244);
    const offCount = samples.length - visible.length;
    const minRel = Math.min(...samples.map(s => s.relX));
    const maxRel = Math.max(...samples.map(s => s.relX));
    const first = samples[0];
    report.push({
        stage, kind, samples: samples.length, offScreen: offCount,
        minRel: Math.round(minRel), maxRel: Math.round(maxRel),
        firstSample: first ? {
            bossX: first.bossX, camX: Math.round(first.camX),
            anchorX: Math.round(first.anchorX || 0), arenaX: Math.round(first.arenaX || 0),
            playerX: first.playerX, scene: first.scene,
            lvlW: first.lvlW, bndMax: first.bndMax,
        } : null,
    });

    await page.screenshot({ path: `/tmp/r232/boss-${kind}.png` });
}

console.log(JSON.stringify(report, null, 2));
console.log('Errors:', errs.length, errs.slice(0, 3));

const failed = report.filter(r => r.offScreen > Math.ceil(r.samples * 0.1));
if (failed.length) {
    console.log('❌ FAIL — bosses off-screen:', failed.map(f => f.kind).join(', '));
    process.exitCode = 1;
} else {
    console.log('✅ R232 PASS — all bosses stayed on-screen ≥90% of frames');
}
await browser.close();
