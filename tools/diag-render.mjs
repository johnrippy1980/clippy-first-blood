// Diagnose the missing-bg, missing-clippy regression. Capture console + page
// errors and report what assets actually loaded.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const lines = [];
page.on('pageerror', e => lines.push('PAGE: ' + e.message));
page.on('console', m => { lines.push(`[${m.type()}] ${m.text()}`); });
page.on('requestfailed', r => lines.push(`REQ FAIL ${r.url()} — ${r.failure()?.errorText}`));

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.click('#screen');
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
    const g = window.__game;
    // What manifest entries failed to load?
    const failed = [];
    const ok = [];
    if (g?.sprites?.images) {
        // The manifest is stored in dims; we can compare expected keys to what loaded
        // via the sprites.has() helper. Pull a representative list.
        const keys = ['idle', 'run_1', 'jump', 'jump_aim', 'aim_diag', 'aim_diag_down',
                      'folder', 'stapler', 'cabinet', 'holepunch',
                      'boss_COPIER_3000', 'bg_jungle', 'ground_jungle'];
        for (const k of keys) {
            (g.sprites.images.has(k) ? ok : failed).push(k);
        }
    }
    return {
        scene: g?.scene,
        playerX: g?.player?.x,
        playerHP: g?.player?.hp,
        stage: g?.currentStage,
        levelLoaded: !!g?.level,
        levelWidth: g?.level?.data?.width,
        enemiesCount: g?.enemies?.enemies?.length,
        bgLoaded: ok,
        bgFailed: failed,
    };
});

console.log(JSON.stringify(report, null, 2));
console.log('\n--- LOG TAIL ---');
for (const l of lines.slice(-40)) console.log(l);

await browser.close();
