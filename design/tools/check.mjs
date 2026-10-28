#!/usr/bin/env node
/**
 * design/tools/check.mjs  -  static consistency check, no browser needed (runs in under a second).
 *
 *   1. CONTRACT FRESH   design.css, tokens.json, motion-table.md, extract-report.txt are exactly what extract.mjs produces from
 *                       design/mockups. Catches a hand-edited design.css/tokens.json (for example an agent "fixing" the contract
 *                       to make a check pass) and mockups that changed without `npm run design:sync`.
 *   2. DESIGN.md HONEST every #hex, --custom-property, @keyframes name, cubic-bezier() and `design/...` file path that DESIGN.md
 *                       mentions really exists in the generated contract / on disk. The prose cannot drift from the numbers.
 *
 * Usage (repo root):  node design/tools/check.mjs [--dir design]       Exit: 0 ok | 1 problems | 2 cannot run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const dirArg = argv.indexOf('--dir') >= 0 ? argv[argv.indexOf('--dir') + 1] : 'design';
const DIR = path.resolve(dirArg);
const EXTRACT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'extract.mjs');
const GENERATED = ['design.css', 'tokens.json', 'motion-table.md', 'extract-report.txt'];
const problems = [];
const bad = (m) => problems.push(m);
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

for (const f of [...GENERATED, 'DESIGN.md']) if (!fs.existsSync(path.join(DIR, f))) { console.error(`check: missing ${path.relative(process.cwd(), path.join(DIR, f))}`); process.exit(2); }
if (!fs.existsSync(path.join(DIR, 'mockups'))) { console.error(`check: missing ${path.relative(process.cwd(), path.join(DIR, 'mockups'))}`); process.exit(2); }

// ---- 1. contract fresh
// Scratch folder INSIDE the project (design/.verify is gitignored), never the OS temp dir: some repos forbid writing outside the project.
fs.mkdirSync(path.join(DIR, '.verify'), { recursive: true });
const tmp = fs.mkdtempSync(path.join(DIR, '.verify', 'check-'));
const r = spawnSync(process.execPath, [EXTRACT, '--mockups', path.join(DIR, 'mockups'), '--out', tmp], { encoding: 'utf8' });
if (r.status !== 0) { console.error(`check: extract.mjs failed (exit ${r.status}):\n${(r.stdout + r.stderr).trim().split('\n').slice(-12).join('\n')}`); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(r.status === 2 ? 1 : 2); }
// Line endings are not compared: a Windows checkout with git autocrlf turns every LF into CRLF, which is not an edit.
const lf = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n');
for (const f of GENERATED) {
  if (lf(fs.readFileSync(path.join(tmp, f))) !== lf(fs.readFileSync(path.join(DIR, f)))) bad(`${f} is not what the mockups produce: it was edited by hand, or a mockup changed. Fix: restore it (git checkout) or, if the mockups changed on purpose, run npm run design:sync and review the diff.`);
}
fs.rmSync(tmp, { recursive: true, force: true });

// ---- 2. DESIGN.md honest
const md = read('DESIGN.md');
const tokens = JSON.parse(read('tokens.json'));
const css = read('design.css');
const colors = new Set([...tokens.used.colors, ...Object.values(tokens.colors).map((c) => c.toLowerCase())]);
for (const h of new Set(md.match(/#[0-9a-fA-F]{6}\b/g) || [])) if (!colors.has(h.toLowerCase())) bad(`DESIGN.md mentions color ${h}, which is not used by any mockup (tokens.json).`);
for (const v of new Set(md.match(/(?<![\w-])--[a-z][\w-]*/g) || [])) if (!css.includes(v)) bad(`DESIGN.md mentions ${v}, which does not exist in design.css.`);
for (const m of md.matchAll(/@keyframes\s+([\w-]+)/g)) if (!tokens.keyframes.includes(m[1])) bad(`DESIGN.md mentions @keyframes ${m[1]}, which does not exist (have: ${tokens.keyframes.join(', ')}).`);
const easings = new Set(tokens.easings.map((e) => e.replace(/\s+/g, '')));
for (const m of md.matchAll(/cubic-bezier\([^)]*\)/g)) if (!easings.has(m[0].replace(/\s+/g, ''))) bad(`DESIGN.md mentions ${m[0]}, which no mockup uses.`);
for (const m of md.matchAll(/`((?:design|test|\.opencode)\/[^`\s]+)`/g)) {
  const p = m[1];
  if (/[*<>{}]/.test(p) || p.endsWith('/')) continue;                    // globs, placeholders and directories are not checked
  if (!fs.existsSync(path.resolve(path.dirname(DIR), p))) bad(`DESIGN.md refers to ${p}, which does not exist.`);
}

const rel = path.relative(process.cwd(), DIR) || '.';
if (problems.length) {
  for (const p of problems) console.log(`check: ${p}`);
  console.log(`CHECK: FAIL (${problems.length} problems)`);
  process.exit(1);
}
console.log(`check: ${rel}: generated files match the mockups; DESIGN.md mentions only things that exist`);
console.log('CHECK: PASS (0 problems)');
