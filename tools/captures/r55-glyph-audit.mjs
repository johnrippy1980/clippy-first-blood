// Exercise every scene + key UI element, collect missing-glyph warnings
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const missingGlyphs = new Set();
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => {
    const t = m.text();
    if (t.startsWith('pixelfont: missing glyph')) {
        // Extract the char
        const match = t.match(/missing glyph '(.)'/);
        if (match) missingGlyphs.add(match[1]);
    }
    if (m.type() === 'error') errors.push('CON: ' + t);
});

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Tour every scene with a brief render pass
const scenes = ['title', 'story', 'stageIntro', 'play', 'pause', 'options', 'achievements', 'soundtrack', 'stageSelect', 'stageClear', 'gameOver', 'gameComplete'];
for (const scene of scenes) {
    await page.evaluate((s) => {
        const g = window.__game;
        if (!g.player && s !== 'title' && s !== 'boot') g._startStage(1);
        g.scene = s;
        g.storyTimer = 100;
        if (s === 'achievements') {
            // Force all unlocked to render every icon
            window.__dirtyAch?.();
        }
        if (s === 'gameComplete') {
            g._runRank = null;
            g.totalDeaths = 1;
            g.runStats = g.runStats || {};
            g.runStats.noDamageStages = 2;
            g.player.maxCombo = 20;
        }
    }, scene);
    await page.waitForTimeout(150);
}

// Force all achievements unlocked + render achievements scene one more time
await page.evaluate(async () => {
    const ach = await import('/src/achievements.js');
    for (const a of ach.ACHIEVEMENT_LIST) ach.achievements.unlocked.add(a.id);
    window.__game.scene = 'achievements';
});
await page.waitForTimeout(200);

await browser.close();
console.log('missing glyphs:', missingGlyphs.size);
for (const ch of missingGlyphs) {
    console.log(`  '${ch}'  (codepoint U+${ch.charCodeAt(0).toString(16).padStart(4, '0')})`);
}
console.log('ERRORS:', errors.length);
for (const e of errors.slice(0, 5)) console.log('  ' + e);
