#!/usr/bin/env node
/**
 * test/run-tests.mjs - proof that design/tools/verify.mjs really catches drift (and does not cry wolf).
 *
 * It takes ONE faithful fixture app (test/good/index.html + design/design.css), makes small, realistic mistakes in copies
 * of it (a blurred shadow, a near-miss color, an invented animation, a forgotten reduced-motion block, a shifted layout ...)
 * and asserts that verify.mjs exits with the expected code AND prints the expected message.
 *
 * Run from the repo root:   node test/run-tests.mjs        (set CHROMIUM_PATH if Playwright's own Chromium is not installed)
 * Output goes to the terminal and to test/logs/verify.log.  Exit code 0 = every expectation held, 1 = one failed.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const WORK = path.join(ROOT, 'test/.work');
const LOG = path.join(ROOT, 'test/logs/verify.log');
const HTML = fs.readFileSync(path.join(ROOT, 'test/good/index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'design/design.css'), 'utf8').replace(/^@import url\([^)]*\);\n/m, ''); // offline: no Google Fonts
// Local copies of the two web fonts (the @fontsource devDependencies), so the fixture renders with the REAL fonts, offline.
const FONT_FILES = [['Bricolage Grotesque', 'bricolage-grotesque', [500, 700, 800]], ['Instrument Sans', 'instrument-sans', [400, 500, 600, 700]]];
const fontSrc = (slug, w) => path.join(ROOT, 'node_modules/@fontsource', slug, 'files', `${slug}-latin-${w}-normal.woff2`);
for (const [, slug, ws] of FONT_FILES) for (const w of ws) if (!fs.existsSync(fontSrc(slug, w))) { console.error(`missing ${fontSrc(slug, w)}  ->  run: npm install`); process.exit(2); }
const FONT_FACES = FONT_FILES.flatMap(([fam, slug, ws]) => ws.map((w) => `@font-face { font-family: '${fam}'; font-style: normal; font-weight: ${w}; font-display: block; src: url(./fonts/${slug}-latin-${w}-normal.woff2) format('woff2'); }`)).join('\n') + '\n';
const TOOL = 'design/tools/verify.mjs';
const REF = 'test/.work/home.ref.png'; // outside the per-case folders, so prepare() never deletes it

fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, '');
const out = (s = '') => { console.log(s); fs.appendFileSync(LOG, s + '\n'); };

// ---- mutation helpers: each one THROWS when the text to replace is missing, so a stale fixture can never pass silently
const once = (text, from, to) => { const i = text.indexOf(from); if (i < 0) throw new Error(`fixture changed, text not found: ${from.slice(0, 70)}`); return text.slice(0, i) + to + text.slice(i + from.length); };
const html = (...pairs) => ({ html: (t) => pairs.reduce((a, [f, r]) => once(a, f, r), t) });
const css = (...pairs) => ({ css: (t) => pairs.reduce((a, [f, r]) => once(a, f, r), t) });

// ---- the cases. run: [command, expected exit code, [regexes that must all match the output]]
const CASES = [
  { name: 'good', why: 'faithful port: nothing may be reported', run: [['all', 0, [/VERIFY all: PASS \(0 violations\)/, /home\s+PASS\s+PASS\s+PASS\s+PASS/]]] },

  { name: 'shadow-blur', why: 'soft drop shadow instead of the hard offset shadow',
    ...html(['box-shadow: 4px 4px 0 var(--ink); padding: 18px 22px 20px;', 'box-shadow: 0 6px 16px rgba(0,0,0,.25); padding: 18px 22px 20px;']),
    run: [['audit', 1, [/box-shadow .*6px 16px.*blur and spread must be 0/]]] },
  { name: 'near-miss-color', why: '#FFD000 typed by hand instead of --marker #FFD23F',
    ...html(['background: var(--marker); color: var(--ink); font-size: 12px;', 'background: #FFD000; color: var(--ink); font-size: 12px;']),
    run: [['audit', 1, [/background-color rgb\(255, 208, 0\).*nearest allowed: #ffd23f \(--marker\)/]]] },
  { name: 'foreign-radius', why: '8px radius, a value the mockups never use',
    ...html(['--i: 0; background: var(--card); border: 2px solid var(--ink); border-radius: 18px;', '--i: 0; background: var(--card); border: 2px solid var(--ink); border-radius: 8px;']),
    run: [['audit', 1, [/border-radius 8px/]]] },
  { name: 'wrong-font', why: 'headline set in Inter',
    ...html(['font-family: var(--display); font-weight: 800; font-size: 60px;', 'font-family: Inter, sans-serif; font-weight: 800; font-size: 60px;']),
    run: [['audit', 1, [/font-family inter/]]] },
  { name: 'off-scale-size', why: '19px text, between the 18px and 20px the design uses',
    ...html(['font-size: 17px; line-height: 1.5; color: var(--ink2);', 'font-size: 19px; line-height: 1.5; color: var(--ink2);']),
    run: [['audit', 1, [/font-size 19px/]]] },
  { name: 'thick-border', why: '3px border instead of 2px',
    ...html(['--i: 1; background: var(--card); border: 2px solid var(--ink);', '--i: 1; background: var(--card); border: 3px solid var(--ink);']),
    run: [['audit', 1, [/border-width 3px/]]] },

  { name: 'fonts-missing', why: 'no @font-face and no @import: every headline falls back to a system font, the stack string is unchanged',
    noFonts: true,
    run: [['audit', 1, [/web font "bricolage grotesque" is not loaded/, /web font "instrument sans" is not loaded/]]] },

  { name: 'invented-animation', why: 'a new bounce animation nobody designed',
    ...css(['/* Reduced motion', '@keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }\n.sticker { animation: bounce .6s ease-in-out infinite; }\n/* Reduced motion']),
    run: [['anim', 1, [/@keyframes bounce is not in design\.css/, /animation bounce 600ms/]]] },
  { name: 'changed-duration', why: 'card entrance 300ms instead of 500ms',
    ...css(['.card-in { animation: drop-in-card .5s', '.card-in { animation: drop-in-card .3s']),
    run: [['anim', 1, [/animation drop-in-card 300ms .* is not declared in design\.css.*design\.css has: 500ms/]]] },
  { name: 'changed-keyframes', why: 'card slides 30px instead of 14px',
    ...css(['translateY(-14px) rotate(-1.5deg)', 'translateY(-30px) rotate(-1.5deg)']),
    run: [['anim', 1, [/@keyframes drop-in-card differs from design\.css/]]] },
  { name: 'forgotten-animation', why: 'the bar lost its grow-x class',
    ...html(['<div class="bar" style="height: 100%;', '<div style="height: 100%;']),
    run: [['anim', 1, [/expected animation "grow-x" never ran/]]] },
  { name: 'no-reduced-motion', why: 'the prefers-reduced-motion block was dropped',
    css: (t) => t.slice(0, t.indexOf('@media (prefers-reduced-motion')),
    run: [['reduced', 1, [/transition-duration .* under prefers-reduced-motion/, /animation\(s\) still running under prefers-reduced-motion/]]] },

  { name: 'layout-shift', why: 'main padding 44px instead of 32px (nothing the audit can see)',
    ...html(['padding: 0 32px 48px;', 'padding: 0 44px 48px;']),
    run: [['audit', 0, [/VERIFY audit: PASS/]], ['pixels', 1, [/tile\(s\) of 64x64px differ/, /region x=/]]] },
  { name: 'right-token-wrong-place', why: 'a stamp uses --s3 instead of --s1: allowed value, wrong place (a 30x30px swatch)',
    ...html(['border-radius: 9px; border: 2px solid var(--ink); background: var(--s1);', 'border-radius: 9px; border: 2px solid var(--ink); background: var(--s3);']),
    run: [['audit', 0, [/VERIFY audit: PASS/]], ['pixels', 1, [/tile\(s\) of 64x64px differ/]]] },
];

// ---- static server (the child process cannot be awaited synchronously, the server must keep answering)
let current = null;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(current, p === '/' ? 'index.html' : p);
  if (!file.startsWith(current) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
const listen = () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

const sh = (args) => new Promise((resolve) => {
  const p = spawn(process.execPath, args, { cwd: ROOT, env: process.env });
  let buf = '';
  p.stdout.on('data', (d) => (buf += d)); p.stderr.on('data', (d) => (buf += d));
  p.on('close', (code) => resolve({ code, text: buf.trim() }));
});

function prepare(c) {
  const dir = path.join(WORK, c.name);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), c.html ? c.html(HTML) : HTML);
  let sheet = c.css ? c.css(CSS) : CSS;
  if (!c.noFonts) {
    sheet = FONT_FACES + sheet;
    fs.mkdirSync(path.join(dir, 'fonts'));
    for (const [, slug, ws] of FONT_FILES) for (const w of ws) fs.copyFileSync(fontSrc(slug, w), path.join(dir, 'fonts', `${slug}-latin-${w}-normal.woff2`));
  }
  fs.writeFileSync(path.join(dir, 'design.css'), sheet);
  return dir;
}
function config(c, port) {
  const f = path.join(WORK, c.name, 'verify.config.json');
  fs.writeFileSync(f, JSON.stringify({
    baseURL: `http://127.0.0.1:${port}`, blockExternal: true, tokens: 'design/tokens.json', css: 'design/design.css', outDir: `test/.work/${c.name}/.verify`,
    routes: [{ name: 'home', path: '/', reference: REF, fullPage: true, expectAnimations: ['pop', 'grow-x', 'fade-in', 'ping', 'drop-in-card'] }],
  }, null, 2));
  return path.relative(ROOT, f);
}

const port = await listen();
const t0 = Date.now();
let failed = 0, checks = 0;
out(`# design verification tests  ${new Date().toISOString()}  node ${process.version}  CHROMIUM_PATH=${process.env.CHROMIUM_PATH || '(playwright default)'}`);
out(`# ${CASES.length} cases, fixture = test/good/index.html + design/design.css, base url http://127.0.0.1:${port}\n`);

// the reference image is made ONCE, from the faithful fixture
current = prepare(CASES[0]);
const initCfg = config(CASES[0], port);
const init = await sh([TOOL, 'pixels', '--init', '--config', initCfg]);
out(`$ node ${TOOL} pixels --init --config ${initCfg}\n${init.text}\n(exit ${init.code})\n`);
if (init.code !== 0) { out('cannot create the reference image, aborting'); process.exit(1); }

const summary = [];
for (const c of CASES) {
  current = prepare(c);
  const cfgFile = config(c, port);
  out(`==== ${c.name}: ${c.why}`);
  for (const [cmd, wantCode, patterns] of c.run) {
    const r = await sh([TOOL, cmd, '--config', cfgFile]);
    out(`$ node ${TOOL} ${cmd} --config ${cfgFile}`);
    out(r.text.split('\n').map((l) => '  | ' + (l.length > 400 ? l.slice(0, 400) + '...' : l)).join('\n'));
    const missing = patterns.filter((re) => !re.test(r.text));
    const ok = r.code === wantCode && !missing.length;
    checks++; if (!ok) failed++;
    out(`  => exit ${r.code} (expected ${wantCode})${missing.length ? `, MISSING in output: ${missing.map(String).join(' ')}` : ''}  ${ok ? 'OK' : 'FAILED'}\n`);
    summary.push({ name: c.name, cmd, ok, code: r.code });
  }
}
server.close();
out('==== summary');
for (const s of summary) out(`${s.ok ? 'ok    ' : 'FAILED'} ${s.name.padEnd(26)} ${s.cmd.padEnd(8)} exit ${s.code}`);
out(`\n${checks - failed}/${checks} expectations held in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
