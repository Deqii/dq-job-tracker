#!/usr/bin/env node
/**
 * test/run-extract-tests.mjs - proof for design/tools/extract.mjs: deterministic output, and a loud exit 2 when the mockups
 * disagree in a way nobody has decided yet. Run from the repo root: node test/run-extract-tests.mjs  (log: test/logs/extract.log)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const TMP = path.join(ROOT, 'test/.work/extract');
const LOG = path.join(ROOT, 'test/logs/extract.log');
const OUTS = ['design.css', 'tokens.json', 'motion-table.md', 'extract-report.txt'];
fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, '');
const out = (s = '') => { console.log(s); fs.appendFileSync(LOG, s + '\n'); };
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const run = (mockups, outDir) => spawnSync(process.execPath, ['design/tools/extract.mjs', '--mockups', mockups, '--out', outDir], { cwd: ROOT, encoding: 'utf8' });
const once = (text, from, to) => { if (!text.includes(from)) throw new Error(`mockup changed, text not found: ${from.slice(0, 70)}`); return text.replace(from, to); };
let failed = 0;
const check = (ok, label) => { out(`  ${ok ? 'ok    ' : 'FAILED'} ${label}`); if (!ok) failed++; };

out(`# extract tests  ${new Date().toISOString()}  node ${process.version}`);
fs.rmSync(TMP, { recursive: true, force: true });

out('\n== 1. determinism: two runs, byte-identical outputs');
const hashes = [];
for (const n of [1, 2]) {
  const o = path.join(TMP, `run${n}`); const r = run('design/mockups', o);
  out(`run ${n}: exit ${r.status}`);
  hashes.push(OUTS.map((f) => sha(path.join(o, f))));
  OUTS.forEach((f, i) => out(`  ${hashes[n - 1][i]}  ${f}`));
  check(r.status === 0, `run ${n} exits 0`);
}
check(JSON.stringify(hashes[0]) === JSON.stringify(hashes[1]), 'both runs produce identical files');
check(sha(path.join(ROOT, 'design/design.css')) === hashes[0][0], 'committed design/design.css is up to date with the mockups');
check(sha(path.join(ROOT, 'design/tokens.json')) === hashes[0][1], 'committed design/tokens.json is up to date with the mockups');
const report = fs.readFileSync(path.join(TMP, 'run1/extract-report.txt'), 'utf8');
check(/All CSS animations and transitions are covered by the reduced-motion block\./.test(report), 'every CSS animation/transition is covered by prefers-reduced-motion');
check(/No inline-style transitions or animations\./.test(report), 'no motion hides in inline styles (a media query could not switch it off)');
check(!/warning/i.test(report), 'no warnings in the report');

const mutate = (name, file, from, to) => {
  const dir = path.join(TMP, name, 'mockups'); fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'design/mockups'))) fs.copyFileSync(path.join(ROOT, 'design/mockups', f), path.join(dir, f));
  const p = path.join(dir, file); fs.writeFileSync(p, once(fs.readFileSync(p, 'utf8'), from, to));
  return run(path.relative(ROOT, dir), path.join(TMP, name, 'out'));
};
const conflicts = [
  ['A-hard-differs-on-one-page', 'B-Form.dc.html', '.hard { transition: transform .15s ease, box-shadow .15s ease; }', '.hard { transition: transform .30s ease, box-shadow .15s ease; }', /CONFLICT \(unresolved\): \.hard is defined differently/],
  ['B-sticker-delay-not-a-known-variant', 'B-Detail.dc.html', 'animation-delay: calc(var(--d, 0ms) + 300ms)', 'animation-delay: calc(var(--d, 0ms) + 700ms)', /CONFLICT \(unresolved\): \.sticker is defined differently/],
  ['C-keyframes-differ-on-one-page', 'B-Form.dc.html', '@keyframes pop {', '@keyframes pop-x {', null],
];
for (const [name, file, from, to, re] of conflicts.slice(0, 2)) {
  out(`\n== conflict test ${name}: ${file}`);
  const r = mutate(name, file, from, to);
  out(`  exit ${r.status}; ${(r.stdout + r.stderr).split('\n').filter((l) => /CONFLICT|unresolved/.test(l)).join(' | ')}`);
  check(r.status === 2, 'exit code 2');
  check(re.test(r.stdout), `reports ${re}`);
}
out('\n== conflict test C-pop-keyframes-edited-on-one-page: B-Form.dc.html (pop: the 60% frame scales to 1.3)');
{
  const r = mutate('C-pop', 'B-Form.dc.html', 'scale(1.14) rotate(calc(var(--r, 0deg) + 4deg))', 'scale(1.3) rotate(calc(var(--r, 0deg) + 4deg))');
  out(`  exit ${r.status}; ${(r.stdout + r.stderr).split('\n').filter((l) => /CONFLICT|unresolved/.test(l)).join(' | ')}`);
  check(r.status === 2, 'exit code 2');
  check(/@keyframes pop differs between pages/.test(r.stdout), 'reports "@keyframes pop differs between pages"');
}
out('\n== 2. check.mjs: contract freshness and DESIGN.md honesty');
const checkRun = (dir) => spawnSync(process.execPath, ['design/tools/check.mjs', '--dir', dir], { cwd: ROOT, encoding: 'utf8' });
{
  const r = checkRun('design');
  out(`committed kit: exit ${r.status}; ${(r.stdout + r.stderr).trim().split('\n').slice(-2).join(' | ')}`);
  check(r.status === 0, 'passes on the committed kit');
}
const edit = (d, f, fn) => fs.writeFileSync(path.join(d, f), fn(fs.readFileSync(path.join(d, f), 'utf8')));
const checkCase = (name, label, mutateFn, re) => {
  const d = path.join(TMP, name, 'design');
  fs.cpSync(path.join(ROOT, 'design'), d, { recursive: true, filter: (s) => !/[\\/](\.verify|reference)([\\/]|$)/.test(s) });
  mutateFn(d);
  const r = checkRun(path.relative(ROOT, d));
  out(`${label}: exit ${r.status}; ${(r.stdout + r.stderr).split('\n').filter((l) => /^check:/.test(l)).join(' | ').slice(0, 260)}`);
  check(r.status === 1, `${label}: exit code 1`);
  check(re.test(r.stdout), `${label}: reports ${re}`);
};
checkCase('check-handedit', 'design.css edited by hand', (d) => edit(d, 'design.css', (t) => t + '.shiny { background: linear-gradient(red, blue); }\n'), /design\.css is not what the mockups produce/);
checkCase('check-mockup', 'a mockup changed, contract not regenerated', (d) => edit(d, path.join('mockups', 'B-Form.dc.html'), (t) => once(t, '.opt:hover { background: var(--marker); }', '.opt:hover { background: var(--ink2); }')), /design\.css is not what the mockups produce/);
checkCase('check-hex', 'DESIGN.md mentions an unknown color', (d) => edit(d, 'DESIGN.md', (t) => t + '\nUse #123456 for primary buttons.\n'), /color #123456/);
checkCase('check-var', 'DESIGN.md mentions an unknown custom property', (d) => edit(d, 'DESIGN.md', (t) => t + '\nUse `var(--brand)` for links.\n'), /--brand/);
checkCase('check-kf', 'DESIGN.md mentions an unknown keyframe', (d) => edit(d, 'DESIGN.md', (t) => t + '\nUse @keyframes bounce on buttons.\n'), /@keyframes bounce/);
checkCase('check-file', 'DESIGN.md mentions a missing file', (d) => edit(d, 'DESIGN.md', (t) => t + '\nSee `design/nope.md`.\n'), /design\/nope\.md, which does not exist/);

out(`\n${failed ? `${failed} FAILED` : 'all extract and check expectations held'}`);
process.exit(failed ? 1 : 0);
