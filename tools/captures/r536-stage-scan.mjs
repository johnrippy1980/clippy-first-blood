// R536: programmatic full stage scan
import { chromium } from 'playwright';
const URL = 'http://localhost:8765/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const report = await page.evaluate(async () => {
    // Pull modules
    const constants = await import('/src/constants.js');
    const sprites = (await import('/src/sprites.js')).sprites;
    const STAGES = constants.STAGES;
    const out = [];
    for (const stage of STAGES) {
        const id = stage.id;
        const entry = {
            id,
            name: stage.name,
            category: stage.category,
            boss: stage.boss,
            theme: stage.theme,
            music: stage.music,
            tagline: stage.tagline,
            issues: [],
        };
        // Boss bark check (only if has a boss)
        if (stage.boss) {
            const BOSS_BARK = window.__game?.constructor?.BOSS_BARK || null;
            // Game.js exports it as a module-scope const — not accessible via class
            // Instead check via _drawBossIntro path: read script source? Use lookup.
        }
        // Stage card check
        const STAGE_CARD_KEYS = window.__game?._stageCardKeys || null;
        // Spawn-time check via _startStage (deferred since we'd need to scene-jump)
        out.push(entry);
    }
    return out;
});

console.log('STAGES TOTAL:', report.length);
console.log(JSON.stringify(report, null, 2));
console.log('console errors:', errors.length);
errors.forEach(e => console.log('  ' + e));
await browser.close();
