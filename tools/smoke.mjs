// Headless smoke test. Loads the game, captures screenshots of TITLE, STORY,
// and STAGE_1, and prints all console errors/warnings + every 404.
//
// Usage: node tools/smoke.mjs

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const URL = 'http://localhost:8765/';
const OUT_DIR = '/tmp/clippy-smoke';

async function main() {
    await fs.mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
        viewport: { width: 1024, height: 768 },
    });
    const page = await ctx.newPage();

    const errors = [];
    const warnings = [];
    const fails = [];

    page.on('console', msg => {
        const txt = `${msg.type()}: ${msg.text()}`;
        if (msg.type() === 'error') errors.push(txt);
        else if (msg.type() === 'warning') warnings.push(txt);
    });
    page.on('pageerror', err => errors.push(`PAGEERROR: ${err.message}`));
    page.on('requestfailed', req => fails.push(`${req.failure()?.errorText} ${req.url()}`));
    page.on('response', resp => {
        if (resp.status() >= 400) fails.push(`${resp.status()} ${resp.url()}`);
    });

    await page.goto(URL, { waitUntil: 'networkidle' });

    // Boot frame — let assets settle
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT_DIR, '01-title.png'), fullPage: false });

    // Click on canvas to gain audio context, then press X (start) to enter story.
    await page.click('#screen');
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT_DIR, '02-story-1.png') });

    // Skip story pages by pressing X a few times
    for (let i = 0; i < 4; i++) {
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(OUT_DIR, `03-story-${i + 2}.png`) });
    }

    // Should now be in STAGE_INTRO or PLAY
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT_DIR, '07-stage1-start.png') });

    // Move + jump + shoot to verify physics + sprite anchor
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT_DIR, '08-running.png') });
    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT_DIR, '09-jump.png') });
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(OUT_DIR, '10-jump-shoot.png') });
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT_DIR, '11-crouch.png') });
    await page.keyboard.up('ArrowDown');

    // Wait + observe parallax movement
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, '12-scrolling.png') });
    await page.keyboard.up('ArrowRight');

    // Pull state snapshot via in-page introspection
    const state = await page.evaluate(() => {
        const g = globalThis.__game || globalThis.game;
        if (!g) return { error: 'no game global' };
        try {
            return {
                scene: g.scene,
                stage: g.stageNum,
                player: g.player ? { x: g.player.x, y: g.player.y, state: g.player.state, w: g.player.w, h: g.player.h } : null,
                enemyCount: g.enemies?.length,
            };
        } catch (e) { return { error: e.message }; }
    });

    await browser.close();

    console.log('\n=== STATE SNAPSHOT ===');
    console.log(JSON.stringify(state, null, 2));
    console.log(`\n=== ERRORS (${errors.length}) ===`);
    errors.forEach(e => console.log('  ' + e));
    console.log(`\n=== WARNINGS (${warnings.length}) ===`);
    warnings.slice(0, 20).forEach(w => console.log('  ' + w));
    console.log(`\n=== FAILED REQUESTS (${fails.length}) ===`);
    fails.slice(0, 40).forEach(f => console.log('  ' + f));
    console.log(`\nScreenshots in ${OUT_DIR}/`);
}

main().catch(e => { console.error(e); process.exit(1); });
