// Asset manifest validator. Walks every MANIFEST in src/sprites.js and
// asserts the named file exists on disk. Catches drift like "added a new
// sprite key but forgot the file" or "renamed an asset on disk but not in
// the manifest." Exits 1 if any file missing.
//
// This runs before the playwright smoke and is much faster (no browser).

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Parse src/sprites.js for `export const FOO_MANIFEST = { 'key': 'file.png', ... }`.
// Cheaper than spinning a JS runtime to import the actual module.
const src = readFileSync(resolve(root, 'src/sprites.js'), 'utf8');
const MANIFEST_RX = /export const (\w+_MANIFEST)\s*=\s*\{([^}]+)\}/g;
const ENTRY_RX = /'([^']+)'\s*:\s*'([^']+)'/g;

// Manifest → base path on disk
const BASE_DIRS = {
    SCENE_MANIFEST:  'assets/scenes',
    BG_MANIFEST:     'assets/bg',
    CLIPPY_MANIFEST: 'assets/sprites',
    ENEMY_MANIFEST:  'assets/sprites',
};

const missing = [];
const seen = [];
let m;
while ((m = MANIFEST_RX.exec(src))) {
    const [, name, body] = m;
    const baseDir = BASE_DIRS[name];
    if (!baseDir) {
        console.error(`Unknown manifest "${name}" — add to BASE_DIRS in validate-assets.mjs`);
        process.exit(1);
    }
    let e;
    ENTRY_RX.lastIndex = 0;
    while ((e = ENTRY_RX.exec(body))) {
        const [, key, file] = e;
        const path = resolve(root, baseDir, file);
        seen.push({ manifest: name, key, file });
        if (!existsSync(path)) missing.push({ manifest: name, key, file, path });
    }
}

console.log(`Checked ${seen.length} manifest entries across ${Object.keys(BASE_DIRS).length} manifests.`);

if (missing.length) {
    console.error(`\n❌ ${missing.length} missing files:`);
    for (const m of missing) {
        console.error(`  [${m.manifest}] ${m.key} → ${m.file} (expected at ${m.path})`);
    }
    process.exit(1);
}
console.log('✅ All manifest entries resolve to files on disk.');
