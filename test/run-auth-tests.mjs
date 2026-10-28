#!/usr/bin/env node
/**
 * test/run-auth-tests.mjs - proof that verify.mjs can reach a login-protected, API-backed page WITHOUT a real login or a real
 * backend, and that it fails loudly instead of auditing the wrong thing.
 *
 * It starts a tiny local "app": a page that needs a session in localStorage (otherwise it redirects to /login, which has no <main>),
 * fetches /api/... and renders <main> from the response. A counter on the server proves how many times the REAL API was hit.
 *
 * Run from the repo root:   node test/run-auth-tests.mjs      (set CHROMIUM_PATH if Playwright's own Chromium is not installed)
 * Output goes to the terminal and to test/logs/auth.log. Exit code 0 = every expectation held, 1 = one failed.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const WORK = path.join(ROOT, 'test/.work/auth');
const LOG = path.join(ROOT, 'test/logs/auth.log');
const TOOL = 'design/tools/verify.mjs';
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, '');
const out = (s = '') => { console.log(s); fs.appendFileSync(LOG, s + '\n'); };

const APP = `<!doctype html><meta charset="utf-8"><title>auth fixture</title>
<style>body{margin:0;font:16px sans-serif}</style><div id="root"></div>
<script>
const root = document.getElementById('root'), q = new URLSearchParams(location.search);
const user = localStorage.getItem('app.user');
if (!user) { history.replaceState(null, '', '/login'); root.innerHTML = '<p>please log in</p>'; }
else {
  if (location.pathname === '/') history.replaceState(null, '', '/dashboard' + location.search);
  const m = location.pathname.match(/^\\/items\\/(.+)$/);
  const calls = [fetch(m ? '/api/items/' + m[1] : '/api/items').then((r) => r.json())];
  if (q.has('stats')) calls.push(fetch('/api/stats').then((r) => r.json()));
  if (q.has('write')) calls.push(fetch('/api/items', { method: 'POST' }).then((r) => r.json()));
  Promise.allSettled(calls).then((res) => {
    const d = res[0].value, n = Array.isArray(d) ? d.length : 1;
    root.innerHTML = '<main data-n="' + n + '" data-user="' + JSON.parse(user).name + '"><h1>' + n + ' items</h1></main>';
  });
}
</script>`;

// ---- the server: serves the app for every non-/api path and COUNTS real API hits
const realHits = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    realHits.push(`${req.method} ${u.pathname}`);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(u.pathname === '/api/items' && req.method === 'GET' ? [{ id: 'real-1' }, { id: 'real-2' }, { id: 'real-3' }] : { id: 'real' }));
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(APP);
});
const port = await new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

const sh = (args) => new Promise((resolve) => {
  const p = spawn(process.execPath, args, { cwd: ROOT, env: process.env });
  let buf = '';
  p.stdout.on('data', (d) => (buf += d)); p.stderr.on('data', (d) => (buf += d));
  p.on('close', (code) => resolve({ code, text: buf.trim() }));
});

// ---- fixtures, written like the agent would write them
const FIX = path.join(WORK, 'fixtures');
fs.mkdirSync(FIX, { recursive: true });
const w = (name, text) => { const f = path.join(FIX, name); fs.writeFileSync(f, text); return path.relative(ROOT, f); };
const itemsFile = w('items.json', JSON.stringify([{ id: 'fx-1' }, { id: 'fx-2' }]));
const itemFile = w('item.json', JSON.stringify({ id: 'fx-detail' }));
const statsFile = w('stats.json', JSON.stringify({ total: 2 }));
const badFile = w('bad.json', '{ not json');
const POST_FILE = w('post.json', JSON.stringify({ id: 'created' }));

const AUTH = { localStorage: { 'app.token': 'fixture-token', 'app.user': { id: '00000000-0000-4000-8000-000000000001', name: 'fixture-user' } } };
const MOCK = { 'GET /api/items': { file: itemsFile }, 'GET /api/stats': { file: statsFile }, 'GET /api/items/*': { file: itemFile } };
const route = (o) => ({ name: 'page', path: '/dashboard', waitFor: 'main', ...o });

// run: [command, expected exit, [regexes that must match], expected number of REAL api hits]
const CASES = [
  { name: 'no-auth-login-wall', why: 'no session: the app redirects to /login, which has no <main>. Must be a config error, never an audit of the login page',
    cfg: { routes: [route({})] }, run: [['reduced', 2, [/route "page": "main" never appeared; the page is at \/login \(expected \/dashboard\)/, /Not logged in \("auth"\)/], 0]] },
  { name: 'no-auth-redirect', why: 'same, but the route has no waitFor: the redirect itself must be caught',
    cfg: { routes: [route({ waitFor: undefined })] }, run: [['reduced', 2, [/\/dashboard redirected to \/login/], 0]] },
  { name: 'auth-and-mock-pass', why: 'fake session + fixtures: the real page renders from fixture data, the real API is never touched',
    cfg: { auth: AUTH, mock: MOCK, routes: [route({ path: '/dashboard?stats=1', waitFor: 'main[data-n="2"][data-user="fixture-user"]' })] }, // the audit of this toy page MUST fail (it ignores the design tokens); what matters is that the offending element is <main><h1> of the protected page, not the login page

    run: [['reduced', 0, [/VERIFY reduced: PASS \(0 violations\)/], 0], ['audit', 1, [/e\.g\. div#root > main > h1/, /VERIFY audit: FAIL/], 0]] },
  { name: 'wildcard-mock', why: '"GET /api/items/*" serves /api/items/<uuid>; exact "GET /api/items" does not shadow it',
    cfg: { auth: AUTH, mock: MOCK, routes: [route({ path: '/items/8f14e45f-ceea-4672-9a4c-0a4b2e9c1d11', waitFor: 'main[data-n="1"]' })] },
    run: [['reduced', 0, [/VERIFY reduced: PASS/], 0]] },
  { name: 'unmocked-read', why: 'the page calls /api/stats but only /api/items is mocked: violation, real API untouched',
    cfg: { auth: AUTH, mock: { 'GET /api/items': { file: itemsFile } }, routes: [route({ path: '/dashboard?stats=1', waitFor: 'main[data-n="2"]' })] },
    run: [['reduced', 1, [/unmocked API call GET \/api\/stats/, /VERIFY reduced: FAIL \(1 violations\)/], 0]] },
  { name: 'unmocked-write', why: 'the page tries to POST: with no POST mock it must never reach the real API and must be reported',
    cfg: { auth: AUTH, mock: { 'GET /api/items': { file: itemsFile } }, routes: [route({ path: '/dashboard?write=1', waitFor: 'main[data-n="2"]' })] },
    run: [['reduced', 1, [/unmocked API call POST \/api\/items/], 0]] },
  { name: 'mocked-write', why: 'a POST with its own mock passes',
    cfg: { auth: AUTH, mock: { 'GET /api/items': { file: itemsFile }, 'POST /api/items': { file: POST_FILE, status: 201 } }, routes: [route({ path: '/dashboard?write=1', waitFor: 'main[data-n="2"]' })] },
    run: [['reduced', 0, [/VERIFY reduced: PASS/], 0]] },
  { name: 'pixels-init-refuses-error-page', why: '--init with an unmocked call must not write a reference image of a broken page',
    cfg: { auth: AUTH, mock: { 'GET /api/items': { file: itemsFile } }, routes: [route({ path: '/dashboard?stats=1', waitFor: 'main[data-n="2"]', reference: 'test/.work/auth/ref-unmocked.png' })] },
    run: [['pixels --init', 1, [/unmocked API call GET \/api\/stats/, /reference NOT written/], 0]], noFile: 'test/.work/auth/ref-unmocked.png' },
  { name: 'pixels-init-clean', why: '--init with every call mocked writes the reference, a second run matches it',
    cfg: { auth: AUTH, mock: MOCK, routes: [route({ path: '/dashboard?stats=1', waitFor: 'main[data-n="2"]', reference: 'test/.work/auth/ref-clean.png' })] },
    run: [['pixels --init', 0, [/reference written: .*ref-clean\.png/], 0], ['pixels', 0, [/VERIFY pixels: PASS/], 0]] },
  { name: 'root-redirect', why: '"/" redirects to /dashboard: a config error unless the route says allowRedirect',
    cfg: { auth: AUTH, mock: MOCK, routes: [route({ path: '/', waitFor: 'main[data-n="2"]' })] },
    run: [['reduced', 2, [/\/ redirected to \/dashboard; fix "path"/], 0]] },
  { name: 'root-redirect-allowed', why: 'allowRedirect: true accepts the redirect',
    cfg: { auth: AUTH, mock: MOCK, routes: [route({ path: '/', waitFor: 'main[data-n="2"]', allowRedirect: true })] },
    run: [['reduced', 0, [/VERIFY reduced: PASS/], 0]] },
  { name: 'bad-fixture-json', why: 'a fixture that is not JSON is a config error (exit 2) before any browser starts',
    cfg: { auth: AUTH, mock: { 'GET /api/items': { file: path.relative(ROOT, path.join(FIX, 'bad.json')) } }, routes: [route({})] },
    run: [['reduced', 2, [/mock "GET \/api\/items": test\/\.work\/auth\/fixtures\/bad\.json is not valid JSON/], 0]] },
  { name: 'missing-fixture', why: 'a missing fixture file is a config error',
    cfg: { auth: AUTH, mock: { 'GET /api/items': { file: 'test/.work/auth/fixtures/nope.json' } }, routes: [route({})] },
    run: [['reduced', 2, [/fixture not found: test\/\.work\/auth\/fixtures\/nope\.json/], 0]] },
  { name: 'bad-mock-key', why: 'a mock key without a method is rejected',
    cfg: { auth: AUTH, mock: { '/api/items': { file: itemsFile } }, routes: [route({})] },
    run: [['reduced', 2, [/mock key "\/api\/items" must look like "GET \/api\/applications\/\*"/], 0]] },
  { name: 'legacy-auth-only', why: 'only "auth", no "mock": the old behaviour is unchanged, the page talks to the REAL API (3 real items, 1 real hit)',
    cfg: { auth: AUTH, routes: [route({ waitFor: 'main[data-n="3"]' })] },
    run: [['reduced', 0, [/VERIFY reduced: PASS/], 1]] },
  { name: 'legacy-nothing', why: 'neither "auth" nor "mock": a page that needs neither is verified exactly as in v1.0',
    cfg: { routes: [route({ path: '/login', waitFor: 'p', allowRedirect: true })] },
    run: [['reduced', 0, [/VERIFY reduced: PASS/], 0]] },
];

const t0 = Date.now();
let failed = 0, checks = 0;
out(`# auth/mock verification tests  ${new Date().toISOString()}  node ${process.version}  CHROMIUM_PATH=${process.env.CHROMIUM_PATH || '(playwright default)'}`);
out(`# ${CASES.length} cases, local app at http://127.0.0.1:${port}\n`);
const summary = [];
for (const c of CASES) {
  const cfgFile = path.join(WORK, `${c.name}.config.json`);
  fs.writeFileSync(cfgFile, JSON.stringify({ baseURL: `http://127.0.0.1:${port}`, blockExternal: true, tokens: 'design/tokens.json', css: 'design/design.css', outDir: 'test/.work/auth/.verify', ...c.cfg }, null, 2));
  const cfgRel = path.relative(ROOT, cfgFile);
  out(`==== ${c.name}: ${c.why}`);
  for (const [cmd, wantCode, patterns, wantHits] of c.run) {
    realHits.length = 0;
    const r = await sh([TOOL, ...cmd.split(' '), '--config', cfgRel]);
    out(`$ node ${TOOL} ${cmd} --config ${cfgRel}`);
    out(r.text.split('\n').map((l) => '  | ' + (l.length > 300 ? l.slice(0, 300) + '...' : l)).join('\n'));
    const missing = patterns.filter((re) => !re.test(r.text));
    const hitsOk = realHits.length === wantHits;
    const fileOk = !c.noFile || (cmd.startsWith('pixels --init') && !fs.existsSync(path.join(ROOT, c.noFile)));
    const ok = r.code === wantCode && !missing.length && hitsOk && fileOk;
    checks++; if (!ok) failed++;
    out(`  => exit ${r.code} (expected ${wantCode}); real API hits ${realHits.length} (expected ${wantHits})${realHits.length ? ` [${realHits.join(', ')}]` : ''}${c.noFile ? `; reference file ${fileOk ? 'absent as required' : 'EXISTS'}` : ''}${missing.length ? `; MISSING in output: ${missing.map(String).join(' ')}` : ''}  ${ok ? 'OK' : 'FAILED'}\n`);
    summary.push({ name: c.name, cmd, ok, code: r.code });
  }
}
server.close();
out('==== summary');
for (const s of summary) out(`${s.ok ? 'ok    ' : 'FAILED'} ${s.name.padEnd(32)} ${s.cmd.padEnd(14)} exit ${s.code}`);
out(`\n${checks - failed}/${checks} expectations held in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
