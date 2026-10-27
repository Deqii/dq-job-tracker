#!/usr/bin/env node
/**
 * design/tools/extract.mjs
 *
 * Static extractor. Reads the "Warm Editorial" mockups (design/mockups/B-*.dc.html) as TEXT
 * (postcss + regex, nothing is rendered) and writes the machine-readable design contract:
 *
 *   design/design.css          merged stylesheet: tokens, hover/press classes, keyframes, reduced-motion
 *   design/tokens.json         palette, fonts, and the SET of values the mockups really use
 *   design/motion-table.md     every animation and transition with exact duration / easing / delay
 *   design/extract-report.txt  pages parsed, conflicts and how they were resolved, warnings
 *
 * Usage (from the repo root):   node design/tools/extract.mjs [--mockups design/mockups] [--out design]
 * Exit codes: 0 ok | 1 unexpected error | 2 conflict between pages that RESOLUTIONS below does not cover.
 * The output is deterministic: running it twice gives byte-identical files.
 */
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const MOCKUPS = path.resolve(opt('--mockups', 'design/mockups'));
const OUT = path.resolve(opt('--out', 'design'));
const PAGE_ORDER = ['B-Dashboard', 'B-Applications', 'B-Detail', 'B-Form'];

const reportLines = [];
const say = (s = '') => reportLines.push(s);
let unresolved = 0;
const fail = (msg) => { unresolved++; say(`CONFLICT (unresolved): ${msg}`); };

// ------------------------------------------------------------------ small helpers
const decodeEntities = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const collapse = (s) => s.replace(/\s+/g, ' ').trim();
const cmpKey = (s) => collapse(s).toLowerCase().replace(/\s*,\s*/g, ',').replace(/\s*\(\s*/g, '(').replace(/\s*\)/g, ')');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function splitTop(str, sep) {
  const out = []; let depth = 0, quote = null, cur = '';
  for (const ch of str) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    const hit = sep === ' ' ? /\s/.test(ch) : ch === sep;
    if (hit && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const splitDecls = (s) => splitTop(s, ';').map((d) => { const i = d.indexOf(':'); return i < 0 ? null : [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()]; }).filter(Boolean);

// ------------------------------------------------------------------ load pages
function loadPage(file) {
  const name = path.basename(file).replace(/\.dc\.html$/, '');
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const hs = src.indexOf('<helmet>'), he = src.indexOf('</helmet>');
  if (hs < 0 || he < 0) throw new Error(`${name}: no <helmet> block`);
  const helmet = src.slice(hs, he);
  const css = (helmet.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
  if (!css) throw new Error(`${name}: no <style> in <helmet>`);
  const fontHref = decodeEntities((helmet.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '');
  const sIdx = src.indexOf('<script type="text/x-dc"');
  const sEnd = sIdx >= 0 ? src.indexOf('</script>', sIdx) : -1;
  const script = sIdx >= 0 ? src.slice(sIdx, sEnd) : '';
  const propsRaw = (script.match(/data-props='([^']*)'/) || [])[1];
  const props = propsRaw ? JSON.parse(decodeEntities(propsRaw)) : {};
  const markupStart = he + '</helmet>'.length;
  const markup = src.slice(markupStart, sIdx >= 0 ? sIdx : src.length);
  const rootM = markup.match(/<div class="ed"\s+style="([^"]*)"/);
  if (!rootM) throw new Error(`${name}: root <div class="ed" style="..."> not found`);
  const accent = props.accent && props.accent.default;
  const rootStyle = rootM[1].replace(/\{\{\s*accent\s*\}\}/g, accent || '');
  if (/\{\{/.test(rootStyle)) throw new Error(`${name}: unresolved hole in root style: ${rootStyle.match(/\{\{[^}]*\}\}/)[0]}`);
  const rootDecls = splitDecls(rootStyle);
  return {
    name, file, src, css, fontHref, props, script, scriptOffset: sIdx, markup, markupStart,
    tokens: rootDecls.filter(([p]) => p.startsWith('--')),
    wrapper: rootDecls.filter(([p]) => !p.startsWith('--')),
    preview: props.$preview || null,
  };
}

const files = fs.readdirSync(MOCKUPS).filter((f) => /^B-.*\.dc\.html$/.test(f))
  .sort((a, b) => {
    const ia = PAGE_ORDER.indexOf(a.replace(/\.dc\.html$/, '')), ib = PAGE_ORDER.indexOf(b.replace(/\.dc\.html$/, ''));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
if (!files.length) { console.error(`No B-*.dc.html in ${MOCKUPS}`); process.exit(1); }
const pages = files.map((f) => loadPage(path.join(MOCKUPS, f)));
const ALL = pages.map((p) => p.name);
say(`Pages parsed (${pages.length}): ${ALL.join(', ')}`);

// ------------------------------------------------------------------ tokens, fonts, wrapper (must agree on every page)
const sig = (arr) => JSON.stringify(arr.map(([p, v]) => [p, cmpKey(v)]).sort());
for (const p of pages.slice(1)) {
  if (sig(p.tokens) !== sig(pages[0].tokens)) fail(`root custom properties of ${p.name} differ from ${pages[0].name}`);
  if (sig(p.wrapper) !== sig(pages[0].wrapper)) fail(`root wrapper styles of ${p.name} differ from ${pages[0].name}: ${JSON.stringify(p.wrapper)} vs ${JSON.stringify(pages[0].wrapper)}`);
  if (p.fontHref !== pages[0].fontHref) fail(`Google Fonts link of ${p.name} differs from ${pages[0].name}`);
}
const TOKENS = new Map(pages[0].tokens.map(([p, v]) => [p, v]));

function resolveVars(str, depth = 0) {
  if (depth > 6 || !str.includes('var(')) return str;
  let out = '', i = 0;
  while (i < str.length) {
    const j = str.indexOf('var(', i);
    if (j < 0) { out += str.slice(i); break; }
    out += str.slice(i, j);
    let k = j + 4, d = 1;
    while (k < str.length && d > 0) { if (str[k] === '(') d++; else if (str[k] === ')') d--; k++; }
    const inner = str.slice(j + 4, k - 1);
    const parts = splitTop(inner, ',');
    const name = parts[0].trim();
    const fallback = parts.length > 1 ? inner.slice(inner.indexOf(',') + 1).trim() : null;
    out += TOKENS.has(name) ? TOKENS.get(name) : (fallback !== null ? resolveVars(fallback, depth + 1) : `var(${inner})`);
    i = k;
  }
  return out;
}

// ------------------------------------------------------------------ merge the <style> blocks
const ruleMap = new Map();          // selector -> { selector, variants: Map(sig -> {decls, pages}) }
const kfMap = new Map();            // keyframes name -> Map(sig -> {frames, pages})
const reducedMap = new Map();       // declaration signature -> { decls, selectors: [], pages:Set }
const notes = [];                   // human readable resolution notes

// Page-specific facts that must be preserved when pages are merged (see RESOLUTIONS).
const KEYFRAME_SPLIT = {
  'drop-in': {
    byPage: { 'B-Applications': 'drop-in-card', 'B-Detail': 'drop-in-row', 'B-Form': 'drop-in-menu' },
    classes: { '.card-in': 'drop-in-card', '.hist-in': 'drop-in-row', '.menu-in': 'drop-in-menu' },
    why: 'three different slide distances (14px + 1.5deg tilt on cards, 12px on history rows, 10px on menus)',
  },
};

const declSig = (decls) => decls.map((d) => `${d.prop}:${cmpKey(d.value)}${d.important ? '!' : ''}`).join(';');
const emitDecls = (decls) => decls.map((d) => `${d.prop}: ${d.value}${d.important ? ' !important' : ''};`).join(' ');
const readDecls = (node) => node.nodes.filter((n) => n.type === 'decl').map((d) => ({ prop: d.prop.toLowerCase(), value: collapse(d.value), important: !!d.important }));

function addRule(page, rule, target = ruleMap) {
  const selector = splitTop(collapse(rule.selector), ',').join(', ');
  let decls = readDecls(rule);
  // keyframes that were split per page: point the matching classes at their own copy
  for (const [orig, cfg] of Object.entries(KEYFRAME_SPLIT)) {
    if (cfg.classes[selector]) decls = decls.map((d) => (d.prop === 'animation' ? { ...d, value: d.value.replace(new RegExp(`(^|\\s)${orig}(\\s|$)`), `$1${cfg.classes[selector]}$2`) } : d));
  }
  if (!target.has(selector)) target.set(selector, { selector, variants: new Map() });
  const entry = target.get(selector);
  const s = declSig(decls);
  if (!entry.variants.has(s)) entry.variants.set(s, { decls, pages: [] });
  entry.variants.get(s).pages.push(page.name);
}

for (const page of pages) {
  const root = postcss.parse(page.css);
  for (const node of root.nodes) {
    if (node.type === 'comment') continue;
    if (node.type === 'rule') { addRule(page, node); continue; }
    if (node.type === 'atrule' && node.name === 'keyframes') {
      const orig = node.params.trim();
      const split = KEYFRAME_SPLIT[orig];
      const name = split && split.byPage[page.name] ? split.byPage[page.name] : orig;
      if (split && !split.byPage[page.name]) fail(`@keyframes ${orig} appears on ${page.name}, which KEYFRAME_SPLIT does not know`);
      const frames = node.nodes.filter((n) => n.type === 'rule').map((r) => ({ sel: splitTop(collapse(r.selector), ',').join(', '), decls: readDecls(r) }));
      const s = frames.map((f) => `${f.sel}{${declSig(f.decls)}}`).join('');
      if (!kfMap.has(name)) kfMap.set(name, new Map());
      const v = kfMap.get(name);
      if (!v.has(s)) v.set(s, { frames, pages: [] });
      v.get(s).pages.push(page.name);
      continue;
    }
    if (node.type === 'atrule' && node.name === 'media' && /prefers-reduced-motion:\s*reduce/.test(node.params)) {
      for (const r of node.nodes.filter((n) => n.type === 'rule')) {
        const decls = readDecls(r), s = declSig(decls);
        if (!reducedMap.has(s)) reducedMap.set(s, { decls, selectors: [], pages: new Set() });
        const e = reducedMap.get(s);
        for (const sel of splitTop(collapse(r.selector), ',')) if (!e.selectors.includes(sel)) e.selectors.push(sel);
        e.pages.add(page.name);
      }
      continue;
    }
    fail(`unsupported top-level node in ${page.name}: ${node.type} ${node.name || ''} ${(node.selector || node.params || '').slice(0, 60)}`);
  }
}

// ---- RESOLUTIONS: the ONLY conflicts between pages that a human has decided. Anything else exits 2.
const setDecl = (decls, prop, value) => decls.map((d) => (d.prop === prop ? { ...d, value } : d));
const dropProp = (decls, prop) => decls.filter((d) => d.prop !== prop);
const valuesOf = (variants, prop) => variants.map((v) => (v.decls.find((d) => d.prop === prop) || {}).value);
const RESOLUTIONS = {
  // a. .field: Dashboard/Applications animate only box-shadow, Detail/Form also background-color. Use the superset.
  '.field': {
    allowed: { prop: 'transition', values: ['box-shadow .15s ease', 'box-shadow .15s ease, background-color .15s ease'] },
    apply: (decls) => setDecl(decls, 'transition', 'box-shadow .15s ease, background-color .15s ease'),
    note: 'transition: superset (box-shadow + background-color)',
  },
  // b. .sticker: the pop-in starts 500ms (Dashboard), 400ms (Applications), 300ms (Detail, Form) after load.
  //    One rule reads --sticker-base; each page wrapper sets its own value (listed in tokens.json and motion-table.md).
  '.sticker': {
    allowed: { prop: 'animation-delay', values: ['calc(var(--d, 0ms) + 500ms)', 'calc(var(--d, 0ms) + 400ms)', 'calc(var(--d, 0ms) + 300ms)'] },
    apply: (decls) => setDecl(decls, 'animation-delay', 'calc(var(--d, 0ms) + var(--sticker-base, 300ms))'),
    note: 'animation-delay uses --sticker-base (per page: set it on the page wrapper)',
  },
  // c. .live::after: Detail lets the page recolor the ping through --ping, the others use --s3 directly.
  '.live::after': {
    allowed: { prop: 'background', values: ['var(--s3)', 'var(--ping, var(--s3))'] },
    apply: (decls) => setDecl(decls, 'background', 'var(--ping, var(--s3))'),
    note: 'background: var(--ping, var(--s3)) (superset)',
  },
};

const stickerBase = {};
const GUARD = ':not(:disabled)';
// auto-merge: ".x:hover" on one page and ".x:hover:not(:disabled)" on another with identical declarations (see report)
for (const [sel, entry] of [...ruleMap.entries()]) {
  const guarded = ruleMap.get(sel + GUARD);
  if (!guarded || entry.variants.size !== 1 || guarded.variants.size !== 1) continue;
  const [a] = entry.variants.values(), [b] = guarded.variants.values();
  if (declSig(a.decls) === declSig(b.decls)) {
    b.pages.push(...a.pages);
    ruleMap.delete(sel);
    notes.push(`selector variant merged: "${sel}" (${a.pages.join(', ')}) -> "${sel + GUARD}" (declarations identical; the guard only prevents hover/press on disabled buttons)`);
  }
}

const merged = [];                  // { selector, decls, pages }
for (const entry of ruleMap.values()) {
  const variants = [...entry.variants.values()];
  if (variants.length === 1) { merged.push({ selector: entry.selector, decls: variants[0].decls, pages: variants[0].pages }); continue; }
  const res = RESOLUTIONS[entry.selector];
  const pagesAll = [...new Set(variants.flatMap((v) => v.pages))];
  const others = variants.map((v) => declSig(dropProp(v.decls, res ? res.allowed.prop : '')));
  const sameElsewhere = others.every((o) => o === others[0]);
  const valuesOk = res && valuesOf(variants, res.allowed.prop).every((v) => v && res.allowed.values.map(cmpKey).includes(cmpKey(v)));
  if (!res || !sameElsewhere || !valuesOk) {
    fail(`${entry.selector} is defined differently on ${pagesAll.join(', ')}:`);
    for (const v of variants) say(`    ${v.pages.join(', ')}: { ${emitDecls(v.decls)} }`);
    continue;
  }
  if (entry.selector === '.sticker') {
    for (const v of variants) { const m = valuesOf([v], 'animation-delay')[0].match(/\+\s*(\d+ms)\)/); for (const pg of v.pages) stickerBase[pg] = m[1]; }
  }
  merged.push({ selector: entry.selector, decls: res.apply(variants[0].decls), pages: pagesAll });
  notes.push(`${entry.selector}: ${res.note}  [${variants.map((v) => v.pages.join('+') + ': ' + (valuesOf([v], res.allowed.prop)[0])).join(' | ')}]`);
}

const keyframes = [];               // { name, frames, pages }
for (const [name, variants] of kfMap.entries()) {
  const vs = [...variants.values()];
  if (vs.length > 1) { fail(`@keyframes ${name} differs between pages: ${vs.map((v) => v.pages.join('+')).join(' vs ')}`); continue; }
  keyframes.push({ name, frames: vs[0].frames, pages: vs[0].pages });
}
for (const [orig, cfg] of Object.entries(KEYFRAME_SPLIT)) notes.push(`@keyframes ${orig} split into ${Object.values(cfg.byPage).join(', ')}: ${cfg.why}`);

// ------------------------------------------------------------------ values really used (inline styles, CSS, scripts, svg attributes)
const COLOR_RE = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g;
const normHex = (h) => { h = h.toLowerCase(); return h.length === 4 ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h; };
function normColor(c) {
  if (!c) return '';
  if (c[0] === '#') return normHex(c);
  const m = c.match(/^rgba?\(([^)]*)\)$/);
  if (!m) return collapse(c);
  const p = m[1].split(',').map((x) => x.trim());
  if (p.length === 4) p[3] = String(parseFloat(p[3]));
  return `${c.startsWith('rgba') ? 'rgba' : 'rgb'}(${p.join(', ')})`;
}
const numStr = (n) => { const x = parseFloat(n); return Number.isInteger(x) ? String(x) : String(x); };
const px = (s) => (parseFloat(s) === 0 ? '0' : `${numStr(s)}px`);
const used = { colors: new Set(), radii: new Set(), borderWidths: new Set(), outlineWidths: new Set(), shadows: new Map(), fontSizes: new Set(), fontFamilies: new Set() };
const skippedHoles = new Map();

function parseShadow(value) {
  const layers = [];
  for (const layer of splitTop(resolveVars(value), ',')) {
    if (/^none$/i.test(layer)) continue;
    // var(--sh) is set per element in the markup (marker, card, crit); its color is only known at runtime
    const dynamic = /var\(/.test(layer);
    const cleaned = layer.replace(/var\((?:[^()]|\([^)]*\))*\)/g, ' ');
    const colors = cleaned.match(COLOR_RE) || [];
    const nums = cleaned.replace(COLOR_RE, ' ').replace(/\binset\b/i, ' ').trim().split(/\s+/).filter(Boolean);
    if (nums.length < 2 || nums.some((n) => !/^-?\d*\.?\d+(px)?$/.test(n))) { say(`warning: could not parse box-shadow layer "${layer}"`); continue; }
    const [x, y, blur = '0', spread = '0'] = nums;
    layers.push({ x: px(x), y: px(y), blur: px(blur), spread: px(spread), color: colors[0] ? normColor(colors[0]) : (dynamic ? 'dynamic' : '') });
  }
  return layers;
}

function collect(prop, rawValue) {
  const value = resolveVars(rawValue);
  for (const c of value.match(COLOR_RE) || []) used.colors.add(normColor(c));
  const toks = value.replace(/!important/i, '').split(/[\s/,]+/).filter(Boolean);
  if (/^border(-(top|bottom)-(left|right))?-radius$/.test(prop)) for (const t of toks) if (/^-?[\d.]+(px|%)?$/.test(t)) used.radii.add(t.endsWith('%') ? t : px(t));
  if (prop === 'border' || /^border-(top|right|bottom|left)$/.test(prop)) { const w = toks.find((t) => /^[\d.]+(px)?$/.test(t) && parseFloat(t) > 0); if (w) used.borderWidths.add(px(w)); }
  if (prop === 'border-width') for (const t of toks) if (/^[\d.]+(px)?$/.test(t) && parseFloat(t) > 0) used.borderWidths.add(px(t));
  if (prop === 'outline') { const w = toks.find((t) => /^[\d.]+(px)?$/.test(t) && parseFloat(t) > 0); if (w) used.outlineWidths.add(px(w)); }
  if (prop === 'font-size' && /^[\d.]+px$/.test(value.trim())) used.fontSizes.add(px(value.trim()));
  if (prop === 'font-family') { const first = (splitTop(value, ',')[0] || '').replace(/['"]/g, '').trim().toLowerCase(); if (first) used.fontFamilies.add(first); }
  if (prop === 'box-shadow') for (const l of parseShadow(rawValue)) used.shadows.set(JSON.stringify(l), l);
}

const inlineMotion = [];            // inline style transitions / animations (cannot be reached by a CSS media query)
for (const page of pages) {
  const re = /\sstyle="([^"]*)"/g;
  let m;
  while ((m = re.exec(page.markup))) {
    for (const [prop, value] of splitDecls(m[1])) {
      if (value.includes('{{')) { skippedHoles.set(prop, (skippedHoles.get(prop) || 0) + 1); continue; }
      collect(prop, value);
      if (/^(transition|animation)/.test(prop)) inlineMotion.push(`${page.name}.dc.html:${lineOf(page.src, page.markupStart + m.index)}  ${prop}: ${value}`);
    }
  }
  for (const m2 of page.markup.matchAll(/\s(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{3,8})"/g)) used.colors.add(normColor(m2[1]));
  for (const c of page.script.match(COLOR_RE) || []) used.colors.add(normColor(c));
  for (const [prop, value] of splitDecls(page.wrapper.map(([p, v]) => `${p}:${v}`).join(';'))) collect(prop, value);
}
for (const r of merged) for (const d of r.decls) collect(d.prop, d.value);
for (const [, v] of TOKENS) for (const c of resolveVars(v).match(COLOR_RE) || []) used.colors.add(normColor(c));

// ------------------------------------------------------------------ animation / transition parsing (for motion-table.md and the coverage check)
const EASING_RE = /^(ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|cubic-bezier\(.*\)|steps\(.*\))$/;
function parseAnimation(value, decls) {
  const t = splitTop(value, ' ');
  const times = t.filter((x) => /^[\d.]+m?s$/.test(x));
  const delayDecl = decls.find((d) => d.prop === 'animation-delay');
  return {
    name: t.find((x) => /^[a-z][\w-]*$/i.test(x) && !EASING_RE.test(x) && !/^(infinite|none|forwards|backwards|both|normal|reverse|alternate|running|paused)$/.test(x)) || '?',
    duration: times[0] || '?', easing: t.find((x) => EASING_RE.test(x)) || 'ease (default)',
    delay: delayDecl ? delayDecl.value : (times[1] || '0s'),
    iteration: t.find((x) => /^(infinite|\d+)$/.test(x)) || '1', fill: t.find((x) => /^(forwards|backwards|both)$/.test(x)) || 'none',
  };
}
function parseTransitions(value) {
  return splitTop(value, ',').map((part) => {
    const t = splitTop(part, ' ');
    const times = t.filter((x) => /^[\d.]+m?s$/.test(x));
    return { property: t[0], duration: times[0] || '?', easing: t.find((x) => EASING_RE.test(x)) || 'ease (default)', delay: times[1] || '0s' };
  });
}

// ------------------------------------------------------------------ reduced-motion coverage
const reducedBySel = { animation: new Set(), transition: new Set() };
for (const e of reducedMap.values()) for (const d of e.decls) if (d.prop in reducedBySel) for (const s of e.selectors) reducedBySel[d.prop].add(s);
const uncovered = [];
for (const r of merged) {
  const hasA = r.decls.some((d) => d.prop === 'animation' && !/^none\b/.test(d.value));
  const hasT = r.decls.some((d) => d.prop === 'transition' && !/^none\b/.test(d.value));
  for (const s of splitTop(r.selector, ',')) {
    if (hasA && !reducedBySel.animation.has(s)) uncovered.push(`${s}  (animation, ${r.pages.join(' ')})`);
    if (hasT && !reducedBySel.transition.has(s)) uncovered.push(`${s}  (transition, ${r.pages.join(' ')})`);
  }
}

// ------------------------------------------------------------------ write outputs
const pagesNote = (pgs) => (pgs.length === ALL.length ? 'all pages' : pgs.join(' '));
const out = [];
out.push('/* GENERATED by design/tools/extract.mjs from design/mockups. Do not edit by hand.');
out.push('   Re-run: node design/tools/extract.mjs   (conflicts between pages are decided in RESOLUTIONS inside that script)');
out.push('   Fonts: this @import is the same URL as the <link> in the mockups; you may load it with a <link> in index.html instead. */');
out.push(`@import url("${pages[0].fontHref}");`);
out.push('');
out.push('/* Tokens. Declared on :root so portals, modals and toasts resolve them too (the mockups declare them on the .ed wrapper). */');
out.push(`:root { ${pages[0].tokens.map(([p, v]) => `${p}: ${v};`).join(' ')} }`);
out.push('');
out.push('/* Page wrapper, as authored on the root element of every mockup. Page-specific variable: --sticker-base (see tokens.json "pages"). */');
out.push(`.ed { ${pages[0].wrapper.map(([p, v]) => `${p}: ${v};`).join(' ')} }`);
out.push('');
out.push('/* Rules (first-appearance order; the comment says which mockup defines each rule) */');
for (const r of merged) out.push(`${r.selector} { ${emitDecls(r.decls)} } /* ${pagesNote(r.pages)} */`);
out.push('');
out.push('/* Keyframes */');
for (const k of keyframes) {
  out.push(`@keyframes ${k.name} { /* ${pagesNote(k.pages)} */`);
  for (const f of k.frames) out.push(`  ${f.sel} { ${emitDecls(f.decls)} }`);
  out.push('}');
}
out.push('');
out.push('/* Reduced motion: everything above that animates is switched off. */');
out.push('@media (prefers-reduced-motion: reduce) {');
for (const e of reducedMap.values()) out.push(`  ${e.selectors.join(', ')} { ${emitDecls(e.decls)} }`);
out.push('}');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'design.css'), out.join('\n') + '\n');

const byNum = (a, b) => parseFloat(a) - parseFloat(b) || (a < b ? -1 : a > b ? 1 : 0);
const sortedShadows = [...used.shadows.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const durations = new Set(), easings = new Set();
const animRows = [], transRows = [];
for (const r of merged) {
  const an = r.decls.find((d) => d.prop === 'animation'), tr = r.decls.find((d) => d.prop === 'transition');
  if (an && !/^none\b/.test(an.value)) { const a = parseAnimation(an.value, r.decls); durations.add(a.duration); easings.add(a.easing); animRows.push({ selector: r.selector, ...a, pages: r.pages }); }
  if (tr && !/^none\b/.test(tr.value)) for (const t of parseTransitions(tr.value)) { durations.add(t.duration); easings.add(t.easing); transRows.push({ selector: r.selector, ...t, pages: r.pages }); }
}
const tokensJson = {
  generatedBy: 'design/tools/extract.mjs (do not edit by hand)',
  colors: Object.fromEntries([...TOKENS.entries()].filter(([k]) => !k.startsWith('--display')).map(([k, v]) => [k.slice(2), v])),
  fonts: { display: TOKENS.get('--display'), body: (pages[0].wrapper.find(([p]) => p === 'font-family') || [])[1] },
  fontLinks: [pages[0].fontHref],
  wrapper: Object.fromEntries(pages[0].wrapper),
  used: {
    colors: [...used.colors].sort(),
    radii: [...used.radii].sort(byNum),
    borderWidths: [...used.borderWidths].sort(byNum),
    outlineWidths: [...used.outlineWidths].sort(byNum),
    shadows: sortedShadows,
    fontSizes: [...used.fontSizes].sort(byNum),
    fontFamilies: [...used.fontFamilies].sort(),
  },
  keyframes: keyframes.map((k) => k.name).sort(),
  durations: [...durations].sort(byNum),
  easings: [...easings].sort(),
  pages: Object.fromEntries(pages.map((p) => [p.name, { '--sticker-base': stickerBase[p.name] || null, preview: p.preview }])),
};
fs.writeFileSync(path.join(OUT, 'tokens.json'), JSON.stringify(tokensJson, null, 2) + '\n');

const scriptHits = [];
for (const p of pages) {
  const lines = p.src.split('\n');
  lines.forEach((ln, i) => { if (i + 1 >= lineOf(p.src, p.scriptOffset) && /requestAnimationFrame|cancelAnimationFrame|matchMedia|Math\.pow|const dur\b/.test(ln)) scriptHits.push(`${p.name}.dc.html:${i + 1}  ${ln.trim()}`); });
}
const md = [];
md.push('# Motion table', '', 'GENERATED by `design/tools/extract.mjs` from the mockups. Every value is copied from `design/design.css`. Do not edit by hand.', '');
md.push('## CSS animations', '', '| selector | name | duration | easing | delay | iteration | fill | pages |', '|---|---|---|---|---|---|---|---|');
for (const a of animRows) md.push(`| \`${a.selector}\` | ${a.name} | ${a.duration} | \`${a.easing}\` | \`${a.delay}\` | ${a.iteration} | ${a.fill} | ${pagesNote(a.pages)} |`);
md.push('', '## CSS transitions', '', '| selector | property | duration | easing | delay | pages |', '|---|---|---|---|---|---|');
for (const t of transRows) md.push(`| \`${t.selector}\` | ${t.property} | ${t.duration} | \`${t.easing}\` | ${t.delay} | ${pagesNote(t.pages)} |`);
md.push('', '## Keyframes', '', '| name | pages |', '|---|---|');
for (const k of keyframes) md.push(`| ${k.name} | ${pagesNote(k.pages)} |`);
md.push('', '## Per-page `--sticker-base`', '', 'Set it on the page wrapper, e.g. `<div className="ed" style={{ "--sticker-base": "400ms" }}>`.', '', '| page | --sticker-base |', '|---|---|');
for (const p of pages) md.push(`| ${p.name} | ${stickerBase[p.name] || '(page has no .sticker)'} |`);
md.push('', '## JS-driven motion (found in the mockup scripts, verbatim lines)', '');
md.push(scriptHits.length ? scriptHits.map((l) => `- \`${l}\``).join('\n') : '- none found');
md.push('', '## Reduced motion', '', 'Every selector above has a matching rule in the `prefers-reduced-motion: reduce` block of design.css, except the ones listed under "Not covered" in `extract-report.txt`.', '');
fs.writeFileSync(path.join(OUT, 'motion-table.md'), md.join('\n'));

say('');
say(`Rules merged: ${merged.length}   keyframes: ${keyframes.length}   reduced-motion groups: ${reducedMap.size}`);
say('Resolved by design (RESOLUTIONS / KEYFRAME_SPLIT / auto-merge):');
for (const n of notes) say(`  - ${n}`);
say('');
say(`Per-page --sticker-base: ${pages.map((p) => `${p.name}=${stickerBase[p.name] || 'n/a'}`).join(', ')}`);
say(`Declarations skipped because they contain {{holes}} (values come from data at runtime): ${[...skippedHoles.entries()].sort().map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}`);
say('');
say('REDUCED-MOTION COVERAGE');
say(uncovered.length ? 'Not covered by the reduced-motion block:' : 'All CSS animations and transitions are covered by the reduced-motion block.');
for (const u of uncovered) say(`  - ${u}`);
say(inlineMotion.length ? 'Inline-style motion (a CSS media query cannot switch these off; implement them with a class instead):' : 'No inline-style transitions or animations.');
for (const u of inlineMotion) say(`  - ${u}`);
fs.writeFileSync(path.join(OUT, 'extract-report.txt'), reportLines.join('\n') + '\n');

console.log(reportLines.join('\n'));
if (unresolved) { console.error(`\nextract: ${unresolved} unresolved conflict(s). A human must decide; see RESOLUTIONS in this script.`); process.exit(2); }
console.log(`\nextract: OK -> ${path.relative(process.cwd(), OUT) || '.'}/{design.css,tokens.json,motion-table.md,extract-report.txt}`);
