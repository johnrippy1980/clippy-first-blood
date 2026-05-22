// R167: end-to-end probe that drives every stage's boss kill path.
// Asserts: no runtime errors, every stage's boss actually spawns, every
// stage either reaches stageClear (normal stage) OR rotates to the next
// gauntlet boss (stage 8 post-R226 renumber, and post-game 12). Future
// breakage in any stage's boss-trigger / spawn / clear path surfaces here.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });
page.on('requestfailed', r => errors.push('REQ404: ' + r.url()));
page.on('response', r => { if (r.status() === 404) errors.push('RES404: ' + r.url()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(800);

const findings = [];

// R281: main campaign now 1-11 (BALLMER OFFICE 6 + ARENA 7 inserted).
// Skip 6+7 in this regression — they're FPS arenas with no platformer
// boss spawn, the regression assertions don't apply.
for (let stage = 1; stage <= 11; stage++) {
    if (stage === 6 || stage === 7) continue;
    const r = await page.evaluate(async (s) => {
        const g = window.__game;
        g._startStage(s);
        g.scene = 'play';
        if (g._stageIntro) g._stageIntro = null;
        await new Promise(r => setTimeout(r, 200));

        // Jump player to the boss trigger so the kill loop fires fast.
        const trig = g.level?.data?.bossTrigger?.x;
        if (trig) g.player.x = trig + 8;

        // Tick until boss intro fires (or timeout)
        for (let i = 0; i < 30; i++) {
            try { g._tickPlay(); } catch (e) { return { stage: s, error: 'tickPlay: ' + e.message }; }
            if (g.scene === 'bossIntro') break;
        }
        if (g.scene !== 'bossIntro') {
            return { stage: s, error: 'boss intro did not fire (scene=' + g.scene + ')' };
        }

        // Skip cinematic (villain + counter phases — 230f total). R173:
        // cinematic holds for user input; autoAdvance bypasses that.
        if (g._bossIntro) g._bossIntro.autoAdvance = true;
        for (let i = 0; i < 300; i++) {
            if (!g._bossIntro) break;
            if (g._bossIntro) g._bossIntro.autoAdvance = true;  // re-arm across phase change
            try { g._tickBossIntro(); } catch (e) { return { stage: s, error: 'tickBossIntro: ' + e.message }; }
        }
        g._bossEntrance = null;

        // Boss must exist after intro
        const boss = g.boss || g.enemies?.activeBoss?.();
        if (!boss) return { stage: s, error: 'no boss spawned after intro' };

        // Knock boss down + kill in one shot
        boss.hp = 1;
        try { boss.hurt(99999, 0, { knockBack: 0 }); }
        catch (e) { return { stage: s, error: 'boss.hurt: ' + e.message }; }

        // Tick — non-gauntlet stages reach stageClear; gauntlet stages stay
        // in play with the NEXT boss now spawned.
        for (let i = 0; i < 250; i++) {
            try { g._tickPlay(); } catch (e) { return { stage: s, error: 'post-kill tickPlay: ' + e.message }; }
            if (g.scene === 'stageClear') break;
        }

        const isGauntlet = s === 10; // R281: GAUNTLET (3-boss queue) shifted from 8 to 10
        return {
            stage: s,
            isGauntlet,
            sceneAfterKill: g.scene,
            bossDead: !boss.alive,
            // For gauntlet: a fresh boss should be alive after the kill (next in queue)
            nextBossAlive: isGauntlet ? !!g.enemies?.activeBoss?.() : null,
        };
    }, stage);
    findings.push(r);
}

console.log(JSON.stringify(findings, null, 2));
console.log('Errors:', errors.length);
errors.forEach(e => console.log('  ', e));

await browser.close();

// Audio file 404s in headless chromium are unrelated to gameplay correctness
// (the mp3 fetch fires even though autoplay is blocked) — filter them out.
const significantErrors = errors.filter(e => !/\.mp3/.test(e));
const ok = significantErrors.length === 0
    && findings.every(f => {
        if (f.error) return false;
        if (!f.bossDead) return false;
        if (f.isGauntlet) {
            // Gauntlet: scene stays PLAY, next boss is alive
            return f.sceneAfterKill === 'play' && f.nextBossAlive === true;
        }
        // Normal stage: scene transitions to stageClear
        return f.sceneAfterKill === 'stageClear';
    });
console.log(ok ? '✅ R167 PASS' : '❌ R167 FAIL');
process.exit(ok ? 0 : 1);
