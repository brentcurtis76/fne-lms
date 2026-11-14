#!/usr/bin/env node
// Redesign inventory: what every screen of the platform offers today.
//
//   node scripts/redesign/inventory.mjs build   read the code, write the area files, then check
//   node scripts/redesign/inventory.mjs check   prove every file under pages/ is in exactly one area file
//   node scripts/redesign/inventory.mjs diff    read the code again and print what changed since the files were written
//
//   --src <folder>   read the code from another checkout (for example a fresh main) instead of this one
//
// Output: docs/plan/redesign/inventory/ (data/<area>.json and <area>.md). Hand-written input, never overwritten:
// areas.json (which file belongs where, leftover marks) and annotations.json (approved changes and notes).
//
// The repository is public. What says where the platform is WEAK is never written into it: behaviour problems
// found on the way, what was seen on a walk by sight, pointers to code reviews. Those notes are hand-kept in a
// private folder outside the repository (RD_PRIVATE, default ~/Projects/genera-redesign/private), in
// inventory-notes.json, and the pages made from them (problems.md, seen.md) are written there too. Without that
// folder the script does everything else and says that it left those pages out. A note of a private kind found in
// annotations.json stops the script.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractFile, apiFacts } from './extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const cmd = args[0] || 'build';
const srcArg = args.indexOf('--src');
const SRC = srcArg >= 0 ? path.resolve(args[srcArg + 1]) : ROOT;
const INV = path.join(ROOT, 'docs/plan/redesign/inventory');
const INV_REL = 'docs/plan/redesign/inventory';
const PRIVATE = process.env.RD_PRIVATE || path.join(os.homedir(), 'Projects/genera-redesign/private');
const PRIVATE_NOTES = path.join(PRIVATE, 'inventory-notes.json');
const PRIVATE_KINDS = new Set(['problem', 'seen']); // never in the repository's annotations.json

const ROLES = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red', 'community_manager', 'docente', 'encargado_licitacion'];
const CODE_DIRS = ['pages', 'components', 'src', 'hooks', 'lib', 'utils', 'contexts', 'constants', 'config', 'types'];
const CODE_EXT = /\.(tsx?|jsx?|mjs)$/;

// ---------- files ----------
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(SRC, rel));
function walk(rel, out = []) {
  const abs = path.join(SRC, rel);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(r, out); else out.push(r);
  }
  return out;
}
const isTest = (f) => /(^|\/)(__tests__|__mocks__|tests)\//.test(f) || /\.(test|spec)\.[tj]sx?$/.test(f);

function git(a) {
  try { return execFileSync('git', ['-C', SRC, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}
function readFrom() {
  // The newest commit of this history that is not only inventory work.
  const c = git(['rev-list', '--first-parent', '-n', '1', 'HEAD', '--', '.', ':(exclude)docs/plan/redesign', ':(exclude)scripts/redesign', ':(exclude).gitignore']);
  const l = c ? git(['log', '-1', '--format=%H|%cI', c]) : '';
  if (!l) return { commit: 'unknown', date: '' };
  const [commit, date] = l.split('|');
  return { commit, date };
}

// ---------- patterns ----------
function patternToRe(p) {
  const esc = p.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  return new RegExp('^' + esc.replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\u0001/g, '.*') + '$');
}

// ---------- routes ----------
function routeOf(file) {
  let r = file.replace(/^pages/, '').replace(/\.(tsx|ts|js|jsx)$/, '');
  r = r.replace(/\/index$/, '') || '/';
  return r;
}
const segs = (p) => p.split('/').filter(Boolean);
// Score a written path against a route; -1 when it cannot match.
function scoreRoute(pathSegs, routeSegs) {
  let score = 0;
  for (let i = 0; i < routeSegs.length; i++) {
    const r = routeSegs[i];
    if (/^\[\.\.\./.test(r)) return score + 1;
    const p = pathSegs[i];
    if (p === undefined) return -1;
    const dyn = /^\[.*\]$/.test(r);
    const hole = p === '[*]' || /^\[.*\]$/.test(p) || p.includes('\u0000');
    if (dyn) score += hole ? 3 : 2;
    else if (p === r) score += 4;
    else if (hole && p === '[*]') score += 0.5;
    else return -1;
  }
  return pathSegs.length === routeSegs.length ? score : -1;
}
function cleanPath(raw) {
  let p = raw.replace(/^https?:\/\/[^/]+/, '');
  p = p.split('?')[0].split('#')[0];
  const out = [];
  for (let s of segs(p)) {
    s = s.replace(/\$\{[^}]*\}/g, '\u0000').replace(/\[\*\]/g, '\u0000');
    if (s === '\u0000' || s === '[*]') out.push('[*]');
    else if (s.includes('\u0000')) { const head = s.split('\u0000')[0]; if (head) out.push(head); else out.push('[*]'); }
    else out.push(s);
  }
  return out;
}
function makeMatcher(routes) { // routes: [{route, file}]
  const table = routes.map((r) => ({ ...r, segs: segs(r.route) }));
  return (raw) => {
    if (!raw || !raw.startsWith('/')) return null;
    const ps = cleanPath(raw);
    let best = null; let bestScore = -1;
    for (const r of table) {
      const s = scoreRoute(ps, r.segs);
      if (s > bestScore || (s === bestScore && s >= 0 && best && r.segs.length === ps.length && r.route < best.route)) { best = r; bestScore = s; }
    }
    if (ps.length === 0) return table.find((r) => r.route === '/') || null;
    return bestScore >= 0 ? best : null;
  };
}

// ---------- imports ----------
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else return null;
  const tries = [base, ...['.tsx', '.ts', '.jsx', '.js', '.mjs'].map((e) => base + e), ...['.tsx', '.ts', '.jsx', '.js'].map((e) => `${base}/index${e}`)];
  for (const t of tries) if (CODE_EXT.test(t) && exists(t) && fs.statSync(path.join(SRC, t)).isFile()) return t;
  return null;
}

// ---------- the menu ----------
function parseMenu() {
  const file = 'components/layout/Sidebar.tsx';
  const text = read(file);
  const start = text.indexOf('export const NAVIGATION_ITEMS');
  if (start < 0) throw new Error('NAVIGATION_ITEMS not found in ' + file);
  const open = text.indexOf('[', text.indexOf('=', start));
  let depth = 0; let end = open;
  for (let i = open; i < text.length; i++) { const c = text[i]; if (c === '[') depth++; else if (c === ']') { depth--; if (depth === 0) { end = i; break; } } }
  let body = text.slice(open, end + 1);
  body = body.replace(/\/\/[^\n]*/g, '').replace(/icon:\s*[A-Za-z0-9_]+\s*,?/g, '');
  // The array is plain data once icons and comments are gone.
  const items = Function(`"use strict"; return (${body});`)();
  const lineOf = (id) => text.slice(0, text.indexOf(`id: '${id}'`)).split('\n').length;
  const gatesOf = (o) => {
    const g = {};
    for (const k of ['adminOnly', 'consultantOnly', 'superadminOnly', 'restrictedRoles', 'permission', 'requireAllPermissions', 'requiresCommunity', 'requiresQAAccess', 'requiresAssessments', 'requiresPasantia']) if (o[k] !== undefined) g[k] = o[k];
    return g;
  };
  const entries = [];
  for (const it of items) {
    entries.push({ id: it.id, label: it.label, href: it.href || null, description: it.description || '', gates: gatesOf(it), group: null, line: lineOf(it.id), children: (it.children || []).length });
    for (const ch of it.children || []) entries.push({ id: ch.id, label: ch.label, href: ch.href, description: ch.description || '', gates: gatesOf(ch), group: it.label, groupId: it.id, parentGates: gatesOf(it), line: lineOf(ch.id) });
  }
  return { file, entries, top: items.length, children: entries.filter((e) => e.group).length };
}
function gate(role, g) {
  const conds = [];
  if (g.superadminOnly) conds.push('superadmin');
  if (g.requiresQAAccess && role !== 'admin') conds.push('marked as QA tester');
  if (g.requiresAssessments) conds.push('has a registro assigned');
  if (g.requiresPasantia) conds.push('is a pasantía traveller');
  if (g.adminOnly && role !== 'admin') return null;
  if (g.consultantOnly && role !== 'admin' && role !== 'consultor') return null;
  if (g.requiresCommunity && role !== 'admin' && role !== 'consultor') conds.push('has a community');
  if (g.restrictedRoles && g.restrictedRoles.length) return g.restrictedRoles.includes(role) ? conds : null;
  if (g.permission && role !== 'admin' && !(g.consultantOnly && role === 'consultor')) conds.push(`permission ${[].concat(g.permission).join(g.requireAllPermissions ? ' and ' : ' or ')}`);
  return conds;
}
function menuFor(role, entry) {
  const a = entry.parentGates ? gate(role, entry.parentGates) : [];
  const b = gate(role, entry.gates);
  if (a === null || b === null) return 'no';
  const conds = [...new Set([...a, ...b])];
  return conds.length ? `if ${conds.join(', ')}` : 'yes';
}
function gateWords(g) {
  const w = [];
  if (g.superadminOnly) w.push('superadmin only');
  if (g.adminOnly) w.push('admin only');
  if (g.consultantOnly) w.push('admin or consultor');
  if (g.restrictedRoles) w.push(`roles: ${g.restrictedRoles.join(', ')}`);
  if (g.permission) w.push(`permission: ${[].concat(g.permission).join(g.requireAllPermissions ? ' and ' : ' or ')}`);
  if (g.requiresCommunity) w.push('needs a community (admin and consultor pass)');
  if (g.requiresQAAccess) w.push('QA testers and admin');
  if (g.requiresAssessments) w.push('only with a registro assigned');
  if (g.requiresPasantia) w.push('only pasantía travellers');
  return w.length ? w.join('; ') : 'everyone signed in';
}

// ---------- the middleware ----------
function strList(text, name) {
  const m = text.match(new RegExp(name + '[^=]*=\\s*\\[([\\s\\S]*?)\\]'));
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
function parseMiddleware() {
  const mw = read('middleware.ts');
  const fp = exists('lib/auth/forced-password-change.ts') ? read('lib/auth/forced-password-change.ts') : '';
  const warnings = [];
  const need = (v, what) => { if (!v) warnings.push(`middleware: could not read ${what}; the access rules written by this script may be stale`); return v || []; };
  const gated = need(strList(fp, 'const GATED_PAGE_PREFIXES'), 'GATED_PAGE_PREFIXES');
  const sessionRequired = need(strList(fp, 'const SESSION_REQUIRED_PAGE_PREFIXES'), 'SESSION_REQUIRED_PAGE_PREFIXES');
  const cm = need(strList(mw, 'const cmRoutes'), 'cmRoutes');
  const consultor = need(strList(mw, 'const consultorRoutes'), 'consultorRoutes');
  const schoolScoped = need(strList(mw, 'const schoolScopedPrefixes'), 'schoolScopedPrefixes');
  for (const s of ["pathname.startsWith('/admin/growth-communities')", "pathname === '/admin/school-users'", "pathname.startsWith('/community/workspace')", "roles.includes('equipo_directivo')"]) if (!mw.includes(s)) warnings.push(`middleware: the line «${s}» is gone; check the equipo directivo and workspace rules in scripts/redesign/inventory.mjs`);
  return { gated, sessionRequired, cm, consultor, schoolScoped, warnings };
}
const under = (route, prefixes) => prefixes.some((p) => route === p || route.startsWith(p + '/'));
function middlewareFor(route, mw) {
  const out = { hold: under(route, mw.gated), signedOut: under(route, mw.sessionRequired) ? 'sent to /login' : 'not stopped by the middleware', rule: '', roles: {} };
  if (route.startsWith('/admin')) {
    out.rule = 'the /admin rule';
    for (const r of ROLES) {
      let ok = r === 'admin';
      if (r === 'community_manager' && mw.cm.some((p) => route.startsWith(p))) ok = true;
      if (r === 'consultor' && mw.consultor.some((p) => route.startsWith(p))) ok = true;
      if (r === 'equipo_directivo' && (route.startsWith('/admin/growth-communities') || route === '/admin/school-users')) ok = true;
      out.roles[r] = ok ? 'pass' : 'sent to /dashboard';
    }
  } else if (route.startsWith('/community/workspace')) {
    out.rule = 'the workspace rule';
    for (const r of ROLES) out.roles[r] = r === 'admin' ? 'pass' : 'pass if has a community, else /dashboard';
  } else {
    out.rule = out.hold ? (out.signedOut === 'sent to /login' ? 'signed-in only' : 'no role rule') : 'not covered';
    for (const r of ROLES) out.roles[r] = 'pass';
    if (under(route, mw.schoolScoped)) { out.rule += '; with ?school_id= an equipo directivo only passes for its own school'; }
  }
  return out;
}

// ---------- QA scenarios ----------
// Each scenario is a row of an INSERT: role, name, description, feature area, preconditions, steps.
// A scenario is tied to a screen when its text names the address or the label of its menu entry.
function sqlStrings(chunk, max) {
  const out = []; let i = 0;
  while (i < chunk.length && out.length < max) {
    if (chunk[i] === '-' && chunk[i + 1] === '-') { while (i < chunk.length && chunk[i] !== '\n') i++; continue; }
    if (chunk[i] !== "'") { i++; continue; }
    let j = i + 1; let v = '';
    while (j < chunk.length) { if (chunk[j] === "'") { if (chunk[j + 1] === "'") { v += "'"; j += 2; continue; } break; } v += chunk[j]; j++; }
    out.push(v); i = j + 1;
  }
  return out;
}
function parseScenarios(matchPage, menu, pageRoutes) {
  const dir = 'docs/qa-system';
  const out = [];
  if (!exists(dir)) return out;
  const byRoute = new Map(pageRoutes.map((r) => [r.route, r.file]));
  const labels = new Map();
  for (const e of menu.entries) if (e.href && e.label.length >= 5) { const f = byRoute.get(e.href.split('?')[0]); if (f) { if (!labels.has(e.label)) labels.set(e.label, new Set()); labels.get(e.label).add(f); } }
  for (const f of fs.readdirSync(path.join(SRC, dir)).filter((x) => /^seed-.*\.sql$/.test(x)).sort()) {
    const chunks = read(`${dir}/${f}`).split(/^\(\s*$/m).slice(1);
    for (const chunk of chunks) {
      const st = sqlStrings(chunk, 6);
      if (st.length < 6 || !/^[a-z_]+$/.test(st[0]) || !/^[a-z_]+$/.test(st[3])) continue;
      const blob = `${st[1]} ${st[2]} ${st[4]} ${st[5]}`;
      const screens = new Set();
      for (const p of blob.matchAll(/\/[a-z][a-z0-9\-_]*(?:\/[a-z0-9\-_]+)*/g)) { const hit = matchPage(p[0]); if (hit && hit.route !== '/') screens.add(hit.file); }
      for (const [label, files] of labels) if (blob.includes(`"${label}"`) || blob.includes(`'${label}'`) || blob.includes(`«${label}»`) || new RegExp(`(a|en|de|sección|seccion|menú|menu|item|ítem) (la sección de |el item |"|')?${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(blob)) for (const x of files) screens.add(x);
      out.push({ role: st[0], name: st[1], area: st[3], file: `${dir}/${f}`, screens: [...screens] });
    }
  }
  return out;
}

// ---------- tests ----------
function parseTests(matchPage, pageFiles) {
  const byScreen = new Map();
  const put = (file, key, v) => { if (!byScreen.has(file)) byScreen.set(file, { e2eCi: new Set(), e2e: new Set(), unit: new Set() }); byScreen.get(file)[key].add(v); };
  const mandatory = new Set(exists('scripts/ci/e2e-mandatory.mjs') ? [...read('scripts/ci/e2e-mandatory.mjs').matchAll(/'(tests\/[^']+\.spec\.ts)'/g)].map((m) => m[1]) : []);
  const all = [...walk('tests'), ...walk('__tests__'), ...CODE_DIRS.flatMap((d) => walk(d).filter(isTest))].filter((f) => CODE_EXT.test(f));
  const specs = all.filter((f) => /\.spec\.[tj]sx?$/.test(f));
  for (const f of new Set(all)) {
    const text = read(f);
    if (/\.spec\.[tj]sx?$/.test(f)) {
      for (const m of text.matchAll(/(['"`])(\/[A-Za-z0-9_\-\/\[\]${}.?=&%:]*?)\1/g)) {
        if (m[2].startsWith('/api/') || m[2] === '/') continue;
        const hit = matchPage(m[2]);
        if (hit) put(hit.file, mandatory.has(f) ? 'e2eCi' : 'e2e', f);
      }
    } else {
      for (const m of text.matchAll(/(?:from|import|require|mock)\s*\(?\s*['"]([^'"]*pages\/[^'"]+)['"]/g)) {
        const tail = m[1].slice(m[1].indexOf('pages/'));
        const hit = pageFiles.find((p) => p.replace(/\.(tsx|ts|js)$/, '') === tail.replace(/\.(tsx|ts|js)$/, '') || p.replace(/\/index\.(tsx|ts|js)$/, '') === tail);
        if (hit) put(hit, 'unit', f);
      }
    }
  }
  return { byScreen, mandatory: [...mandatory], specCount: specs.length };
}

// ---------- build the model ----------
function buildModel() {
  const cfg = JSON.parse(fs.readFileSync(path.join(INV, 'areas.json'), 'utf8'));
  const annotations = fs.existsSync(path.join(INV, 'annotations.json')) ? JSON.parse(fs.readFileSync(path.join(INV, 'annotations.json'), 'utf8')) : { notes: [] };
  const misplaced = (annotations.notes || []).filter((n) => PRIVATE_KINDS.has(n.kind));
  if (misplaced.length || annotations.reviews) {
    console.error(`annotations.json holds ${misplaced.length} note(s) of a private kind (${[...PRIVATE_KINDS].join(', ')})${annotations.reviews ? ' and a list of reviews' : ''}. The repository is public: they belong in ${PRIVATE_NOTES}.`);
    process.exit(1);
  }
  const privateNotes = fs.existsSync(PRIVATE_NOTES) ? JSON.parse(fs.readFileSync(PRIVATE_NOTES, 'utf8')) : null;
  const problems = [];
  const pagesAll = walk('pages').sort();
  const screenFiles = pagesAll.filter((f) => !f.startsWith('pages/api/'));
  const apiFiles = pagesAll.filter((f) => f.startsWith('pages/api/'));

  // area of each file
  const areas = cfg.areas.map((a) => ({ ...a, pageRe: (a.pages || []).map(patternToRe), apiRe: (a.api || []).map(patternToRe) }));
  const areaOf = new Map();
  for (const f of pagesAll) {
    const hits = areas.filter((a) => (f.startsWith('pages/api/') ? a.apiRe : a.pageRe).some((re) => re.test(f)));
    if (hits.length !== 1) problems.push(`${f}: matches ${hits.length} areas${hits.length ? ' (' + hits.map((h) => h.id).join(', ') + ')' : ''} in areas.json; it must match exactly one`);
    if (hits.length) areaOf.set(f, hits[0].id);
  }

  const routed = screenFiles.filter((f) => /\.(tsx|ts|js|jsx)$/.test(f) && !/^pages\/_(app|document)\.tsx$/.test(f));
  const pageRoutes = routed.map((f) => ({ file: f, route: routeOf(f) }));
  const matchPage = makeMatcher(pageRoutes);
  const apiRoutes = apiFiles.map((f) => ({ file: f, route: routeOf(f) }));
  const matchApi = makeMatcher(apiRoutes);

  // extract every code file once
  const cache = new Map();
  const ex = (f) => {
    if (!cache.has(f)) {
      let r;
      try { r = extractFile(f, read(f)); } catch (e) { problems.push(`${f}: could not be read (${e.message})`); r = { rows: [], imports: [], apiRefs: [], dbRefs: [], pathRefs: [], flags: {}, mod: { tops: {}, exports: {}, reexports: {}, star: [], binds: {}, module: { uses: [], whole: [] } } }; }
      cache.set(f, r);
    }
    return cache.get(f);
  };
  const codeFiles = [...CODE_DIRS.flatMap((d) => walk(d)), 'middleware.ts'].filter((f) => CODE_EXT.test(f) && !isTest(f) && exists(f));
  for (const f of codeFiles) ex(f);

  const frameEntries = new Set(cfg.frameEntries || []);
  // What a screen reaches: file -> set of top-level names ('*' = the whole file). Imports are followed by
  // name: importing one helper from a file does not pull in the rest of that file.
  function hasExport(F, name, depth) {
    const m = ex(F).mod;
    if (name in m.exports || name in m.reexports) return true;
    if (depth > 6) return false;
    return m.star.some((sp) => { const G = resolveImport(F, sp); return G && hasExport(G, name, depth + 1); });
  }
  function reachFrom(entry, stopAtFrame) {
    const got = new Map(); const queue = [];
    const addNode = (file, top) => {
      if (!file || isTest(file) || file.startsWith('pages/api/')) return;
      if (stopAtFrame && frameEntries.has(file) && file !== entry) return;
      let set = got.get(file);
      if (!set) { set = new Set(); got.set(file, set); queue.push([file, null]); }
      if (set.has('*') || set.has(top)) return;
      if (top === '*') { set.add('*'); for (const t of Object.keys(ex(file).mod.tops)) queue.push([file, t]); } else { set.add(top); queue.push([file, top]); }
    };
    const exportNode = (F, name, depth) => {
      if (name === '*' || depth > 8) return addNode(F, '*');
      const m = ex(F).mod;
      if (name in m.exports) {
        const local = m.exports[name];
        if (m.tops[local]) return addNode(F, local);
        if (m.binds[local]) { const G = resolveImport(F, m.binds[local].spec); if (G) exportNode(G, m.binds[local].imported, depth + 1); return; }
        return addNode(F, '*');
      }
      if (name in m.reexports) { const G = resolveImport(F, m.reexports[name].spec); if (G) exportNode(G, m.reexports[name].imported, depth + 1); return; }
      for (const sp of m.star) { const G = resolveImport(F, sp); if (G && hasExport(G, name, 0)) return exportNode(G, name, depth + 1); }
      addNode(F, '*');
    };
    addNode(entry, '*');
    while (queue.length) {
      const [file, top] = queue.shift();
      const m = ex(file).mod;
      const part = top === null ? m.module : m.tops[top];
      if (!part) continue;
      for (const u of part.uses) {
        if (m.tops[u]) addNode(file, u);
        else if (m.binds[u]) { const F = resolveImport(file, m.binds[u].spec); if (F) exportNode(F, m.binds[u].imported, 0); }
      }
      for (const sp of part.whole) { const F = resolveImport(file, sp); if (F) addNode(F, '*'); }
    }
    return got;
  }
  const inSet = (set, x) => set.has('*') || !x.top || set.has(x.top);
  const rowsIn = (f, set) => ex(f).rows.filter((r) => inSet(set, r));
  const dbIn = (f, set) => {
    const by = new Map();
    for (const d of ex(f).dbRefs.filter((x) => inSet(set, x))) { if (!by.has(d.what)) by.set(d.what, new Set()); for (const o of d.ops) by.get(d.what).add(o); }
    return [...by.entries()].map(([what, ops]) => ({ what, ops: [...ops].sort() })).sort((x, y) => x.what.localeCompare(y.what));
  };
  const reachCache = new Map();
  const reachOf = (f) => { if (!reachCache.has(f)) reachCache.set(f, reachFrom(f, true)); return reachCache.get(f); };
  const frameReach = new Map();
  for (const e of [...frameEntries, 'pages/_app.tsx']) if (exists(e)) for (const [f, set] of reachFrom(e, false)) { if (!frameReach.has(f)) frameReach.set(f, new Set()); for (const t of set) frameReach.get(f).add(t); }
  const frameFiles = new Set(frameReach.keys());

  const menu = parseMenu();
  const mw = parseMiddleware();
  problems.push(...mw.warnings);
  const scenarios = parseScenarios(matchPage, menu, pageRoutes);
  const tests = parseTests(matchPage, screenFiles);

  // who links to each screen; links that lead nowhere
  const linkedFrom = new Map();
  const deadLinks = [];
  const publicFiles = new Set(walk('public').map((f) => '/' + f.replace(/^public\//, '')));
  for (const f of codeFiles) {
    for (const r of ex(f).rows) {
      if (r.kind !== 'link' && r.kind !== 'nav') continue;
      const t = r.kind === 'link' ? r.target : r.text;
      if (!t || !t.startsWith('/') || t.startsWith('//') || t.startsWith('/api/')) continue;
      const hit = matchPage(t);
      if (hit) { if (hit.file !== f) { if (!linkedFrom.has(hit.file)) linkedFrom.set(hit.file, []); linkedFrom.get(hit.file).push(`${f}:${r.line}`); } }
      else if (!publicFiles.has(t.split('?')[0].split('#')[0]) && !/^\/\[\*\]/.test(t) && !/^\/(_next|images|sitio|fonts)\//.test(t) && t !== '/404') deadLinks.push({ from: `${f}:${r.line}`, to: t });
    }
  }

  for (const f of codeFiles) for (const pr of ex(f).pathRefs) {
    const hit = matchPage(pr.raw);
    if (hit && hit.route !== '/' && hit.file !== f) { if (!linkedFrom.has(hit.file)) linkedFrom.set(hit.file, []); linkedFrom.get(hit.file).push(`${f}:${pr.line}`); }
  }
  // api: who calls each file
  const apiCalledBy = new Map(apiFiles.map((f) => [f, new Set()]));
  const apiReferencedIn = new Map(apiFiles.map((f) => [f, new Set()]));
  const apiMissing = [];
  const refCache = new Map();
  const refsOf = (f) => { if (!refCache.has(f)) refCache.set(f, ex(f).apiRefs.map((r) => ({ ...r, hit: matchApi(r.raw), from: `${f}:${r.line}` }))); return refCache.get(f); };
  const everReached = new Set(frameFiles);
  for (const f of codeFiles) for (const r of refsOf(f)) {
    if (r.hit) apiReferencedIn.get(r.hit.file).add(f);
    else if (cleanPath(r.raw).length > 1 && !r.raw.includes(':')) apiMissing.push({ from: r.from, to: cleanPath(r.raw).join('/'), how: r.called ? `${r.called}(…)` : 'only named (may be a prefix test, not a call)' });
  }
  for (const f of ['vercel.json', ...walk('scripts'), ...walk('tests'), ...walk('__tests__'), ...walk('supabase')].filter((x) => exists(x) && /\.(json|mjs|js|ts|tsx|sql|sh|toml)$/.test(x))) {
    let text; try { text = read(f); } catch { continue; }
    for (const m of text.matchAll(/\/api\/[A-Za-z0-9_\-\/\[\]${}.]+/g)) { const hit = matchApi(m[0].replace(/[.]$/, '')); if (hit) apiReferencedIn.get(hit.file).add(f); }
  }

  const head = readFrom();
  const model = { readFrom: head, areas: [], menu, mw, problems, deadLinks, apiMissing, scenarios, tests, annotations, privateNotes, cfg };
  const marks = cfg.marks || {};

  for (const a of areas) {
    const out = { area: a.id, name: a.name, note: a.note || '', routesOnly: !!a.routesOnly, ...((a.extraPieces || []).length ? { frame: true } : {}), readFrom: head, screens: [], pieces: {}, api: [] };
    const pieceUse = new Map();
    for (const f of screenFiles.filter((x) => areaOf.get(x) === a.id)) {
      const mark = marks[f] || {};
      const isCode = /\.(tsx|ts|js|jsx)$/.test(f);
      const isFrame = /^pages\/_(app|document)\.tsx$/.test(f);
      const route = isCode && !isFrame ? routeOf(f) : null;
      const s = { file: f, route, lines: read(f).split('\n').length, marks: mark };
      if (!isCode) { out.screens.push(s); continue; }
      const own = ex(f);
      s.frame = own.flags.usesMainLayout ? 'MainLayout' : own.flags.usesLegacyHeader ? 'old Header' : 'none';
      s.server = own.flags.ssr ? 'getServerSideProps' : own.flags.staticProps ? 'getStaticProps' : 'none';
      if (route) {
        const menuEntries = menu.entries.filter((e) => e.href && e.href.split('?')[0] === route).map((e) => ({ id: e.id, label: e.label, group: e.group, href: e.href, gates: gateWords(e.gates), groupGates: e.parentGates ? gateWords(e.parentGates) : undefined, line: e.line }));
        const m = middlewareFor(route, mw);
        const roles = {};
        for (const r of ROLES) {
          const entries = menu.entries.filter((e) => e.href && e.href.split('?')[0] === route);
          const shows = entries.map((e) => menuFor(r, e));
          const menuWord = !entries.length ? '—' : shows.includes('yes') ? 'yes' : shows.find((x) => x !== 'no') || 'no';
          roles[r] = { menu: menuWord, middleware: m.roles[r] };
          if (menuWord !== 'no' && menuWord !== '—' && m.roles[r] === 'sent to /dashboard') roles[r].clash = true;
        }
        const qa = {};
        for (const sc of scenarios) if (sc.screens.includes(f)) { (qa[sc.role] = qa[sc.role] || []).push(sc.name); }
        const t = tests.byScreen.get(f);
        s.reach = {
          menu: menuEntries,
          middleware: { rule: m.rule, signedOut: m.signedOut, passwordChangeHold: m.hold },
          roles,
          inPage: own.rows.filter((r) => r.kind === 'access' || (r.kind === 'nav' && /^\/($|\?|login|dashboard|403|auth\/|pending-approval|change-password)/.test(r.text)) || r.access).map((r) => ({ line: r.line, text: r.kind === 'nav' ? `${r.via} → ${r.text}${r.when ? '  (when ' + r.when + ')' : ''}` : r.text })),
          linkedFrom: [...new Set(linkedFrom.get(f) || [])].sort(),
          qaScenarios: qa,
          tests: t ? { e2eCi: [...t.e2eCi].sort(), e2e: [...t.e2e].sort(), unit: [...t.unit].sort() } : { e2eCi: [], e2e: [], unit: [] },
        };
      }
      const reach = isFrame ? new Map([[f, new Set(['*'])]]) : reachOf(f);
      for (const d of reach.keys()) everReached.add(d);
      const deps = [...reach.keys()].filter((d) => d !== f).sort();
      if (!a.routesOnly) {
        s.rows = own.rows.map((r) => (r.kind === 'hook' && r.type === 'address value' && route && route.includes(`[${r.text.slice(1)}]`) ? { ...r, text: `[${r.text.slice(1)}] (part of the address)` } : r));
        s.db = dbIn(f, new Set(['*']));
        s.pieces = deps.filter((d) => rowsIn(d, reach.get(d)).length || dbIn(d, reach.get(d)).length || refsOf(d).some((r) => inSet(reach.get(d), r)));
        for (const d of s.pieces) { if (!pieceUse.has(d)) pieceUse.set(d, { usedBy: [], set: new Set() }); pieceUse.get(d).usedBy.push(route || f); for (const t of reach.get(d)) pieceUse.get(d).set.add(t); }
      }
      const calls = new Map();
      for (const d of [f, ...deps]) for (const r of refsOf(d)) {
        if (!r.hit || !inSet(reach.get(d), r)) continue;
        apiCalledBy.get(r.hit.file).add(route || f);
        const k = r.hit.file;
        if (!calls.has(k)) calls.set(k, { file: k, route: r.hit.route, methods: new Set(), from: [] });
        calls.get(k).methods.add(r.method); calls.get(k).from.push(r.from);
      }
      s.api = [...calls.values()].map((c) => ({ file: c.file, route: c.route, methods: [...c.methods].filter((x) => x !== '?').sort(), from: c.from.sort() })).sort((x, y) => x.route.localeCompare(y.route));
      out.screens.push(s);
    }
    if ((a.extraPieces || []).length) for (const [d, set] of frameReach) { if (d.startsWith('pages/')) continue; if ((rowsIn(d, set).length || dbIn(d, set).length) && !pieceUse.has(d)) pieceUse.set(d, { usedBy: [(a.extraPieces || []).includes(d) ? '(every screen that uses the frame)' : '(the frame)'], set }); }
    for (const [p, v] of [...pieceUse.entries()].sort()) out.pieces[p] = { usedBy: v.usedBy, lines: ex(p).flags.lines, rows: rowsIn(p, v.set), db: dbIn(p, v.set) };
    model.areas.push(out);
    out._apiFiles = apiFiles.filter((x) => areaOf.get(x) === a.id);
  }
  // api lists need every screen's calls first
  for (const out of model.areas) {
    out.api = out._apiFiles.map((f) => ({ file: f, route: routeOf(f), ...apiFacts(read(f)), calledBy: [...apiCalledBy.get(f)].sort(), referencedIn: [...apiReferencedIn.get(f)].filter((x) => !x.startsWith('pages/api/') || x !== f).sort() }));
    delete out._apiFiles;
  }
  const chartUse = (f, r) => routed.filter((sf) => { const set = reachOf(sf).get(f); return set && inSet(set, r); }).map(routeOf).sort();
  model.charts = codeFiles.flatMap((f) => ex(f).rows.filter((r) => r.kind === 'chart').map((r) => ({ file: f, r, screens: chartUse(f, r) })));
  for (const sf of routed) for (const d of reachOf(sf).keys()) everReached.add(d);
  model.unreached = codeFiles.filter((f) => /^(components|src\/components)\//.test(f) && /\.(tsx|jsx)$/.test(f) && !everReached.has(f)).sort();
  // For an area that is going away: which files only it uses, and which it shares with screens that stay.
  model.going = [];
  for (const a of areas.filter((x) => x.routesOnly)) {
    const mine = routed.filter((sf) => areaOf.get(sf) === a.id); const others = routed.filter((sf) => areaOf.get(sf) !== a.id);
    const files = new Set(mine.flatMap((sf) => [...reachOf(sf).keys()]).filter((f) => !f.startsWith('pages/') && !frameFiles.has(f)));
    const only = []; const shared = [];
    for (const f of [...files].sort()) { const who = others.filter((sf) => reachOf(sf).has(f)).map(routeOf); if (who.length) shared.push({ file: f, alsoUsedBy: who.length, example: who.slice(0, 3) }); else only.push(f); }
    model.going.push({ area: a.id, name: a.name, only, shared, api: apiFiles.filter((x) => areaOf.get(x) === a.id) });
  }
  model.frameFiles = [...frameFiles].sort();
  model.counts = { screens: screenFiles.length, api: apiFiles.length };
  return model;
}

// ---------- writing ----------
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const q = (s) => (s ? `«${esc(s)}»` : '');
const code = (s) => (s ? '`' + String(s).replace(/`/g, "'").replace(/\|/g, '\\|') + '`' : '');
const where = (r) => `${r.in ? esc(r.in) + ' · ' : ''}l.${r.line}`;
const hookText = (h) => (h ? Object.entries(h).filter(([k]) => k !== 'idUsed').map(([k, v]) => `${k}=${v}`).join(' ') + (h.idUsed ? ' (id used by code)' : '') : '');

const sizeWords = (r) => (!r.screen ? '' : /:/.test(r.screen) ? `screen size: ${code(r.screen)}` : `hidden by its class (${code(r.screen)}); another control opens it or it is for screen readers`);
const shown = (r) => [r.when ? code(r.when) : '', sizeWords(r)].filter(Boolean).join(' · ');
const extra = (r) => [r.title && r.title !== r.text ? `tooltip ${q(r.title)}` : '', r.aria && r.aria !== r.text ? `aria ${q(r.aria)}` : '', r.also ? `also ${code(r.also)}` : ''].filter(Boolean).map((x) => ' · ' + x).join('');
const TABLES = [
  ['heading', 'Titles', ['Text', 'Level', 'Shown when', 'Where'], (r) => [q(r.text), `h${r.level}`, shown(r), where(r)]],
  ['tab', 'Tabs', ['Text', 'Does', 'Shown when', 'Where'], (r) => [q(r.text), code(r.action), shown(r), where(r)]],
  ['button', 'Buttons', ['Text', 'Does', 'Shown when', 'Disabled when', 'Hook', 'Where'], (r) => [q(r.text) + (r.submit ? ' (submits the form)' : '') + extra(r), code(r.action), shown(r), code(r.disabled), code(hookText(r.hook)), where(r)]],
  ['link', 'Links', ['Text', 'Goes to', 'Shown when', 'Hook', 'Where'], (r) => [q(r.text) + extra(r), code(r.target) + (r.newTab ? ' (new tab)' : ''), shown(r), code(hookText(r.hook)), where(r)]],
  ['clickable', 'Other things that react to a click', ['Element', 'Text', 'Does', 'Shown when', 'Where'], (r) => [code(r.tag), q(r.text) + extra(r), code(r.action), shown(r), where(r)]],
  ['field', 'Fields', ['Label', 'Kind', 'Name / placeholder', 'Choices', 'Shown when', 'Hook', 'Where'], (r) => [q(r.text), esc(r.type), [r.name ? code(r.name) : '', r.placeholder ? q(r.placeholder) : '', r.required ? 'required' : '', r.disabled ? `disabled: ${code(r.disabled)}` : '', r.accept ? `accepts ${code(r.accept)}` : '', r.limits ? code(r.limits) : '', r.also ? `also ${code(r.also)}` : ''].filter(Boolean).join(' · '), (r.options || []).map(q).join(', '), shown(r), code(hookText(r.hook)), where(r)]],
  ['gesture', 'Other gestures (keys, hover, drag, blur)', ['Element', 'Reacts to', 'Shown when', 'Where'], (r) => [code(r.tag), code(r.text), shown(r), where(r)]],
  ['media', 'Embedded media', ['What', 'Shown when', 'Hook', 'Where'], (r) => [esc(r.text), shown(r), code(hookText(r.hook)), where(r)]],
  ['form', 'Forms', ['On submit', 'Shown when', 'Where'], (r) => [code(r.text), shown(r), where(r)]],
  ['column', 'Table columns', ['Text', 'Shown when', 'Where'], (r) => [q(r.text), shown(r), where(r)]],
  ['popup', 'Pop-ups', ['Name or title', 'How', 'Opens when', 'Texts passed to it', 'Where'], (r) => [r.how === 'component' ? code(r.text) : q(r.text), esc(r.how), code(r.open || r.when), esc(r.props || ''), where(r)]],
  ['confirm', 'Browser confirm()', ['Question', 'When', 'Where'], (r) => [q(r.text), shown(r), where(r)]],
  ['alert', 'Browser alert()', ['Text', 'When', 'Where'], (r) => [q(r.text), shown(r), where(r)]],
  ['prompt', 'Browser prompt()', ['Text', 'When', 'Where'], (r) => [q(r.text), shown(r), where(r)]],
  ['toast', 'Toasts', ['Kind', 'Text', 'When', 'Where'], (r) => [esc(r.variant), q(r.text), shown(r), where(r)]],
  ['message', 'Messages set on the page', ['Text', 'Set by', 'When', 'Where'], (r) => [q(r.text), code(r.via), shown(r), where(r)]],
  ['download', 'Downloads and printing', ['How', 'When', 'Where'], (r) => [code(r.text), shown(r), where(r)]],
  ['chart', 'Charts', ['Chart', 'Series', 'Shown when', 'Where'], (r) => [esc(r.text), chartSeries(r), shown(r), where(r)]],
  ['nav', 'Moves to another page from code', ['Goes to', 'How', 'When', 'Where'], (r) => [code(r.text), code(r.via), shown(r), where(r)]],
  ['access', 'Access checks in the code', ['Line of code', 'Where'], (r) => [code(r.text), where(r)]],
  ['gate', 'Draws nothing when', ['Condition', 'Where'], (r) => [code(r.text), where(r)]],
  ['piece', 'Pieces placed here, with the texts and settings handed to them', ['Piece', 'Texts and settings', 'Shown when', 'Hook', 'Where'], (r) => [code(r.tag), esc(r.text), shown(r), code(hookText(r.hook)), where(r)]],
  ['list', 'Texts kept in lists and helpers in the code (labels, options, status names)', ['Name', 'Texts', 'Where'], (r) => [code(r.text), r.items.map(q).join(', '), where(r)]],
  ['string', 'Other texts written in the code (safety net: not tied to an element by the script)', ['Text', 'Where'], (r) => [q(r.text), where(r)]],
  ['hook', 'Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)', ['Kind', 'What', 'Where'], (r) => [esc(r.type), code(r.text), where(r)]],
];
function chartSeries(r) {
  if (!r.series.length) return 'none found';
  return r.series.map((s) => `${s.tag}${s.dataKey ? ' ' + code(s.dataKey) : ''}${s.name ? ' ' + q(s.name) : ''}${s.mapped ? ' (one per item of a list)' : ''}${s.cells ? ` (slices: ${s.cells})` : ''}`).join('; ');
}
function rowsMd(rows) {
  const out = [];
  for (const [kind, title, cols, fn] of TABLES) {
    const rs = rows.filter((r) => r.kind === kind);
    if (!rs.length) continue;
    out.push(`**${title}** (${rs.length})`, '', `| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`);
    for (const r of rs) out.push(`| ${fn(r).join(' | ')} |`);
    out.push('');
  }
  const values = rows.filter((r) => r.kind === 'value');
  if (values.length) {
    out.push(`**Values shown from data** (${values.length})`, '');
    for (const r of values) out.push(`- ${code(r.text)} — ${where(r)}${r.when ? `, when ${code(r.when)}` : ''}${r.screen ? `, ${sizeWords(r)}` : ''}`);
    out.push('');
  }
  const texts = rows.filter((r) => r.kind === 'text' || r.kind === 'label');
  if (texts.length) {
    out.push(`**Other texts on screen** (${texts.length})`, '');
    for (const r of texts) out.push(`- ${q(r.text)}${r.attr ? ` (${r.attr})` : ''}${r.kind === 'label' ? ' (label)' : ''} — ${where(r)}${r.when ? `, when ${code(r.when)}` : ''}${r.screen ? `, ${sizeWords(r)}` : ''}`);
    out.push('');
  }
  return out;
}
function dbMd(db) {
  if (!db || !db.length) return [];
  return [`**Reads and writes the database directly:** ${db.map((d) => `${code(d.what)}${d.ops.length ? ' (' + d.ops.join(', ') + ')' : ''}`).join(', ')}`, ''];
}
const NOTE_TITLES = { 'approved-change': 'Approved changes (decided by Brent with the mock-ups; not losses)', problem: 'Behaviour problems found (reported, not fixed here)', seen: 'Seen on the walk by sight', note: 'Notes' };

function areaMd(a, model) {
  const L = [];
  const notes = model.annotations.notes || [];
  L.push(`# ${a.name}`, '', `Area \`${a.area}\`. Written by \`scripts/redesign/inventory.mjs\`; do not edit by hand (hand-written input goes in \`annotations.json\` and \`areas.json\`).`, `Read from commit \`${a.readFrom.commit.slice(0, 9)}\` (${a.readFrom.date.slice(0, 10)}).`, '');
  if (a.note) L.push(a.note, '');
  L.push(`${a.screens.length} screen files, ${a.api.length} API files, ${Object.keys(a.pieces).length} pieces.`, '');
  if (a.frame) for (const kind of Object.keys(NOTE_TITLES)) {
    const mine = notes.filter((n) => n.kind === kind && n.screen === '(frame)');
    if (!mine.length) continue;
    L.push(`## ${NOTE_TITLES[kind]}`, '');
    for (const n of mine) L.push(`- ${n.text}${n.source ? ` (${n.source})` : ''}`);
    L.push('');
  }
  L.push('## Screens', '', '| Address | File | Lines | Menu | Marks |', '|---|---|---|---|---|');
  for (const s of a.screens) L.push(`| ${s.route ? code(s.route) : '—'} | \`${s.file}\` | ${s.lines} | ${s.reach && s.reach.menu.length ? s.reach.menu.map((m) => esc((m.group ? m.group + ' › ' : '') + m.label)).join('; ') : '—'} | ${markWords(s.marks)} |`);
  L.push('');
  for (const s of a.screens) {
    L.push(`## ${s.route || s.file}`, '', `File \`${s.file}\` · ${s.lines} lines${s.frame ? ` · frame: ${s.frame}` : ''}${s.server && s.server !== 'none' ? ` · ${s.server}` : ''}`, '');
    if (markWords(s.marks)) L.push(`**${markWords(s.marks)}**${s.marks.leftover ? ' — ' + esc(s.marks.leftover) : s.marks.dead ? ' — ' + esc(s.marks.dead) : ''}`, '');
    if (s.reach) {
      L.push('### Who reaches it', '');
      if (s.reach.menu.length) for (const m of s.reach.menu) L.push(`- Menu: ${m.group ? esc(m.group) + ' › ' : ''}«${esc(m.label)}» → \`${m.href}\` — ${m.gates}${m.groupGates ? `; the group: ${m.groupGates}` : ''} (\`Sidebar.tsx\` l.${m.line})`);
      else L.push('- Menu: no entry.');
      L.push(`- Middleware: ${s.reach.middleware.rule}. Signed-out visitor: ${s.reach.middleware.signedOut}. Forced password change holds this page: ${s.reach.middleware.passwordChangeHold ? 'yes' : 'no'}.`);
      if (s.reach.inPage.length) { L.push('- In the page:'); for (const r of s.reach.inPage) L.push(`  - l.${r.line} ${code(r.text)}`); }
      else L.push('- In the page: no access check found by the script.');
      L.push(`- Linked from: ${s.reach.linkedFrom.length ? s.reach.linkedFrom.slice(0, 12).map((x) => '`' + x + '`').join(', ') + (s.reach.linkedFrom.length > 12 ? ` and ${s.reach.linkedFrom.length - 12} more` : '') : 'nothing in the code (reached by typing the address, or from outside)'}`);
      const t = s.reach.tests;
      L.push(`- Tests: ${t.e2eCi.length ? 'browser tests that CI runs: ' + t.e2eCi.map((x) => '`' + x + '`').join(', ') : 'no browser test that CI runs'}${t.e2e.length ? '; browser tests CI skips: ' + t.e2e.map((x) => '`' + x + '`').join(', ') : ''}${t.unit.length ? '; unit tests of the page: ' + t.unit.map((x) => '`' + x + '`').join(', ') : ''}.`);
      const qa = Object.entries(s.reach.qaScenarios);
      if (qa.length) L.push(`- QA scenarios that name this address: ${qa.map(([r, n]) => `${r} ${n.length}`).join(', ')}.`);
      L.push('', '| Role | Sees it in the menu | Middleware |', '|---|---|---|');
      for (const r of ROLES) L.push(`| ${r} | ${s.reach.roles[r].menu} | ${s.reach.roles[r].middleware}${s.reach.roles[r].clash ? ' — **the menu shows it, the middleware refuses**' : ''} |`);
      L.push('');
    }
    for (const kind of Object.keys(NOTE_TITLES)) {
      const mine = notes.filter((n) => n.kind === kind && (n.screen === s.route || n.screen === s.file));
      if (!mine.length) continue;
      L.push(`### ${NOTE_TITLES[kind]}`, '');
      for (const n of mine) L.push(`- ${n.text}${n.source ? ` (${n.source})` : ''}`);
      L.push('');
    }
    if (s.rows) {
      L.push('### What the page file itself draws', '');
      const body = [...rowsMd(s.rows), ...dbMd(s.db)];
      L.push(...(body.length ? body : ['Nothing found by the script.', '']));
      if (s.pieces.length) { L.push('### Pieces it uses (each is listed once, under "Pieces" below)', ''); for (const p of s.pieces) L.push(`- \`${p}\``); L.push(''); }
    }
    if (s.api && s.api.length) { L.push('### API addresses it calls', '', '| Address | Method | Called from |', '|---|---|---|'); for (const c of s.api) L.push(`| \`${c.route}\` | ${c.methods.join(', ') || '?'} | ${c.from.slice(0, 4).map((x) => '`' + x + '`').join(', ')}${c.from.length > 4 ? ` +${c.from.length - 4}` : ''} |`); L.push(''); }
  }
  const pieces = Object.entries(a.pieces);
  if (pieces.length) {
    L.push('## Pieces', '', 'Components and helpers the screens above draw from. Each is listed once.', '');
    for (const [p, v] of pieces) {
      L.push(`### ${p}`, '', `Used by: ${v.usedBy.map((u) => code(u)).join(', ')}`, '');
      L.push(...rowsMd(v.rows), ...dbMd(v.db));
    }
  }
  L.push('## API files of this area', '', '| Address | File | Methods | Screens that call it | Also named in |', '|---|---|---|---|---|');
  for (const x of a.api) L.push(`| \`${x.route}\` | \`${x.file}\` | ${x.methods.join(', ')} | ${x.calledBy.length ? x.calledBy.map(code).join(', ') : '**no screen**'} | ${x.referencedIn.slice(0, 5).map((r) => '`' + r + '`').join(', ')}${x.referencedIn.length > 5 ? ` +${x.referencedIn.length - 5}` : ''} |`);
  L.push('');
  return L.join('\n') + '\n';
}
function markWords(m) {
  const w = [];
  if (!m) return '';
  if (m.dead) w.push('Dead file');
  if (m.toDelete) w.push('To be deleted');
  if (m.leftover) w.push('Leftover (on the list for Brent)');
  if (m.keep) w.push('Looks like a leftover but is in use');
  return w.join(' · ');
}

function writeAll(model) {
  fs.mkdirSync(path.join(INV, 'data'), { recursive: true });
  const wanted = new Set();
  const put = (rel, text) => { wanted.add(rel); fs.writeFileSync(path.join(INV, rel), text); };
  for (const a of model.areas) {
    put(`data/${a.area}.json`, JSON.stringify(a, (k, v) => (k === 'top' ? undefined : v), 1) + '\n');
    put(`${a.area}.md`, areaMd(a, model));
  }
  put('charts.md', chartsMd(model));
  put('leftovers.md', leftoversMd(model));
  put('api-without-screen.md', apiMd(model));
  // Private pages: outside the repository, and only where the private notes are.
  if (model.privateNotes) {
    fs.writeFileSync(path.join(PRIVATE, 'problems.md'), problemsMd(model));
    fs.writeFileSync(path.join(PRIVATE, 'seen.md'), seenMd(model));
  } else {
    console.log(`No private notes at ${PRIVATE_NOTES}: problems.md and seen.md were not written.`);
  }
  put('tests.md', testsMd(model));
  put('README.md', readmeMd(model));
  put('data/_index.json', JSON.stringify(indexData(model), null, 1) + '\n');
  // remove files of areas that no longer exist
  for (const f of [...fs.readdirSync(INV).filter((x) => /^\d\d-.*\.md$/.test(x)), ...fs.readdirSync(path.join(INV, 'data')).map((x) => 'data/' + x)]) if (!wanted.has(f)) fs.rmSync(path.join(INV, f));
}
function indexData(model) {
  return {
    readFrom: model.readFrom,
    counts: model.counts,
    menu: { top: model.menu.top, children: model.menu.children },
    routes: model.areas.flatMap((a) => a.screens.filter((s) => s.route).map((s) => ({ route: s.route, file: s.file, area: a.area, dynamic: /\[/.test(s.route), frame: s.frame, marks: Object.keys(s.marks || {}), roles: Object.fromEntries(ROLES.map((r) => [r, s.reach.roles[r]])) }))),
  };
}
function allScreens(model) { return model.areas.flatMap((a) => a.screens.map((s) => ({ ...s, area: a.area }))); }
function allFilesRows(model) {
  const out = [];
  for (const a of model.areas) {
    for (const s of a.screens) for (const r of s.rows || []) out.push({ area: a.area, file: s.file, screen: s.route || s.file, r });
    for (const [p, v] of Object.entries(a.pieces)) for (const r of v.rows) out.push({ area: a.area, file: p, screen: v.usedBy.join(', '), r });
  }
  return out;
}
function chartsMd(model) {
  const L = ['# Charts on the platform', '', `Written by \`scripts/redesign/inventory.mjs\` from commit \`${model.readFrom.commit.slice(0, 9)}\`. For the later proposal of chart colours: the approved look fixes colours for one series only (DESIGN.md section 6).`, '', 'A series is one set of bars, one line, one area or one shape. A pie has one series and several slices.', '', '| Screen | File | Chart | Series | How many | Colours today | Shown when |', '|---|---|---|---|---|---|---|'];
  let n = 0;
  const vias = new Set((model.areas.find((a) => a.routesOnly) || { screens: [] }).screens.map((x) => x.route));
  for (const x of model.charts) {
    n++;
    const count = x.r.series.some((s) => s.mapped) ? 'varies (one per item of a list)' : String(x.r.series.length);
    const going = x.screens.length && x.screens.every((r) => vias.has(r));
    L.push(`| ${x.screens.length ? x.screens.map(esc).join(', ') + (going ? ' (to be deleted)' : '') : 'no screen uses this file'} | \`${x.file}\` l.${x.r.line} | ${x.r.text} | ${chartSeries(x.r)} | ${count} | ${x.r.series.map((s) => s.fill ? code(s.fill) : (s.cells ? 'per slice' : '—')).join(', ')} | ${shown(x.r)} |`);
  }
  L.push('', `${n} charts drawn with recharts.`, '');
  const extra = (model.annotations.charts || []);
  if (extra.length) { L.push('## Charts drawn without recharts (found by hand)', ''); for (const e of extra) L.push(`- ${e}`); L.push(''); }
  return L.join('\n') + '\n';
}
function leftoversMd(model) {
  const L = ['# Leftover pages — for Brent to decide', '', `Written by \`scripts/redesign/inventory.mjs\` from commit \`${model.readFrom.commit.slice(0, 9)}\`. The marks are in \`areas.json\`. Brent's answers are recorded in the redesign ledger and, once given, in the column "Decision".`, ''];
  const groups = [['toDelete', 'Vías de Transformación (to be deleted)'], ['leftover', 'Test, debug and old pages'], ['keep', 'Look like leftovers but are in use (stay)'], ['dead', 'Dead files']];
  for (const [k, title] of groups) {
    const rows = allScreens(model).filter((s) => s.marks && s.marks[k]);
    if (!rows.length) continue;
    L.push(`## ${title}`, '', '| Address | File | What it does | Who can open it | Linked from | Tests that visit it | Decision |', '|---|---|---|---|---|---|---|');
    for (const s of rows) {
      const who = s.reach ? `${s.reach.middleware.rule}; signed-out: ${s.reach.middleware.signedOut}${s.reach.inPage.length ? '; the page has its own check' : ''}` : '—';
      const t = s.reach ? [...s.reach.tests.e2eCi.map((x) => x + ' (CI)'), ...s.reach.tests.e2e, ...s.reach.tests.unit] : [];
      L.push(`| ${s.route ? code(s.route) : '—'} | \`${s.file}\` | ${esc(s.marks[k] === true ? '' : s.marks[k])}${s.marks.recommend ? ` **Recommendation: ${esc(s.marks.recommend)}.**` : ''} | ${esc(who)} | ${s.reach && s.reach.linkedFrom.length ? s.reach.linkedFrom.slice(0, 3).map((x) => '`' + x + '`').join(', ') : (s.reach && s.reach.menu.length ? 'the menu' : 'nothing')}${s.reach && s.reach.menu.length && s.reach.linkedFrom.length ? ', the menu' : ''} | ${t.length ? t.map((x) => '`' + x + '`').join(', ') : 'none'} | ${esc(s.marks.decision || '')} |`);
    }
    L.push('');
  }
  for (const g of model.going) {
    L.push(`## ${g.name}: the files behind it`, '', `Found by following imports. ${g.only.length} files are used by these screens only and can go with them; ${g.shared.length} are also used by screens that stay and must stay; ${g.api.length} API files belong to the area.`, '');
    L.push('**Used only by these screens**', '', ...g.only.map((f) => `- \`${f}\``), '');
    L.push('**Shared with screens that stay (do not delete)**', '', ...g.shared.map((x) => `- \`${x.file}\` — also used by ${x.alsoUsedBy} other screens, for example ${x.example.map(code).join(', ')}`), '');
    L.push('**API files of the area**', '', ...g.api.map((f) => `- \`${f}\``), '');
  }
  if (model.unreached.length) {
    L.push('## Components that no screen draws', '', 'Found by following imports from every page file: nothing reaches these files. Candidates for the clean-up (phase 8); a test may still import them.', '');
    for (const f of model.unreached) L.push(`- \`${f}\``);
    L.push('');
  }
  const other = model.cfg.otherLeftovers || [];
  if (other.length) { L.push('## Not under pages/', '', '| File | What it is | Decision |', '|---|---|---|'); for (const o of other) L.push(`| \`${o.file}\` | ${esc(o.what)} | ${esc(o.decision || '')} |`); L.push(''); }
  return L.join('\n') + '\n';
}
function apiMd(model) {
  const L = ['# API files that no screen calls', '', `Written by \`scripts/redesign/inventory.mjs\` from commit \`${model.readFrom.commit.slice(0, 9)}\`. An API file is listed here when no screen, and no piece a screen draws, names its address. "Named in" shows where else the address appears (scheduled jobs in \`vercel.json\`, server code, tests). Nothing here is a verdict: an address can be called from outside the platform (a webhook, a link in an email).`, ''];
  for (const a of model.areas) {
    const rows = a.api.filter((x) => !x.calledBy.length);
    if (!rows.length) continue;
    L.push(`## ${a.name}`, '', '| Address | File | Methods | Named in |', '|---|---|---|---|');
    for (const x of rows) L.push(`| \`${x.route}\` | \`${x.file}\` | ${x.methods.join(', ')} | ${x.referencedIn.length ? x.referencedIn.slice(0, 6).map((r) => '`' + r + '`').join(', ') + (x.referencedIn.length > 6 ? ` +${x.referencedIn.length - 6}` : '') : '**nothing**'} |`);
    L.push('');
  }
  const total = model.areas.reduce((n, a) => n + a.api.filter((x) => !x.calledBy.length).length, 0);
  L.push(`${total} of ${model.counts.api} API files.`, '');
  if (model.apiMissing.length) {
    L.push('## Addresses the code names that have no file', '', '| Named in | Address | How |', '|---|---|---|');
    for (const m of model.apiMissing) L.push(`| \`${m.from}\` | \`/${m.to}\` | ${esc(m.how)} |`);
    L.push('');
  }
  return L.join('\n') + '\n';
}
function problemsMd(model) {
  const L = ['# Behaviour problems found on the way', '', 'PRIVATE: kept outside the repository, which is public.', '', `Written by \`scripts/redesign/inventory.mjs\` from commit \`${model.readFrom.commit.slice(0, 9)}\`. Reported to Brent, not fixed by the redesign (PLAN.md, "Not in this plan"). The first three lists are found by the script on every run; the last is hand-written in \`inventory-notes.json\` beside this file.`, ''];
  L.push('## Menu entries that lead to a refusal', '', 'The menu shows the entry to the role; the middleware sends that role to /dashboard.', '', '| Address | Menu entry | Role |', '|---|---|---|');
  for (const s of allScreens(model)) if (s.reach) {
    const by = new Map();
    for (const r of ROLES) if (s.reach.roles[r].clash) { const k = s.reach.roles[r].menu; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
    for (const [k, rs] of by) L.push(`| \`${s.route}\` | ${s.reach.menu.map((m) => esc((m.group ? m.group + ' › ' : '') + m.label)).join('; ')} | ${rs.join(', ')}${k === 'yes' ? '' : ` (${k})`} |`);
  }
  L.push('', '## Links to pages that do not exist', '', '| From | To |', '|---|---|');
  for (const d of model.deadLinks) L.push(`| \`${d.from}\` | \`${d.to}\` |`);
  L.push('', '## API addresses named in the code that have no file', '', '| From | Address | How |', '|---|---|---|');
  for (const m of model.apiMissing) L.push(`| \`${m.from}\` | \`/${m.to}\` | ${esc(m.how)} |`);
  L.push('', '## Found by reading and by sight', '');
  const byScreen = new Map();
  for (const n of (model.privateNotes?.notes || []).filter((x) => x.kind === 'problem')) { if (!byScreen.has(n.screen)) byScreen.set(n.screen, []); byScreen.get(n.screen).push(n); }
  for (const [screen, ns] of byScreen) { L.push(`### ${screen}`, ''); for (const n of ns) L.push(`- ${n.text}${n.source ? ` (${n.source})` : ''}`); L.push(''); }
  const reviews = model.privateNotes?.reviews || [];
  if (reviews.length) { L.push('## Code reviews of 13 Nov 2026 (cited, not repeated)', ''); for (const r of reviews) L.push(`- **${r.area}** — ${r.summary} Report: \`${r.report}\``); L.push(''); }
  return L.join('\n') + '\n';
}
function seenMd(model) {
  const L = ['# Seen on the way, screen by screen', '', `Written by \`scripts/redesign/inventory.mjs\` from commit \`${model.readFrom.commit.slice(0, 9)}\`. PRIVATE: kept outside the repository. What a walk by sight or the picture harness saw that reading the code does not show (where a role really lands, what a screen does when opened). Hand-kept in \`inventory-notes.json\` beside this file (kind "seen").`, ''];
  const byScreen = new Map();
  for (const n of (model.privateNotes?.notes || []).filter((x) => x.kind === 'seen')) { if (!byScreen.has(n.screen)) byScreen.set(n.screen, []); byScreen.get(n.screen).push(n); }
  for (const [screen, ns] of byScreen) { L.push(`## ${screen}`, ''); for (const n of ns) L.push(`- ${n.text}${n.source ? ` (${n.source})` : ''}`); L.push(''); }
  return L.join('\n') + '\n';
}
function testsMd(model) {
  const L = ['# Screens and their tests', '', `Written by \`scripts/redesign/inventory.mjs\` from commit \`${model.readFrom.commit.slice(0, 9)}\`. For phase 3 (the safety net). A browser test is counted for a screen when the test file names the screen's address; that is weaker than "the test checks the screen". CI runs ${model.tests.mandatory.length} of ${model.tests.specCount} browser test files (\`scripts/ci/e2e-mandatory.mjs\`).`, ''];
  const rows = allScreens(model).filter((s) => s.reach);
  const none = rows.filter((s) => !s.reach.tests.e2eCi.length && !s.reach.tests.e2e.length && !s.reach.tests.unit.length);
  const noCi = rows.filter((s) => !s.reach.tests.e2eCi.length && (s.reach.tests.e2e.length || s.reach.tests.unit.length));
  L.push(`- ${rows.length} screens with an address.`, `- ${rows.length - none.length - noCi.length} are named by a browser test that CI runs.`, `- ${noCi.length} are named only by tests CI skips, or have only unit tests.`, `- ${none.length} have no test at all.`, '');
  L.push('## No test at all', '', '| Area | Address | File |', '|---|---|---|');
  for (const s of none) L.push(`| ${s.area} | \`${s.route}\` | \`${s.file}\`${markWords(s.marks) ? ' (' + markWords(s.marks) + ')' : ''} |`);
  L.push('', '## No browser test that CI runs', '', '| Area | Address | Browser tests CI skips | Unit tests |', '|---|---|---|---|');
  for (const s of noCi) L.push(`| ${s.area} | \`${s.route}\` | ${s.reach.tests.e2e.map((x) => '`' + x.replace('tests/', '') + '`').join(', ') || '—'} | ${s.reach.tests.unit.length || '—'} |`);
  L.push('', '## Named by a browser test that CI runs', '', '| Area | Address | Tests |', '|---|---|---|');
  for (const s of rows.filter((x) => x.reach.tests.e2eCi.length)) L.push(`| ${s.area} | \`${s.route}\` | ${s.reach.tests.e2eCi.map((x) => '`' + x.replace('tests/', '') + '`').join(', ')} |`);
  L.push('');
  return L.join('\n') + '\n';
}
function readmeMd(model) {
  const L = ['# GENERA platform redesign — the inventory', '', 'What every screen of the platform offers today, so the redesign can prove that nothing is lost (PLAN.md, "The no-loss rules": the inventory is the contract).', '', `Read from commit \`${model.readFrom.commit}\` (${model.readFrom.date.slice(0, 10)}).`, ''];
  L.push('## How to use it', '', '- One page per area (`NN-name.md`) for people, one data file per area (`data/NN-name.json`) for scripts. Both are written by the script; do not edit them.', '- Hand-written input, never overwritten: `areas.json` (which file belongs to which area, the leftover marks) and `annotations.json` (the changes Brent approved with the mock-ups, and notes).', '- `data/_index.json` lists every address with its file, area and what each role gets from the menu and the middleware. The picture harness of phase 3 walks this list.', '', '```', 'node scripts/redesign/inventory.mjs check   # every file under pages/ is in exactly one area file', 'node scripts/redesign/inventory.mjs diff    # what changed in the code since these files were written', 'node scripts/redesign/inventory.mjs build   # write the files again from the code', 'node scripts/redesign/inventory.mjs diff --src ../another-checkout   # compare against a newer main without moving this branch', '```', '', 'The script needs `node_modules` (it uses the TypeScript parser) and nothing else: no build, no database, no network.', '');
  L.push('## What a row is', '', 'The script reads each page file and every component it imports, and writes a row for each title, tab, button, link, field, table column, pop-up, browser `confirm()`/`alert()`, toast, message, download, chart, jump to another page, access check and fragile hook (element ids that code looks up, `data-testid`, `data-tour`, focus and scroll calls, values kept in the browser). "Shown when" is the condition written around the element in the code, as written; it is how a row is tied to a role. Texts are exactly as in the code; `{…}` stands for a value filled in at run time.', '', 'What reading the code cannot see is added by the walk by sight and kept in `annotations.json`.', '');
  L.push('## Areas', '', '| Area | Screens | API files | Pieces | Rows |', '|---|---|---|---|---|');
  let ts = 0; let ta = 0; let tr = 0;
  for (const a of model.areas) {
    const rows = a.screens.reduce((n, s) => n + (s.rows ? s.rows.length : 0), 0) + Object.values(a.pieces).reduce((n, p) => n + p.rows.length, 0);
    ts += a.screens.length; ta += a.api.length; tr += rows;
    L.push(`| [${a.name}](${a.area}.md) | ${a.screens.length} | ${a.api.length} | ${Object.keys(a.pieces).length} | ${rows} |`);
  }
  L.push(`| **Total** | **${ts}** | **${ta}** | | **${tr}** |`, '');
  L.push(`The menu has ${model.menu.top} entries at the top level and ${model.menu.children} children (\`NAVIGATION_ITEMS\` in \`components/layout/Sidebar.tsx\`).`, '');
  L.push('## Other pages', '', '- [Leftover pages for Brent to decide](leftovers.md)', '- [Charts and their number of series](charts.md)', '- [API files no screen calls](api-without-screen.md)', '- [Screens and their tests](tests.md)', '', 'Not in the repository, which is public: the behaviour problems found on the way and what was seen on a walk by sight. They are kept, and written out as pages, in a private folder beside the redesign\'s ledger (see the head of the script).', '');
  const un = model.scenarios.filter((s) => !s.screens.length);
  L.push('## QA scenarios used as a seed', '', `${model.scenarios.length} role scenarios were read from \`docs/qa-system/seed-*.sql\`. ${model.scenarios.length - un.length} name an address or a menu entry and are counted under that screen; ${un.length} describe a function without naming either. By role: ${ROLES.map((r) => `${r} ${model.scenarios.filter((x) => x.role === r).length}`).join(', ')}. By the seeds' own feature area: ${Object.entries(model.scenarios.reduce((m, x) => { m[x.area] = (m[x.area] || 0) + 1; return m; }, {})).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '', 'The seeds are from February and March 2026: nothing on Zoom, notification settings or Mis Horas, and almost nothing for docente. They were used to seed "who reaches what", not as proof.', '');
  if (model.problems.length) { L.push('## Warnings of the last run', ''); for (const p of model.problems) L.push(`- ${p}`); L.push(''); }
  return L.join('\n') + '\n';
}

// ---------- check ----------
function check() {
  const errors = [];
  const pagesAll = walk('pages').sort();
  const seen = new Map();
  const dataDir = path.join(INV, 'data');
  if (!fs.existsSync(dataDir)) { console.error('No data files yet. Run: node scripts/redesign/inventory.mjs build'); process.exit(1); }
  const commits = new Set();
  for (const f of fs.readdirSync(dataDir).filter((x) => /^\d\d-.*\.json$/.test(x))) {
    const a = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
    commits.add(a.readFrom.commit);
    for (const s of a.screens) { if (!seen.has(s.file)) seen.set(s.file, []); seen.get(s.file).push(f); }
    for (const x of a.api) { if (!seen.has(x.file)) seen.set(x.file, []); seen.get(x.file).push(f); }
    if (!fs.existsSync(path.join(INV, f.replace('.json', '.md')))) errors.push(`${f}: its readable page is missing`);
  }
  for (const f of pagesAll) {
    const n = (seen.get(f) || []).length;
    if (n === 0) errors.push(`${f}: in no area file`);
    if (n > 1) errors.push(`${f}: in ${n} area files (${seen.get(f).join(', ')})`);
  }
  for (const f of seen.keys()) if (!pagesAll.includes(f)) errors.push(`${f}: listed in ${seen.get(f).join(', ')} but no longer exists`);
  if (commits.size > 1) errors.push(`the area files were read from different commits: ${[...commits].join(', ')}`);
  // annotations must point at a screen that exists
  const known = new Set();
  for (const f of fs.readdirSync(dataDir).filter((x) => /^\d\d-.*\.json$/.test(x))) for (const s of JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')).screens) { known.add(s.file); if (s.route) known.add(s.route); }
  if (fs.existsSync(path.join(INV, 'annotations.json'))) for (const n of JSON.parse(fs.readFileSync(path.join(INV, 'annotations.json'), 'utf8')).notes || []) if (!known.has(n.screen) && n.screen !== '(frame)') errors.push(`annotations.json: «${n.screen}» is not a screen of the inventory`);
  if (fs.existsSync(path.join(INV, 'annotations.json'))) {
    const pub = JSON.parse(fs.readFileSync(path.join(INV, 'annotations.json'), 'utf8'));
    const bad = (pub.notes || []).filter((n) => PRIVATE_KINDS.has(n.kind)).length;
    if (bad || pub.reviews) errors.push(`annotations.json holds ${bad} note(s) of a private kind${pub.reviews ? ' and a list of reviews' : ''}: the repository is public, they belong in ${PRIVATE_NOTES}`);
  }
  if (fs.existsSync(path.join(INV, 'problems.md'))) errors.push('problems.md is in the repository: it is a private page');
  if (fs.existsSync(PRIVATE_NOTES)) for (const n of JSON.parse(fs.readFileSync(PRIVATE_NOTES, 'utf8')).notes || []) if (!known.has(n.screen) && n.screen !== '(frame)') errors.push(`inventory-notes.json (private): «${n.screen}» is not a screen of the inventory`);
  // nothing of the inventory may be ignored by git
  if (SRC === ROOT) {
    let ignored = '';
    try { ignored = execFileSync('git', ['-C', ROOT, 'status', '--ignored', '--porcelain', '--', INV_REL], { encoding: 'utf8' }); } catch { /* not a git checkout */ }
    for (const l of ignored.split('\n')) if (l.startsWith('!!')) errors.push(`git ignores ${l.slice(3)}: it would be left out of every commit (see .gitignore)`);
  }
  const screens = pagesAll.filter((f) => !f.startsWith('pages/api/')).length;
  if (errors.length) { console.error(`CHECK FAILED (${errors.length})`); for (const e of errors) console.error(' - ' + e); process.exit(1); }
  console.log(`CHECK PASSED: ${pagesAll.length} files under pages/ (${screens} screen files, ${pagesAll.length - screens} API files), each in exactly one area file. Read from ${[...commits][0].slice(0, 9)}.`);
}

// ---------- diff ----------
function sig(r) { const { line, top, ...rest } = r; return JSON.stringify(rest); }
function anchor(r) { return r.action || r.target || (r.hook && (r.hook.testid || r.hook.id)) || r.name || r.via || r.in || ''; }
function diffRows(oldRows, newRows) {
  const o = new Map(); const n = new Map();
  for (const r of oldRows) { const k = sig(r); o.set(k, (o.get(k) || 0) + 1); }
  for (const r of newRows) { const k = sig(r); n.set(k, (n.get(k) || 0) + 1); }
  let removed = oldRows.filter((r) => { const k = sig(r); if (n.get(k) > 0) { n.set(k, n.get(k) - 1); return false; } return true; });
  let added = newRows.filter((r) => { const k = sig(r); if (o.get(k) > 0) { o.set(k, o.get(k) - 1); return false; } return true; });
  const reworded = [];
  for (const r of [...removed]) {
    const i = added.findIndex((a) => a.kind === r.kind && a.text !== r.text && anchor(a) && anchor(a) === anchor(r));
    if (i >= 0) { reworded.push([r, added[i]]); added.splice(i, 1); removed = removed.filter((x) => x !== r); }
  }
  return { removed, added, reworded };
}
function diff() {
  const dataDir = path.join(INV, 'data');
  const old = new Map(); const oldPieces = new Map(); const oldApi = new Map(); let oldCommit = '';
  for (const f of fs.readdirSync(dataDir).filter((x) => /^\d\d-.*\.json$/.test(x))) {
    const a = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
    oldCommit = a.readFrom.commit;
    for (const s of a.screens) old.set(s.file, { ...s, area: a.area });
    for (const [p, v] of Object.entries(a.pieces)) oldPieces.set(`${a.area} ${p}`, v);
    for (const x of a.api) oldApi.set(x.file, { ...x, area: a.area });
  }
  const model = buildModel();
  const L = [];
  const say = (s) => L.push(s);
  say(`Inventory written from ${oldCommit.slice(0, 9)}; code now at ${model.readFrom.commit.slice(0, 9)}.`);
  const now = new Map(); const nowPieces = new Map(); const nowApi = new Map();
  for (const a of model.areas) { for (const s of a.screens) now.set(s.file, { ...s, area: a.area }); for (const [p, v] of Object.entries(a.pieces)) nowPieces.set(`${a.area} ${p}`, v); for (const x of a.api) nowApi.set(x.file, { ...x, area: a.area }); }
  let changes = 0;
  const show = (r) => `${r.kind} «${r.text}»${r.in ? ' in ' + r.in : ''}`;
  for (const p of model.problems) { say(`NEEDS A PLACE   ${p}`); changes++; }
  for (const f of now.keys()) if (!old.has(f)) { say(`SCREEN ADDED    ${f} (${now.get(f).area})`); changes++; }
  for (const f of old.keys()) if (!now.has(f)) { say(`SCREEN REMOVED  ${f} (${old.get(f).area})`); changes++; }
  for (const f of nowApi.keys()) if (!oldApi.has(f)) { say(`API ADDED       ${f} (${nowApi.get(f).area})`); changes++; }
  for (const f of oldApi.keys()) if (!nowApi.has(f)) { say(`API REMOVED     ${f} (${oldApi.get(f).area})`); changes++; }
  const rowDiff = (label, a, b) => {
    const d = diffRows(a || [], b || []);
    if (!d.added.length && !d.removed.length && !d.reworded.length) return;
    say(`\n${label}`);
    for (const r of d.removed) { say(`  - removed   ${show(r)}`); changes++; }
    for (const r of d.added) { say(`  + added     ${show(r)} (l.${r.line})`); changes++; }
    for (const [x, y] of d.reworded) { say(`  ~ reworded  ${x.kind} «${x.text}» → «${y.text}» (l.${y.line})`); changes++; }
  };
  for (const [f, s] of now) {
    const o = old.get(f); if (!o) continue;
    if (o.area !== s.area) { say(`MOVED AREA      ${f}: ${o.area} → ${s.area}`); changes++; }
    if (o.reach && s.reach) {
      if (JSON.stringify(o.reach.menu.map((m) => [m.label, m.gates, m.groupGates])) !== JSON.stringify(s.reach.menu.map((m) => [m.label, m.gates, m.groupGates]))) { say(`MENU CHANGED    ${s.route}`); changes++; }
      if (JSON.stringify(o.reach.roles) !== JSON.stringify(s.reach.roles) || JSON.stringify(o.reach.middleware) !== JSON.stringify(s.reach.middleware)) { say(`ACCESS CHANGED  ${s.route} (menu or middleware, per role)`); changes++; }
    }
    rowDiff(`${s.route || f}  (${f})`, o.rows, s.rows);
    const op = new Set(o.pieces || []); const np = new Set(s.pieces || []);
    for (const p of np) if (!op.has(p)) { say(`  + piece     ${s.route || f} now draws ${p}`); changes++; }
    for (const p of op) if (!np.has(p)) { say(`  - piece     ${s.route || f} no longer draws ${p}`); changes++; }
    const oa = new Set((o.api || []).map((x) => x.route)); const na = new Set((s.api || []).map((x) => x.route));
    for (const p of na) if (!oa.has(p)) { say(`  + calls     ${s.route || f} → ${p}`); changes++; }
    for (const p of oa) if (!na.has(p)) { say(`  - calls     ${s.route || f} no longer → ${p}`); changes++; }
  }
  for (const [k, v] of nowPieces) if (oldPieces.has(k)) rowDiff(`piece ${k.split(' ')[1]}  (${k.split(' ')[0]})`, oldPieces.get(k).rows, v.rows);
  say(changes ? `\n${changes} changes. Run "node scripts/redesign/inventory.mjs build" to write the inventory again.` : '\nNo changes: the inventory matches the code.');
  console.log(L.join('\n'));
}

// ---------- main ----------
if (cmd === 'build') {
  if (SRC !== ROOT) { console.error('build always reads this checkout; use diff with --src'); process.exit(1); }
  const model = buildModel();
  if (model.problems.length) { for (const p of model.problems) console.error('WARNING ' + p); }
  writeAll(model);
  const rows = model.areas.reduce((n, a) => n + a.screens.reduce((m, s) => m + (s.rows ? s.rows.length : 0), 0) + Object.values(a.pieces).reduce((m, p) => m + p.rows.length, 0), 0);
  console.log(`Wrote ${model.areas.length} areas, ${model.counts.screens} screen files, ${model.counts.api} API files, ${rows} rows, from ${model.readFrom.commit.slice(0, 9)}.`);
  check();
} else if (cmd === 'check') check();
else if (cmd === 'diff') diff();
else { console.error('Usage: node scripts/redesign/inventory.mjs build | check | diff [--src <folder>]'); process.exit(1); }
