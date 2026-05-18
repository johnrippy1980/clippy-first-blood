// Verify Clippy faces left when moving left + sprite mirrors.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__game.scene = 'play'; });
await page.waitForTimeout(300);

// Get canvas position so we can fire mouse events within it
const cBox = await page.locator('#screen').boundingBox();
console.log('Canvas box:', cBox);

// Mouse to left of canvas center
await page.mouse.move(cBox.x + cBox.width * 0.2, cBox.y + cBox.height * 0.5);
await page.waitForTimeout(250);
const sLeft = await page.evaluate(() => ({ facing: window.__game.player.facing, aim: window.__game.player.aim }));
console.log('Mouse left, facing:', JSON.stringify(sLeft));
await page.screenshot({ path: '/tmp/clippy-facing-left.png' });

// Press left arrow to actually move + face left
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(600);
const sMoved = await page.evaluate(() => ({ facing: window.__game.player.facing, x: window.__game.player.x }));
console.log('After ArrowLeft, facing:', JSON.stringify(sMoved));
await page.screenshot({ path: '/tmp/clippy-moving-left.png' });
await page.keyboard.up('ArrowLeft');

// Mouse to right of canvas
await page.mouse.move(cBox.x + cBox.width * 0.8, cBox.y + cBox.height * 0.5);
await page.waitForTimeout(250);
const sRight = await page.evaluate(() => ({ facing: window.__game.player.facing, aim: window.__game.player.aim }));
console.log('Mouse right, facing:', JSON.stringify(sRight));
await page.screenshot({ path: '/tmp/clippy-facing-right.png' });

await browser.close();
