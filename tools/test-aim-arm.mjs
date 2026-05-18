// Verify aim arm renders correctly for up/diag-up/forward/diag-down/down.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__game.scene = 'play'; });

await page.evaluate(() => {
    const g = window.__game;
    g.enemies.enemies.length = 0;
    g.enemies.bullets.length = 0;
    g.player.x = 8 * 16;
    g.player.y = (14 - 4) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    g.player.state = 'idle';
});
await page.waitForTimeout(200);

// Aim positions on the SNES canvas (256×224 internal, but we control via mouse on 1024×768 viewport)
// player will be roughly center-screen at (128, 96) internal -> (512, 384) external
// Directly set aim by calling the aimFor result — bypass mouse events.
// We override the input's stored aim to test pure rendering.
const aims = [
    { name: 'forward',  ax: 1, ay: 0 },
    { name: 'diagUp',   ax: 0.7, ay: -0.7 },
    { name: 'up',       ax: 0, ay: -1 },
    { name: 'diagDown', ax: 0.7, ay: 0.7 },
    { name: 'down',     ax: 0, ay: 1 },
    { name: 'leftForward', ax: -1, ay: 0 },
];
for (const a of aims) {
    await page.evaluate((aimDir) => {
        const p = window.__game.player;
        p.aim = { x: aimDir.ax, y: aimDir.ay };
        p.aimAngle = Math.atan2(aimDir.ay, aimDir.ax);
        p.facing = aimDir.ax >= 0 ? 1 : -1;
        p.fireCooldown = 0;
        p.state = 'idle';
    }, a);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `/tmp/clippy-aim-${a.name}.png` });
    console.log(`${a.name}: aim=(${a.ax}, ${a.ay})`);
}
await browser.close();
