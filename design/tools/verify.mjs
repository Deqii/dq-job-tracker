#!/usr/bin/env node
/**
 * design/tools/verify.mjs  -  make "design drift" machine-detectable in the RUNNING app.
 *
 * Usage (from the repo root, dev server already running):
 *   node design/tools/verify.mjs <audit|anim|reduced|pixels|all> [--route name] [--base-url URL] [--config design/verify.config.json] [--init]
 *
 *   audit    computed styles of every visible element vs the values the mockups really use (tokens.json):
 *            colors, box-shadow (blur 0), border radii, border widths, font family and size
 *   anim     @keyframes in the app vs design.css, running CSS animations vs design.css, expectAnimations per route
 *   reduced  with prefers-reduced-motion: reduce nothing may animate or transition
 *   pixels   screenshot vs reference PNG (pixelmatch). --init writes the reference from the current screenshot
 *   all      audit + anim + reduced + pixels for every route (pixels is skipped when a route has no reference)
 *
 * Exit code: 0 pass | 1 violations | 2 usage / config / environment error.
 * One line per violation, last line:  VERIFY <cmd>: PASS|FAIL (N violations)
 * Chromium: set CHROMIUM_PATH to use a specific browser, otherwise Playwright's own (npx playwright install chromium).
 * What this CANNOT see: values that are inside the allowed sets but used in the wrong place (for example 23px vs 24px radius,
 * layout, spacing). Those are caught by `pixels` and by human review.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

class UsageError extends Error {}
const COMMANDS = ['audit', 'anim', 'reduced', 'pixels', 'all'];
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, dflt) => { const i = argv.indexOf(name); return i > 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const rel = (p) => path.relative(process.cwd(), p) || '.';
const deepMerge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? deepMerge(a[k], v) : v; return o; };

function loadConfig() {
  const cfgPath = path.resolve(flag('--config', 'design/verify.config.json'));
  if (!fs.existsSync(cfgPath)) throw new UsageError(`config not found: ${rel(cfgPath)}`);
  const user = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const cfg = deepMerge({
    baseURL: 'http://localhost:5173', viewport: { width: 1440, height: 900 }, fixedTime: null, blockExternal: false,
    tokens: 'design/tokens.json', css: 'design/design.css', outDir: 'design/.verify', routes: [],
    pixel: { threshold: 0.1, maxDiffRatio: 0.005, tileSize: 64, maxTileRatio: 0.02 },
    audit: { ignoreSelectors: [], extraAllowedColors: [], deviceScaleFactor: 2, checkFonts: true },
    anim: { allowKeyframes: [], sampleMs: 1500 },
  }, user);
  if (flag('--base-url')) cfg.baseURL = flag('--base-url');
  if (!cfg.routes.length) throw new UsageError('config has no routes');
  const only = flag('--route');
  if (only) { cfg.routes = cfg.routes.filter((r) => r.name === only); if (!cfg.routes.length) throw new UsageError(`no route named "${only}"`); }
  return cfg;
}

// ------------------------------------------------------------------ color / number helpers (Node side)
const hexTuple = (h) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); const n = parseInt(h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1]; };
const rgbTuple = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
const toTuple = (c) => (c[0] === '#' ? hexTuple(c) : rgbTuple(c));
const toHex = (t) => '#' + t.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join('');
const splitTop = (str, sep) => { const out = []; let d = 0, cur = ''; for (const ch of str) { if (ch === '(') d++; if (ch === ')') d--; if (ch === sep && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
const normRadius = (tok) => { if (String(tok).endsWith('%')) return tok; const n = parseFloat(tok); if (!Number.isFinite(n)) return String(tok); return n >= 500 ? '999px' : n === 0 ? '0' : `${+n.toFixed(2)}px`; };
const pxNum = (s) => parseFloat(String(s));

function buildAllowed(cfg) {
  const tokens = JSON.parse(fs.readFileSync(path.resolve(cfg.tokens), 'utf8'));
  const colorList = [...new Set([...tokens.used.colors, ...Object.values(tokens.colors), ...cfg.audit.extraAllowedColors])];
  const names = Object.fromEntries(Object.entries(tokens.colors).map(([k, v]) => [v.toLowerCase(), k]));
  return {
    tokens, names,
    colors: colorList.map(toTuple).filter(Boolean),
    radii: new Set(tokens.used.radii.map(normRadius)),
    // Measured in Chromium 141 (chromium-1194): a declared 1.5px border is REPORTED as 1px at every device pixel ratio
    // (borders snap down to whole pixels), so the floor of each fractional width is allowed too. Consequence: 1px vs 1.5px
    // cannot be told apart here; only the pixel diff can.
    widths: tokens.used.borderWidths.map(pxNum).flatMap((w) => (w >= 1 && !Number.isInteger(w) ? [w, Math.floor(w)] : [w])),
    sizes: tokens.used.fontSizes.map(pxNum),
    families: new Set(tokens.used.fontFamilies),
    offsets: new Set(tokens.used.shadows.map((s) => `${s.x} ${s.y}`)),
    webFonts: [...new Set((tokens.fontLinks || []).flatMap((u) => [...u.matchAll(/family=([^:&]+)/g)].map((m) => decodeURIComponent(m[1]).replace(/\+/g, ' ').toLowerCase())))],
  };
}
const colorOk = (t, al) => t[3] < 0.01 || al.colors.some((a) => a[0] === t[0] && a[1] === t[1] && a[2] === t[2] && Math.abs(a[3] - t[3]) < 0.02);
function nearestColor(t, al) {
  let best = null, bd = Infinity;
  for (const a of al.colors) { const d = (a[0] - t[0]) ** 2 + (a[1] - t[1]) ** 2 + (a[2] - t[2]) ** 2 + ((a[3] - t[3]) * 255) ** 2; if (d < bd) { bd = d; best = a; } }
  if (!best) return '?';
  const hex = toHex(best);
  return al.names[hex] ? `${hex} (--${al.names[hex]})` : hex;
}
const nearestNum = (n, list) => [...list].sort((a, b) => Math.abs(a - n) - Math.abs(b - n)).slice(0, 2).map((x) => `${x}px`).join(' or ');

// ------------------------------------------------------------------ browser helpers
async function openRoute(browser, cfg, route, { reduced, dsf = 1 }) {
  const context = await browser.newContext({ viewport: cfg.viewport, deviceScaleFactor: dsf, locale: 'en-US', timezoneId: 'Asia/Jakarta', colorScheme: 'light', reducedMotion: reduced ? 'reduce' : 'no-preference' });
  if (cfg.blockExternal) await context.route((url) => !url.href.startsWith(cfg.baseURL) && url.protocol.startsWith('http'), (r) => r.abort());
  const page = await context.newPage();
  if (cfg.fixedTime && page.clock && page.clock.setFixedTime) await page.clock.setFixedTime(new Date(cfg.fixedTime));
  const url = new URL(route.path, cfg.baseURL).href;
  try { await page.goto(url, { waitUntil: 'load', timeout: 30000 }); }
  catch (e) { await context.close(); throw new UsageError(`cannot open ${url}: ${String(e.message).split('\n')[0]}`); }
  if (route.waitFor) await page.waitForSelector(route.waitFor, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: '* { caret-color: transparent !important; }' });
  if (route.settleMs) await page.waitForTimeout(route.settleMs);
  return { context, page };
}

// ------------------------------------------------------------------ audit
function pageAudit({ ignore }) {
  for (const a of document.getAnimations()) { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* ignore */ } }
  const shortPath = (el) => { const parts = []; let n = el; for (let i = 0; n && n !== document.body && i < 3; i++, n = n.parentElement) { let s = n.tagName.toLowerCase(); if (n.id) s += '#' + n.id; else if (n.classList.length) s += '.' + [...n.classList].slice(0, 2).join('.'); parts.unshift(s); } return parts.join(' > ') || 'body'; };
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'TITLE', 'TEMPLATE', 'OPTION', 'OPTGROUP']);
  const rows = []; let scanned = 0;
  const push = (path, prop, value) => rows.push({ path, prop, value });
  const read = (el, pseudo, path) => {
    const cs = getComputedStyle(el, pseudo);
    const own = !pseudo && ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && (el.value || el.placeholder)));
    push(path, 'background-color', cs.backgroundColor);
    if (own) { push(path, 'color', cs.color); push(path, 'font-family', cs.fontFamily); push(path, 'font-size', cs.fontSize); if (cs.textDecorationLine.includes('underline')) push(path, 'text-decoration-color', cs.textDecorationColor); }
    for (const side of ['top', 'right', 'bottom', 'left']) {
      if (cs.getPropertyValue(`border-${side}-style`) !== 'none' && parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0) { push(path, 'border-width', cs.getPropertyValue(`border-${side}-width`)); push(path, 'border-color', cs.getPropertyValue(`border-${side}-color`)); }
    }
    if (cs.boxShadow !== 'none') push(path, 'box-shadow', cs.boxShadow);
    for (const c of ['top-left', 'top-right', 'bottom-right', 'bottom-left']) { const v = cs.getPropertyValue(`border-${c}-radius`); if (v !== '0px') push(path, 'border-radius', v); }
  };
  for (const el of document.body.querySelectorAll('*')) {
    if (SKIP.has(el.tagName) || el.closest('svg')) continue;
    if (ignore.some((sel) => { try { return el.matches(sel) || !!el.closest(sel); } catch (e) { return false; } })) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || (r.width === 0 && r.height === 0)) continue;
    scanned++;
    const p = shortPath(el);
    read(el, null, p);
    for (const ps of ['::before', '::after']) { const c = getComputedStyle(el, ps).content; if (c && c !== 'none' && c !== 'normal') read(el, ps, p + ps); }
  }
  return { rows, scanned };
}

function auditRows(rows, al) {
  const groups = new Map();
  const add = (prop, value, path, nearest) => { const k = `${prop}\u0000${value}`; if (!groups.has(k)) groups.set(k, { prop, value, nearest, count: 0, ex: [] }); const g = groups.get(k); g.count++; if (g.ex.length < 3 && !g.ex.includes(path)) g.ex.push(path); };
  for (const { path: p, prop, value } of rows) {
    if (['background-color', 'color', 'border-color', 'text-decoration-color'].includes(prop)) { const t = rgbTuple(value); if (t && !colorOk(t, al)) add(prop, value, p, nearestColor(t, al)); }
    else if (prop === 'border-width') { const n = pxNum(value); if (!al.widths.some((w) => Math.abs(w - n) < 0.01)) add(prop, value, p, nearestNum(n, al.widths)); }
    else if (prop === 'border-radius') { for (const tok of value.split(/\s+/)) { const nr = normRadius(tok); if (!al.radii.has(nr) && nr !== '0') add(prop, tok, p, [...al.radii].filter((x) => x.endsWith('px')).map(pxNum).sort((a, b) => Math.abs(a - pxNum(tok)) - Math.abs(b - pxNum(tok))).slice(0, 2).join('px or ') + 'px'); } }
    else if (prop === 'font-family') { const first = splitTop(value, ',')[0].replace(/['"]/g, '').trim().toLowerCase(); if (!al.families.has(first)) add(prop, first, p, [...al.families].join(', ')); }
    else if (prop === 'font-size') { const n = pxNum(value); if (!al.sizes.some((s) => Math.abs(s - n) < 0.01)) add(prop, value, p, nearestNum(n, al.sizes)); }
    else if (prop === 'box-shadow') {
      for (const layer of splitTop(value, ',')) {
        const col = (layer.match(/rgba?\([^)]+\)/) || [])[0];
        const nums = layer.replace(/rgba?\([^)]+\)/, ' ').replace(/\binset\b/, ' ').trim().split(/\s+/).map(pxNum);
        const [x = 0, y = 0, blur = 0, spread = 0] = nums;
        if (/\binset\b/.test(layer)) add('box-shadow', layer, p, 'no inset shadows in the design');
        else if (blur !== 0 || spread !== 0) add('box-shadow', layer, p, `${x}px ${y}px 0 (blur and spread must be 0)`);
        else if (!al.offsets.has(`${x}px ${y}px`)) add('box-shadow', layer, p, [...al.offsets].join(' | '));
        else { const t = col && rgbTuple(col); if (t && !colorOk(t, al)) add('box-shadow-color', col, p, nearestColor(t, al)); }
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).map((g) => `${g.prop} ${g.value}  x${g.count}  e.g. ${g.ex.join(' | ')}  -> nearest allowed: ${g.nearest}`);
}

async function runAudit(browser, cfg, route, al) {
  const { context, page } = await openRoute(browser, cfg, route, { reduced: false, dsf: cfg.audit.deviceScaleFactor });
  const { rows, scanned } = await page.evaluate(pageAudit, { ignore: [...cfg.audit.ignoreSelectors, ...(route.ignoreSelectors || [])] });
  // The computed font-family is only the declared stack, so a web font that failed to load (typo in the URL, blocked CDN,
  // missing @import) is invisible above: the browser quietly uses a system font. Ask the browser which faces really loaded.
  const loaded = cfg.audit.checkFonts === false ? null : new Set(await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/['"]/g, '').trim().toLowerCase())));
  await context.close();
  const lines = auditRows(rows, al);
  if (loaded) for (const fam of al.webFonts) if (!loaded.has(fam)) lines.push(`web font "${fam}" is not loaded, text silently falls back to a system font (load it with the @import in design.css or a self-hosted @font-face). Loaded now: ${[...loaded].join(', ') || 'none'}`);
  return { lines, info: `scanned ${scanned} visible elements${loaded ? `; web fonts loaded: ${[...loaded].join(', ') || 'none'}` : ''}` };
}

// ------------------------------------------------------------------ anim
function pageKeyframes({ cssText }) {
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const walk = (rules, out) => { for (const r of rules) { if (r.type === CSSRule.KEYFRAMES_RULE) out.set(r.name, norm(r.cssText)); else if (r.cssRules) walk(r.cssRules, out); } };
  const toMs = (s) => Math.round((s.endsWith('ms') ? parseFloat(s) : parseFloat(s) * 1000) * 1000) / 1000;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(cssText.replace(/@import[^;]*;/g, ''));
  const design = new Map(); walk(sheet.cssRules, design);
  const tuples = [];
  for (const r of sheet.cssRules) {
    if (r.type !== CSSRule.STYLE_RULE || !r.style.animationName || r.style.animationName === 'none') continue;
    tuples.push({ name: r.style.animationName, duration: toMs(r.style.animationDuration), easing: r.style.animationTimingFunction.replace(/\s+/g, '').toLowerCase(), iterations: r.style.animationIterationCount || '1', selector: r.selectorText });
  }
  const app = new Map(), skipped = [];
  for (const s of document.styleSheets) { try { walk(s.cssRules, app); } catch (e) { skipped.push(s.href || 'inline'); } }
  return { design: [...design], app: [...app], tuples, skipped };
}
async function sampleAnimations(page, ms) {
  return page.evaluate(async ({ ms }) => {
    const shortPath = (el, ps) => { const s = el ? el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '') : '?'; return s + (ps || ''); };
    const seen = new Map(), known = new WeakSet();
    const grab = () => {
      for (const a of document.getAnimations()) {
        if (!(a instanceof CSSAnimation) || known.has(a)) continue;
        known.add(a);
        const t = a.effect.getTiming(), kf = a.effect.getKeyframes();
        const easing = String((kf[0] && kf[0].easing) || t.easing || 'linear').replace(/\s+/g, '').toLowerCase();
        const key = [a.animationName, Math.round(Number(t.duration) * 1000) / 1000, easing, t.iterations === Infinity ? 'infinite' : String(t.iterations)].join('|');
        if (!seen.has(key)) seen.set(key, { name: a.animationName, duration: Number(t.duration), easing, iterations: t.iterations === Infinity ? 'infinite' : String(t.iterations), count: 0, ex: [] });
        const e = seen.get(key); e.count++; const p = shortPath(a.effect.target, a.effect.pseudoElement); if (e.ex.length < 3 && !e.ex.includes(p)) e.ex.push(p);
      }
    };
    const t0 = performance.now(); grab();
    while (performance.now() - t0 < ms) { await new Promise((r) => setTimeout(r, 100)); grab(); }
    return [...seen.values()];
  }, { ms });
}
async function runAnim(browser, cfg, route) {
  const { context, page } = await openRoute(browser, cfg, route, { reduced: false });
  const kf = await page.evaluate(pageKeyframes, { cssText: fs.readFileSync(path.resolve(cfg.css), 'utf8') });
  const seen = await sampleAnimations(page, cfg.anim.sampleMs);
  await context.close();
  const lines = [], design = new Map(kf.design), allow = new Set(cfg.anim.allowKeyframes);
  for (const [name, body] of kf.app) {
    if (allow.has(name)) continue;
    if (!design.has(name)) lines.push(`@keyframes ${name} is not in design.css (a new animation was invented)`);
    else if (design.get(name) !== body) lines.push(`@keyframes ${name} differs from design.css\n      app:    ${body.slice(0, 200)}\n      design: ${design.get(name).slice(0, 200)}`);
  }
  const want = new Set(kf.tuples.map((t) => `${t.name}|${t.duration}|${t.easing}|${t.iterations}`));
  for (const s of seen) {
    if (allow.has(s.name)) continue;
    if (!want.has(`${s.name}|${s.duration}|${s.easing}|${s.iterations}`)) {
      const it = (v) => (v === 'infinite' ? 'infinite' : `x${v}`);
      const same = kf.tuples.filter((t) => t.name === s.name).map((t) => `${t.duration}ms ${t.easing} ${it(t.iterations)}`);
      lines.push(`animation ${s.name} ${s.duration}ms ${s.easing} ${it(s.iterations)} is not declared in design.css  (${s.count}x, e.g. ${s.ex.join(' | ')})  design.css has: ${same.length ? same.join(' or ') : 'no animation with that name'}`);
    }
  }
  for (const name of route.expectAnimations || []) if (!seen.some((s) => s.name === name)) lines.push(`expected animation "${name}" never ran on this route (forgotten animation or class not applied)`);
  const info = `animations seen: ${seen.map((s) => `${s.name} x${s.count}`).join(', ') || 'none'}${kf.skipped.length ? `; unreadable stylesheets skipped: ${kf.skipped.length}` : ''}`;
  return { lines, info };
}

// ------------------------------------------------------------------ reduced
function pageReduced({ ignore }) {
  const shortPath = (el, ps) => { const parts = []; let n = el; for (let i = 0; n && n !== document.body && i < 3; i++, n = n.parentElement) { let s = n.tagName.toLowerCase(); if (n.id) s += '#' + n.id; else if (n.classList.length) s += '.' + [...n.classList].slice(0, 2).join('.'); parts.unshift(s); } return (parts.join(' > ') || 'body') + (ps || ''); };
  const running = document.getAnimations().filter((a) => a.playState === 'running' || a.playState === 'pending').map((a) => ({ name: a.animationName || a.transitionProperty || '?', path: shortPath(a.effect.target, a.effect.pseudoElement) }));
  const rows = [];
  const secs = (v) => v.split(',').map((x) => { x = x.trim(); return x.endsWith('ms') ? parseFloat(x) / 1000 : parseFloat(x); });
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('svg') || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
    if (ignore.some((sel) => { try { return el.matches(sel) || !!el.closest(sel); } catch (e) { return false; } })) continue;
    for (const ps of [null, '::before', '::after']) {
      if (ps) { const c = getComputedStyle(el, ps).content; if (!c || c === 'none' || c === 'normal') continue; }
      const cs = getComputedStyle(el, ps);
      if (secs(cs.transitionDuration).some((s) => s > 0) && cs.transitionProperty !== 'none') rows.push({ path: shortPath(el, ps), prop: 'transition-duration', value: cs.transitionDuration });
      if (cs.animationName !== 'none') rows.push({ path: shortPath(el, ps), prop: 'animation-name', value: cs.animationName });
    }
  }
  return { running, rows };
}
async function runReduced(browser, cfg, route) {
  const { context, page } = await openRoute(browser, cfg, route, { reduced: true });
  await page.waitForTimeout(300);
  const { running, rows } = await page.evaluate(pageReduced, { ignore: [...cfg.audit.ignoreSelectors, ...(route.ignoreSelectors || [])] });
  await context.close();
  const lines = [], groups = new Map();
  for (const r of rows) { const k = `${r.prop}\u0000${r.value}`; if (!groups.has(k)) groups.set(k, { ...r, count: 0, ex: [] }); const g = groups.get(k); g.count++; if (g.ex.length < 3) g.ex.push(r.path); }
  for (const g of groups.values()) lines.push(`${g.prop} ${g.value} under prefers-reduced-motion  x${g.count}  e.g. ${g.ex.join(' | ')}  -> must be 0s / none`);
  if (running.length) lines.push(`${running.length} animation(s) still running under prefers-reduced-motion: ${[...new Set(running.map((r) => r.name))].join(', ')}  e.g. ${running.slice(0, 3).map((r) => r.path).join(' | ')}`);
  return { lines, info: 'prefers-reduced-motion: reduce' };
}

// ------------------------------------------------------------------ pixels
const crop = (png, w, h) => { if (png.width === w && png.height === h) return png.data; const out = Buffer.alloc(w * h * 4); for (let y = 0; y < h; y++) png.data.copy(out, y * w * 4, y * png.width * 4, y * png.width * 4 + w * 4); return out; };
async function runPixels(browser, cfg, route, init) {
  const { context, page } = await openRoute(browser, cfg, route, { reduced: true });
  const shot = await page.screenshot({ fullPage: route.fullPage !== false, animations: 'disabled', caret: 'hide' });
  await context.close();
  const outDir = path.resolve(cfg.outDir); fs.mkdirSync(outDir, { recursive: true });
  const actual = PNG.sync.read(shot);
  fs.writeFileSync(path.join(outDir, `${route.name}.actual.png`), shot);
  const refPath = path.resolve(route.reference || `design/reference/${route.name}.png`);
  if (init) { fs.mkdirSync(path.dirname(refPath), { recursive: true }); fs.writeFileSync(refPath, shot); return { lines: [], info: `reference written: ${rel(refPath)} (${actual.width}x${actual.height})` }; }
  if (!fs.existsSync(refPath)) return { skipped: `no reference at ${rel(refPath)} (create one: node design/tools/verify.mjs pixels --route ${route.name} --init)` };
  const ref = PNG.sync.read(fs.readFileSync(refPath));
  const lines = [];
  if (actual.width !== ref.width || actual.height !== ref.height) lines.push(`size mismatch: actual ${actual.width}x${actual.height} vs reference ${ref.width}x${ref.height} (comparing the overlapping region)`);
  const w = Math.min(actual.width, ref.width), h = Math.min(actual.height, ref.height);
  const diff = new PNG({ width: w, height: h });
  const count = pixelmatch(crop(actual, w, h), crop(ref, w, h), diff.data, w, h, { threshold: cfg.pixel.threshold });
  fs.writeFileSync(path.join(outDir, `${route.name}.diff.png`), PNG.sync.write(diff));
  const ratio = count / (w * h);
  // Two criteria. (1) global: share of differing pixels. (2) local: a small element with the wrong color is invisible to the
  // global ratio (a 30x30 swatch is 0.06% of a 1440x1000 page), so every tile is checked on its own as well.
  const T = cfg.pixel.tileSize, tiles = [];
  for (let ty = 0; ty < h; ty += T) for (let tx = 0; tx < w; tx += T) {
    let n = 0; const tw = Math.min(T, w - tx), th = Math.min(T, h - ty);
    for (let y = ty; y < ty + th; y++) for (let x = tx; x < tx + tw; x++) { const i = (y * w + x) * 4; if (diff.data[i] > 200 && diff.data[i + 1] < 80 && diff.data[i + 2] < 80) n++; }
    if (n) tiles.push({ tx, ty, tw, th, pct: (100 * n) / (tw * th) });
  }
  const hot = tiles.filter((t) => t.pct > cfg.pixel.maxTileRatio * 100).sort((a, b) => b.pct - a.pct);
  const diffImg = rel(path.join(outDir, `${route.name}.diff.png`));
  if (ratio > cfg.pixel.maxDiffRatio) lines.push(`${(ratio * 100).toFixed(2)}% of pixels differ (${count} px), allowed ${(cfg.pixel.maxDiffRatio * 100).toFixed(2)}%  diff image: ${diffImg}`);
  if (hot.length) lines.push(`${hot.length} tile(s) of ${T}x${T}px differ by more than ${(cfg.pixel.maxTileRatio * 100).toFixed(0)}%  diff image: ${diffImg}`);
  for (const t of (lines.length ? hot : []).slice(0, 5)) lines.push(`  region x=${t.tx}..${t.tx + t.tw} y=${t.ty}..${t.ty + t.th} ${Math.round(t.pct)}% differing`);
  return { lines, info: `${w}x${h}, ${count} differing px (${(ratio * 100).toFixed(3)}%), ${hot.length} hot tile(s)` };
}

// ------------------------------------------------------------------ main
async function main() {
  if (!COMMANDS.includes(cmd)) throw new UsageError(`usage: node design/tools/verify.mjs <${COMMANDS.join('|')}> [--route name] [--base-url URL] [--config file] [--init]`);
  const cfg = loadConfig();
  const al = buildAllowed(cfg);
  const cmds = cmd === 'all' ? ['audit', 'anim', 'reduced', 'pixels'] : [cmd];
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text'] }).catch((e) => { throw new UsageError(`cannot launch Chromium (${String(e.message).split('\n')[0]}). Set CHROMIUM_PATH or run: npx playwright install chromium`); });
  const table = []; let total = 0;
  try {
    for (const route of cfg.routes) {
      const row = { route: route.name };
      for (const c of cmds) {
        const res = c === 'audit' ? await runAudit(browser, cfg, route, al) : c === 'anim' ? await runAnim(browser, cfg, route) : c === 'reduced' ? await runReduced(browser, cfg, route) : await runPixels(browser, cfg, route, argv.includes('--init'));
        if (res.skipped) { if (cmd === 'pixels') throw new UsageError(res.skipped); row[c] = 'SKIP'; console.log(`notice: ${c} /${route.name} skipped: ${res.skipped}`); continue; }
        if (res.info) console.log(`info: ${c} /${route.name}: ${res.info}`);
        for (const l of res.lines) console.log(`${c} /${route.name}  ${l}`);
        const n = res.lines.filter((l) => !l.startsWith('  ')).length;
        row[c] = n ? `FAIL(${n})` : 'PASS'; total += n;
      }
      table.push(row);
    }
  } finally { await browser.close(); }
  if (cmd === 'all') { console.log(''); console.log(['route'.padEnd(16), ...cmds.map((c) => c.padEnd(10))].join('')); for (const r of table) console.log([r.route.padEnd(16), ...cmds.map((c) => String(r[c] || '-').padEnd(10))].join('')); }
  console.log(`VERIFY ${cmd}: ${total ? 'FAIL' : 'PASS'} (${total} violations)`);
  process.exit(total ? 1 : 0);
}
main().catch((e) => { console.error(`verify: ${e instanceof UsageError ? '' : 'unexpected error: '}${e.message}`); if (!(e instanceof UsageError) && process.env.DEBUG) console.error(e.stack); process.exit(2); });
