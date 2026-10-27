#!/usr/bin/env node
/**
 * test/opencode-smoke.mjs - runs the REAL opencode CLI (the one on your PATH, or OPENCODE_BIN) against a mock model and
 * proves, from the requests the mock receives and the files left on disk, that this kit works with YOUR opencode version:
 *
 *   1. design/DESIGN.md (opencode.json "instructions") and AGENTS.md reach the model's system prompt
 *   2. /design-port expands $ARGUMENTS into the command template; /design-verify turns its argument into "--route <name>"
 *   3. opencode.json blocks edit/write on the contract files (design.css, tokens.json, mockups, tools)
 *   4. other edits are still allowed (src/, design/verify.config.json)
 *   5. the design-reviewer agent resolves with edit denied
 *
 * No real model, no API key, no network except the one-time npm install of @ai-sdk/openai-compatible into opencode's cache.
 * Usage (repo root):  node test/opencode-smoke.mjs        Env: OPENCODE_BIN, OC_TEST_HOME (keeps the cache between runs)
 * Exit: 0 all held | 1 an expectation failed | 2 cannot run (no opencode, no git, provider install failed)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const OC = process.env.OPENCODE_BIN || 'opencode';
const LOG = path.join(ROOT, 'test/logs/opencode-smoke.log');
fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, '');
const out = (s = '') => { console.log(s); fs.appendFileSync(LOG, s + '\n'); };
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 12);
let failed = 0;
const check = (ok, label) => { out(`  ${ok ? 'ok    ' : 'FAILED'} ${label}`); if (!ok) failed++; };
const cannot = (msg) => { out(`cannot run: ${msg}`); process.exit(2); };

const ver = spawnSync(OC, ['--version'], { encoding: 'utf8' });
if (ver.error || ver.status !== 0) cannot(`"${OC} --version" failed (${ver.error ? ver.error.message : 'exit ' + ver.status}). Install opencode or set OPENCODE_BIN.`);
if (spawnSync('git', ['--version']).status !== 0) cannot('git is required (opencode scopes edit permissions to the git worktree)');

// ---- a throwaway project that looks like yours: git repo + the kit files
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-smoke-'));
const PROJECT = path.join(BASE, 'project');
const HOME = process.env.OC_TEST_HOME ? path.resolve(process.env.OC_TEST_HOME) : path.join(BASE, 'home');
fs.mkdirSync(path.join(PROJECT, 'src'), { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
for (const f of ['AGENTS.md', 'opencode.json', 'package.json']) fs.copyFileSync(path.join(ROOT, f), path.join(PROJECT, f));
fs.cpSync(path.join(ROOT, '.opencode'), path.join(PROJECT, '.opencode'), { recursive: true });
fs.cpSync(path.join(ROOT, 'design'), path.join(PROJECT, 'design'), { recursive: true, filter: (s) => !/[\\/](\.verify|reference)([\\/]|$)/.test(s) });
fs.writeFileSync(path.join(PROJECT, 'src/.keep'), '');
const git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: PROJECT, encoding: 'utf8' });
git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'init');

// ---- the mock model: an OpenAI-compatible /v1/chat/completions endpoint that plays a script
const requests = []; let script = null;
const server = http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) { res.writeHead(404); return res.end('nope'); }
  const json = JSON.parse(body); requests.push(json);
  const last = json.messages[json.messages.length - 1];
  const call = json.tools && script && script.tool && last.role !== 'tool' ? script.tool : null;
  const id = `chatcmpl-${requests.length}`;
  const chunk = (delta, finish = null) => `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: 0, model: 'mock-1', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  if (call) { res.write(chunk({ role: 'assistant', content: null, tool_calls: [{ index: 0, id: `call_${requests.length}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }] })); res.write(chunk({}, 'tool_calls')); }
  else { res.write(chunk({ role: 'assistant', content: json.tools ? 'done' : 'Smoke test' })); res.write(chunk({}, 'stop')); }
  res.write('data: [DONE]\n\n'); res.end();
});
const port = await new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

const inlineConfig = JSON.stringify({
  autoupdate: false, model: 'mock/mock-1', small_model: 'mock/mock-1',
  provider: { mock: { npm: '@ai-sdk/openai-compatible', name: 'Mock', options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: 'x' }, models: { 'mock-1': { name: 'Mock 1', tool_call: true, limit: { context: 64000, output: 4096 } } } } },
});
const env = {
  ...process.env, HOME, XDG_CONFIG_HOME: path.join(HOME, '.config'), XDG_DATA_HOME: path.join(HOME, '.local/share'),
  XDG_CACHE_HOME: path.join(HOME, '.cache'), XDG_STATE_HOME: path.join(HOME, '.local/state'), OPENCODE_CONFIG_CONTENT: inlineConfig, OPENCODE_DISABLE_AUTOUPDATE: '1',
  OPENCODE_DISABLE_MODELS_FETCH: '1',                                        // documented env var: no models.dev lookup, no delay when it is blocked
  NO_PROXY: `127.0.0.1,localhost,${process.env.NO_PROXY || ''}`, no_proxy: `127.0.0.1,localhost,${process.env.no_proxy || ''}`, // the mock is local: a corporate proxy must not intercept it
};
const opencode = (args, ms = 120000) => new Promise((resolve) => {
  // stdin MUST be closed: `opencode run` reads piped stdin and waits for EOF (observed on 1.19.0: with an open pipe it never
  // creates a session and never calls the model). In your own scripts and CI always run it as `opencode run ... < /dev/null`.
  // PWD must match cwd too: a Node child keeps the parent's PWD, and opencode then opened its session in the parent's directory
  // (seen in opencode.log: projectID=global, directory=<kit root>), which made every path in the throwaway project "external".
  const p = spawn(OC, args, { cwd: PROJECT, env: { ...env, PWD: PROJECT }, stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = ''; const t = setTimeout(() => { p.kill('SIGKILL'); buf += '\n[timeout]'; }, ms);
  p.stdout.on('data', (d) => (buf += d)); p.stderr.on('data', (d) => (buf += d));
  p.on('close', (code) => { clearTimeout(t); resolve({ code, text: buf }); });
});
const system = (req) => req.messages.filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
const userText = (req) => req.messages.filter((m) => m.role === 'user').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
const toolReply = (req) => { const m = [...req.messages].reverse().find((x) => x.role === 'tool'); return m ? (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)) : null; };
const P = (...a) => path.join(PROJECT, ...a);
const run = async (label, scr, args) => {
  requests.length = 0; script = scr;
  out(`\n==== ${label}`);
  const r = await opencode(args);
  out(`$ ${path.basename(OC)} ${args.join(' ')}   (exit ${r.code}, ${requests.length} model request(s))`);
  out(r.text.trim().split('\n').slice(-6).map((l) => '  | ' + l.slice(0, 300)).join('\n'));
  return r;
};

out(`# opencode smoke test  ${new Date().toISOString()}  opencode ${ver.stdout.trim()}  node ${process.version}`);
out(`# project ${PROJECT}  mock model http://127.0.0.1:${port}/v1\n# provider cache/home: ${HOME}`);

// ---- 0. static: how opencode resolves the config
{
  out('\n==== 0. opencode debug config / debug agent');
  const c = await opencode(['debug', 'config'], 60000);
  let cfg = null; try { cfg = JSON.parse(c.text.slice(c.text.indexOf('{'))); } catch { /* reported below */ }
  check(!!cfg, 'opencode debug config prints valid JSON');
  if (cfg) {
    check(JSON.stringify(cfg.instructions) === '["design/DESIGN.md"]', 'instructions = ["design/DESIGN.md"]');
    check(cfg.permission && cfg.permission.edit && cfg.permission.edit['design/design.css'] === 'deny' && cfg.permission.edit['*'] === 'allow', 'permission.edit: "*" allow + design/design.css deny');
    check(['design-port', 'design-verify', 'design-sync'].every((n) => cfg.command && cfg.command[n] && cfg.command[n].template), 'commands design-port, design-verify, design-sync are loaded from .opencode/commands');
    check(cfg.agent && cfg.agent['design-reviewer'] && cfg.agent['design-reviewer'].mode === 'subagent' && cfg.agent['design-reviewer'].permission.edit === 'deny', 'agent design-reviewer: subagent, edit denied');
  }
  const a = await opencode(['debug', 'agent', 'design-reviewer'], 60000);
  out(a.text.trim().split('\n').slice(0, 14).map((l) => '  | ' + l.slice(0, 200)).join('\n'));
  check(/"permission":\s*"edit"[\s\S]{0,80}"action":\s*"deny"|edit[\s\S]{0,60}deny/.test(a.text), 'opencode debug agent design-reviewer shows an edit deny rule');
}

// ---- 1+2. instructions reach the model, the command template is expanded
{
  const r = await run('1+2. /design-port B-Detail: what does the model receive?', null, ['run', '--command', 'design-port', 'B-Detail']);
  const main = requests.find((q) => q.tools);
  if (!main) { out(r.text.slice(-1500)); cannot('the mock model never received a request with tools; see the output above (provider install failed?)'); }
  const sys = system(main), usr = userText(main);
  const at = sys.indexOf('Warm Editorial: design contract');
  out(`  system prompt: ${sys.length} chars; DESIGN.md starts at char ${at}: "${sys.slice(Math.max(0, at - 70), at + 40).replace(/\n/g, ' ')}"`);
  check(at >= 0, 'DESIGN.md (through "instructions") is in the system prompt');
  check(sys.includes('Port one mockup page per task with `/design-port <PageName>`'), 'AGENTS.md is in the system prompt');
  check(usr.includes('design/mockups/B-Detail.dc.html') && !usr.includes('$ARGUMENTS'), 'the /design-port template arrived with $ARGUMENTS replaced by B-Detail');
  check(main.tools.map((t) => t.function.name).includes('write') && main.tools.map((t) => t.function.name).includes('edit'), `the model is offered the write and edit tools (${main.tools.map((t) => t.function.name).join(', ')})`);
}

// ---- 2b. /design-verify turns its argument into --route (the verify tool only accepts "--route name")
{
  await run('2b. /design-verify detail: is the route argument expanded?', null, ['run', '--command', 'design-verify', 'detail']);
  const main = requests.find((q) => q.tools), usr = main ? userText(main) : '';
  check(!!main && usr.includes('verify:design -- --route detail') && !usr.includes('$ARGUMENTS'), 'the /design-verify template arrived with the route name in place ("-- --route detail")');
  await run('2c. /design-verify with no argument', null, ['run', '--command', 'design-verify']);
  const m2 = requests.find((q) => q.tools), u2 = m2 ? userText(m2) : '';
  check(!!m2 && u2.includes('The route argument is: ""') && !u2.includes('$ARGUMENTS'), 'with no argument the template says the argument is empty (all routes)');
}

// ---- 3. contract files are protected
const attempts = [
  ['write design/design.css', { name: 'write', args: { filePath: P('design/design.css'), content: '/* hacked */' } }, 'design/design.css'],
  ['edit design/tokens.json', { name: 'edit', args: { filePath: P('design/tokens.json'), oldString: '"marker": "#FFD23F"', newString: '"marker": "#000000"' } }, 'design/tokens.json'],
  ['write design/motion-table.md', { name: 'write', args: { filePath: P('design/motion-table.md'), content: 'hacked' } }, 'design/motion-table.md'],
  ['write design/mockups/B-Form.dc.html', { name: 'write', args: { filePath: P('design/mockups/B-Form.dc.html'), content: 'hacked' } }, 'design/mockups/B-Form.dc.html'],
  ['write design/tools/verify.mjs', { name: 'write', args: { filePath: P('design/tools/verify.mjs'), content: 'process.exit(0)' } }, 'design/tools/verify.mjs'],
];
for (const [label, tool, rel] of attempts) {
  const before = sha(P(rel));
  const r = await run(`3. the model tries to ${label}`, { tool }, ['run', 'edit the file']);
  const reply = requests.map(toolReply).find(Boolean);
  out(`  tool result sent back to the model: ${reply ? JSON.stringify(reply).slice(0, 260) : '(none)'}`);
  check(sha(P(rel)) === before, `${rel} is unchanged on disk`);
  check(!!reply && /denied|prevents|permission|not allowed|rule/i.test(reply), 'the model was told the edit is not allowed');
}

// ---- 3b. KNOWN LIMIT: permission.edit guards the edit/write tools, not the shell. The safety net is design:check.
{
  const rel = 'design/design.css', before = sha(P(rel));
  await run('3b. the model overwrites design/design.css through bash (permission.edit does not cover the shell)', { tool: { name: 'bash', args: { command: 'echo "/* hacked */" > design/design.css', description: 'overwrite the contract' } } }, ['run', 'use the shell']);
  out(`  design/design.css changed on disk: ${sha(P(rel)) !== before}  (documented limit: opencode permissions are not a sandbox)`);
  // the throwaway project has no node_modules, so run the kit's own check.mjs (it finds postcss next to itself) against the project's design/
  const c = spawnSync(process.execPath, [path.join(ROOT, 'design/tools/check.mjs'), '--dir', P('design')], { cwd: PROJECT, encoding: 'utf8' });
  out(`$ node design/tools/check.mjs --dir <project>/design   (exit ${c.status})\n  | ${(c.stdout + c.stderr).trim().split('\n')[0].slice(0, 220)}`);
  check(c.status === 1 && /design\.css is not what the mockups produce/.test(c.stdout + c.stderr), 'design:check fails after the shell overwrite, so the cheat does not pass');
  fs.copyFileSync(path.join(ROOT, rel), P(rel));
}

// ---- 4. allowed edits still work
{
  await run('4a. the model writes src/hello.txt (must be allowed)', { tool: { name: 'write', args: { filePath: P('src/hello.txt'), content: 'hello' } } }, ['run', 'write the file']);
  check(fs.existsSync(P('src/hello.txt')) && fs.readFileSync(P('src/hello.txt'), 'utf8') === 'hello', 'src/hello.txt was written');
  const cfg = P('design/verify.config.json'), before = fs.readFileSync(cfg, 'utf8');
  await run('4b. the model edits design/verify.config.json (routes belong to the app, must be allowed)', { tool: { name: 'edit', args: { filePath: cfg, oldString: '"path": "/applications/1"', newString: '"path": "/jobs/1"' } } }, ['run', 'edit the config']);
  check(fs.readFileSync(cfg, 'utf8') === before.replace('"path": "/applications/1"', '"path": "/jobs/1"'), 'design/verify.config.json was edited');
}

server.close();
const kept = process.env.OC_TEST_HOME ? '' : ` (temporary files: ${BASE})`;
out(`\n${failed ? `${failed} FAILED` : 'all opencode expectations held'}${kept}`);
if (!process.env.KEEP && !process.env.OC_TEST_HOME) fs.rmSync(BASE, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
