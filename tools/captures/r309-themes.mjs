// R309: capture one in-game screenshot per theme so atmospheric layers
// can be eyeballed without booting through the campaign manually.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r309', { recursive: true });

const TARGETS = [
    { id: 1,  tag: 'jungle' },
    { id: 2,  tag: 'breakroom' },
    { id: 3,  tag: 'serverroom' },
    { id: 4,  tag: 'sewer' },
    { id: 5,  tag: 'boardroom' },
    { id: 8,  tag: 'keynote' },
    { id: 11, tag: 'founder' },
    { id: 12, tag: 'boss_rush_serverroom' },
    { id: 13, tag: 'cloud' },
    { id: 18, tag: 'reality' },
    { id: 20, tag: 'mecha_approach_street' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console',   m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('#screen');
await page.waitForTimeout(400);
// Skip the READY card so stages drop straight into PLAY
await page.evaluate(async () => {
    const mod = await import('./src/options.js');
    if (mod.options && mod.options.set) mod.options.set('showReady', false);
});

for (const { id, tag } of TARGETS) {
    const ok = await page.evaluate((stageId) => {
        const g = window.__game;
        if (!g) return false;
        try {
            g._startStage(stageId);
            // Force into PLAY scene immediately + dismiss any ready card
            g.scene = 'play';
            g.readyT = 999;
            if (g.player) g.player.spawnFreezeT = 0;
            return true;
        } catch (e) {
            return 'ERR: ' + e.message;
        }
    }, id);
    if (ok !== true) {
        console.log(`stage ${id} (${tag}): start failed → ${ok}`);
        continue;
    }
    // Let stage card finish + enter PLAY
    await page.waitForTimeout(800);
    // Walk right ~6 seconds so the camera lands deep into the level —
    // enough to clear spawn-area tutorial hints and reach cover tiles
    // (which live mid-stage, e.g. col 64+ in stage 1).
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(6500);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `/tmp/r309/${id.toString().padStart(2, '0')}-${tag}.png` });
    console.log(`stage ${id} (${tag}) → /tmp/r309/${id.toString().padStart(2, '0')}-${tag}.png`);
}

console.log(`\nERRORS: ${errors.length}`);
for (const e of errors.slice(0, 20)) console.log('  ' + e);
await browser.close();
