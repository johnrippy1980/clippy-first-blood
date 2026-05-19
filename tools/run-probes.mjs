// Run all per-round probes in tools/captures/ as a regression suite.
// Each probe is a self-contained .mjs that exits 0 on pass, non-0 on fail.
// Probes that require the dev server at :8765 are detected by trying to
// fetch the homepage first; if it's down we skip rather than fail.

import { readdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const capturesDir = join(__dirname, 'captures');

// Confirm dev server reachable — probes use playwright to hit localhost:8765.
async function serverUp() {
    try {
        const res = await fetch('http://localhost:8765/', { signal: AbortSignal.timeout(2000) });
        return res.ok;
    } catch { return false; }
}

function runOne(file) {
    return new Promise(resolve => {
        const p = spawn('node', [file], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        p.stdout.on('data', d => out += d);
        p.stderr.on('data', d => err += d);
        const t = setTimeout(() => { p.kill('SIGKILL'); resolve({ code: 124, out, err: err + '\n[TIMEOUT 30s]' }); }, 30000);
        p.on('close', code => { clearTimeout(t); resolve({ code, out, err }); });
    });
}

const up = await serverUp();
if (!up) {
    console.log('Dev server not running at :8765 — start it with `npm run dev` first.');
    process.exit(0);  // skip, not fail
}

const all = (await readdir(capturesDir))
    .filter(f => /^r\d+.*\.mjs$/.test(f))
    .sort();

let passed = 0, failed = 0;
const failures = [];
for (const f of all) {
    const full = join(capturesDir, f);
    const { code, err } = await runOne(full);
    if (code === 0) {
        passed++;
        process.stdout.write('.');
    } else {
        failed++;
        process.stdout.write('F');
        failures.push({ file: f, code, err: err.slice(0, 400) });
    }
}
process.stdout.write('\n');
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
    console.log('\n=== FAILURES ===');
    for (const f of failures) {
        console.log(`\n${f.file} (exit ${f.code})`);
        if (f.err.trim()) console.log(f.err);
    }
}
process.exit(failed === 0 ? 0 : 1);
