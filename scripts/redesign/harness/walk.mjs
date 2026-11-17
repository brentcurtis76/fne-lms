#!/usr/bin/env node
// The picture harness: signs in as each role on the private local copy and takes a picture of every address of the
// inventory (docs/plan/redesign/inventory/data/_index.json) at desktop and phone width.
//
//   node scripts/redesign/harness/walk.mjs <run-name> [--snapshot <name>] [--roles admin,docente] [--widths desktop,phone]
//                                                      [--only <regex on the address>] [--jobs 6] [--add]
//
//   --snapshot N   put the database back to snapshot N first (stack.sh restore N). Two runs that are to be compared
//                  should name the same snapshot.
//   --add          write into a run folder that already exists (for trying things; a full run starts a new folder)
//
// It writes <pictures>/<run-name>/<role>/<width>/<address>.png, one record file per role and width, and run.json.
// Compare two runs with compare.mjs.
//
// What it does so that two runs on unchanged code come out the same:
//   - the browser's clock starts at HARNESS_NOW on every page load (and the app server's clock stands still there);
//   - requests to anything outside this machine are refused (news, videos, maps), except a few hosts whose answers
//     are kept and replayed (fonts, avatars, video thumbnails: OUTSIDE_KEPT in rules.mjs);
//   - requests that could write are refused once signed in (some pages write just by being opened), except the
//     reads made with POST that are listed in ALLOW_POST below; what was refused is recorded per address;
//   - animations are finished or stopped before a picture, and a picture is only taken once two in a row are equal;
//   - it waits for the page, its late-loading parts (the menu draws in two beats) and its fonts.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES, HARNESS_NOW, INDEX, PICTURES, ROLES, ROOT, STATE, stack } from './lib.mjs';
import { allParams, allVariants } from './seed.mjs';
import { ALLOW_POST, EXTRA_PARAMS, MASKS, OUTSIDE_KEPT, REACH_BY_CLICK } from './rules.mjs';
import { browserClock } from './clock.mjs';

const WIDTHS = {
  desktop: { viewport: { width: 1366, height: 900 }, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};
const MAX_HEIGHT = 12000; // the tallest window; a taller page is taken in parts

function args() {
  const a = process.argv.slice(2);
  const out = { name: null, roles: Object.keys(ROLES), widths: Object.keys(WIDTHS), only: null, jobs: 6, add: false, snapshot: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--roles') out.roles = a[++i].split(',');
    else if (a[i] === '--widths') out.widths = a[++i].split(',');
    else if (a[i] === '--only') out.only = new RegExp(a[++i]);
    else if (a[i] === '--jobs') out.jobs = Number(a[++i]);
    else if (a[i] === '--snapshot') out.snapshot = a[++i];
    else if (a[i] === '--add') out.add = true;
    else if (!out.name) out.name = a[i];
    else throw new Error(`unknown argument ${a[i]}`);
  }
  if (!out.name || !/^[A-Za-z0-9._-]+$/.test(out.name)) throw new Error('give the run a name (letters, digits, dot, dash)');
  for (const r of out.roles) if (!(r in ROLES)) throw new Error(`unknown role ${r}`);
  for (const w of out.widths) if (!(w in WIDTHS)) throw new Error(`unknown width ${w}`);
  return out;
}

export const slug = (route) =>
  `${route.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'home'}-${createHash('sha1').update(route).digest('hex').slice(0, 6)}`;

const pathOf = (url) => { const u = new URL(url); return u.pathname + u.search; };

// Fill the changing parts of an address. Returns null when an id is missing.
function fill(route, values) {
  let missing = false;
  const url = route.replace(/\[([^\]]+)\]/g, (_, k) => {
    if (!values || values[k] === undefined) { missing = true; return ''; }
    return encodeURIComponent(values[k]);
  });
  if (missing) return null;
  // '?' in the values is a query string the address needs for this role (an admin who must name a school).
  // '#' likewise is a fragment (a page opened by a link that carries a key after the #).
  return url.split('/').map((p) => (p.includes('%') ? p : encodeURIComponent(p))).join('/')
    + (values && values['?'] ? `?${values['?']}` : '') + (values && values['#'] ? `#${values['#']}` : '');
}

// Wait until the page has stopped loading: no request in flight for a while, fonts ready, no loading marks.
async function settle(page, inflight) {
  await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
  const deadline = Date.now() + 25000;
  let quietSince = null; let lastUrl = page.url();
  while (Date.now() < deadline) {
    const busy = inflight.size > 0 || page.url() !== lastUrl;
    lastUrl = page.url();
    if (busy) quietSince = null; else if (quietSince === null) quietSince = Date.now();
    if (quietSince !== null && Date.now() - quietSince >= 700) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const quiet = quietSince !== null && Date.now() - quietSince >= 700;
  const pending = quiet ? [] : [...inflight].map((r) => `${r.method()} ${new URL(r.url()).pathname}`).slice(0, 8);
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  // Pictures in the page: wait until each has either loaded or failed (a person's photo that arrives late leaves the
  // initials in one run and the photo in the next).
  await page.evaluate(() => new Promise((done) => {
    const until = performance.now() + 6000;
    const check = () => ([...document.images].every((i) => i.complete || i.loading === 'lazy') || performance.now() > until ? done() : setTimeout(check, 100));
    check();
  })).catch(() => {});
  // Loading marks: spinners, skeletons, "Cargando…". Wait for them to go, but not for ever (some never do).
  const loading = () => page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    if ([...document.querySelectorAll('.animate-spin, [aria-busy="true"]')].some(vis)) return true;
    // Skeletons are grey boxes that pulse. Other things pulse too (the feedback button, the sign-in screen's dots).
    const grey = (e) => /\bbg-(gray|slate|neutral|zinc)-(100|200|300)\b/.test(typeof e.className === 'string' ? e.className : '');
    if ([...document.querySelectorAll('.animate-pulse')].some((e) => vis(e) && !e.closest('button, a') && (grey(e) || [...e.querySelectorAll('*')].some(grey)))) return true;
    // A shown text that starts with "Cargando". (A <title> left inside the body by a page's head says "Cargando…"
    // for ever on some pages and is not shown: it must not count.)
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!/^\s*Cargando\b/.test(n.nodeValue || '')) continue;
      const el = n.parentElement;
      if (!el || el.closest('title, script, style, noscript, head, next-route-announcer')) continue; // the announcer repeats the page title for screen readers
      const box = el.getBoundingClientRect();
      if (vis(el) && box.width > 2 && box.height > 2) return true;
    }
    return false;
  }).catch(() => false);
  const until = Date.now() + 15000; let stillLoading = await loading();
  while (stillLoading && Date.now() < until) { await new Promise((r) => setTimeout(r, 200)); stillLoading = await loading(); }
  if (!stillLoading && inflight.size > 0) {
    const d2 = Date.now() + 8000;
    while (inflight.size > 0 && Date.now() < d2) await new Promise((r) => setTimeout(r, 100));
  }
  // Toasts: a message a page shows on arrival goes away by itself after a few seconds, so a picture taken while it
  // is up differs from one taken a moment later. Wait until none is up (a toast that stays, such as a loading one,
  // is in the picture: the wait gives up after ten seconds).
  const toastUp = () => page.evaluate(() => {
    // react-hot-toast draws every toast inside one box marked data-rht-toaster.
    return [...document.querySelectorAll('[data-rht-toaster] [role="status"], [data-rht-toaster] [aria-live]')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  }).catch(() => false);
  const d3 = Date.now() + 10000;
  while (Date.now() < d3 && await toastUp()) await new Promise((r) => setTimeout(r, 200));
  return { quiet, stillLoading, pending };
}

// What hides inside a scrolling box of the page (a list with its own scroll bar): the window is made taller by that
// much, so the picture shows it. The document itself needs no help: the picture is of the whole page.
async function hiddenInScrollBoxes(page) {
  return page.evaluate(() => {
    let extra = 0;
    for (const e of document.querySelectorAll('*')) {
      const s = getComputedStyle(e);
      if (!/(auto|scroll)/.test(s.overflowY)) continue;
      if (e === document.documentElement || e === document.body) continue;
      const r = e.getBoundingClientRect();
      if (r.width < window.innerWidth * 0.5 || e.clientHeight < 300) continue;
      extra = Math.max(extra, e.scrollHeight - e.clientHeight);
    }
    return Math.max(0, extra);
  }).catch(() => 0);
}

// Scroll down the page and back, so that pictures and sections that only load or appear when scrolled to are there.
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, window.innerHeight - 100);
    for (let y = 0; y < document.documentElement.scrollHeight && y < 60000; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
}

// The picture: the whole page, taken without touching the window's size at that moment. (Any whole-page picture that
// reaches beyond the window resizes it for an instant, and charts start drawing themselves again on every resize: no
// two pictures would ever be equal.) So the window is made tall first, and what still does not fit is taken in
// parts, by scrolling. Before each picture, animations are brought to their end, or stopped if they never end.
async function takeWhole(page, cdp, masks) {
  const m = await page.evaluate((hide) => {
    for (const a of document.getAnimations()) {
      try { if (a.effect && a.effect.getComputedTiming().endTime === Infinity) a.cancel(); else a.finish(); } catch { /* not finishable */ }
    }
    // What changes every time by its nature (rules.mjs, MASKS) is hidden; its place is kept.
    for (const mask of hide) {
      let found = [];
      if (mask.selector) found = [...document.querySelectorAll(mask.selector)];
      else {
        const re = new RegExp(mask.text);
        found = [...document.querySelectorAll('body *')].filter((e) => re.test(e.textContent || '') && ![...e.children].some((c) => re.test(c.textContent || '')));
      }
      for (const e of found) e.style.setProperty('visibility', 'hidden', 'important');
    }
    return { w: window.innerWidth, h: window.innerHeight, doc: Math.max(document.documentElement.scrollHeight, window.innerHeight) };
  }, masks);
  const parts = [];
  for (let y = 0; y < m.doc; y += m.h) {
    const top = Math.min(y, m.doc - m.h);
    await page.evaluate((t) => new Promise((done) => {
      window.scrollTo({ top: t, left: 0, behavior: 'instant' });
      requestAnimationFrame(() => requestAnimationFrame(() => done()));
    }), top);
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false,
      clip: { x: 0, y: y - top, width: m.w, height: Math.min(m.h, m.doc - y), scale: 1 },
    });
    parts.push(Buffer.from(data, 'base64'));
  }
  if (parts.length > 1) await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  return parts;
}
const sameParts = (a, b) => a.length === b.length && a.every((x, i) => x.equals(b[i]));
async function stablePicture(page, cdp, route) {
  await page.addStyleTag({ content: '*, *::before, *::after { caret-color: transparent !important; }' }).catch(() => {});
  // The pointer is taken off the page: wherever it was left (on the sign-in button, last), something would be drawn
  // in its hovered state, in one run and not in the next.
  await page.mouse.move(-10, -10).catch(() => {});
  const masks = MASKS.filter((x) => x.route.test(route)).map((x) => ({ selector: x.selector || null, text: x.text ? x.text.source : null }));
  let prev = await takeWhole(page, cdp, masks);
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const next = await takeWhole(page, cdp, masks);
    if (sameParts(next, prev)) return { parts: next, stable: true, tries: i + 2 };
    prev = next;
  }
  return { parts: prev, stable: false, tries: 11 };
}

async function describe(page) {
  return page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const txt = (e) => (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    const main = document.querySelector('main') || document.body;
    return {
      title: document.title,
      // The look the page carries at this moment (phase 5): "nuevo", or null for today's look.
      look: document.documentElement.getAttribute('data-look'),
      headings: [...main.querySelectorAll('h1,h2,h3')].filter(vis).map(txt).filter(Boolean).slice(0, 40),
      menu: [...document.querySelectorAll('[data-testid="global-sidebar"] [data-testid^="sidebar-item-"]')].map((e) => e.getAttribute('data-testid').replace('sidebar-item-', '')),
      text: ((document.body && document.body.innerText) || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').slice(0, 5000),
      // The page's own content without the frame around it (phase 5: the frame differs between the two looks, the content must not).
      mainText: document.querySelector('main') ? (document.querySelector('main').innerText || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').slice(0, 5000) : null,
    };
  }).catch(() => ({}));
}

async function signIn(page, user, app) {
  await page.goto(`${app}/login`, { waitUntil: 'load' });
  await page.getByPlaceholder('tu@email.com').fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await page.waitForURL((u) => /^\/dashboard/.test(u.pathname), { timeout: 30000 });
}

// Outside this machine: refused, except the few hosts of OUTSIDE_KEPT (fonts, avatar and video thumbnails), whose
// answers are fetched once, kept in the state folder and replayed from there ever after.
const KEPT = join(STATE, 'outside');
const EMPTY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'); // 1×1, transparent
async function outside(route, req, u, cur) {
  if (req.method() !== 'GET' || !OUTSIDE_KEPT.includes(u.hostname)) {
    if (cur) cur.outside.add(u.hostname);
    // A refused picture is answered with an empty one instead of an error: a page that swaps a failed photo for the
    // person's initials does so only if the failure arrives after the page is ready, sometimes yes and sometimes no.
    if (req.resourceType() === 'image') return route.fulfill({ status: 200, contentType: 'image/png', body: EMPTY_PNG });
    return route.abort();
  }
  const f = join(KEPT, `${createHash('sha1').update(req.url()).digest('hex')}.json`);
  try {
    if (!existsSync(f)) {
      const resp = await route.fetch({ timeout: 15000 });
      if (resp.status() !== 200) throw new Error(`status ${resp.status()}`);
      const headers = {};
      for (const k of ['content-type', 'access-control-allow-origin']) if (resp.headers()[k]) headers[k] = resp.headers()[k];
      mkdirSync(KEPT, { recursive: true });
      writeFileSync(f, JSON.stringify({ url: req.url(), headers, body: (await resp.body()).toString('base64') }));
    }
    const kept = JSON.parse(readFileSync(f, 'utf8'));
    return await route.fulfill({ status: 200, headers: kept.headers, body: Buffer.from(kept.body, 'base64') });
  } catch (e) {
    if (cur) cur.outside.add(`${u.hostname} (could not be fetched)`);
    return route.abort().catch(() => {});
  }
}

async function lane(browser, st, opt, role, width, routes, params, outDir, listed) {
  const w = WIDTHS[width];
  const ctx = await browser.newContext({
    ...w, deviceScaleFactor: 1, locale: 'es-CL', timezoneId: 'America/Santiago', reducedMotion: 'reduce', colorScheme: 'light',
  });
  await ctx.addInitScript(browserClock, Date.parse(HARNESS_NOW));
  let locked = false;
  let cur = null; // the record of the address being looked at
  const inflight = new Set();
  await ctx.route('**/*', (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (!local) return outside(route, req, u, cur);
    if (!locked || m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.continue();
    const what = `${m} ${u.pathname}`;
    if (ALLOW_POST.some((re) => re.test(what))) { if (cur) cur.allowed.add(what); return route.continue(); }
    if (cur) cur.refused.add(what);
    return route.abort();
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  page.on('request', (r) => { if (!/^(data|blob):/.test(r.url())) inflight.add(r); });
  const done = (r) => inflight.delete(r);
  page.on('requestfinished', done); page.on('requestfailed', done);
  page.on('response', (r) => {
    if (!cur) return; const s = r.status();
    if (s >= 400) { const u = new URL(r.url()); cur.failed.add(`${s} ${r.request().method()} ${u.pathname}`); }
  });
  page.on('pageerror', (e) => { if (cur) cur.pageErrors.push(String(e.message).slice(0, 200)); });
  page.on('console', (m) => { if (cur && m.type() === 'error') cur.consoleErrors += 1; });
  page.on('dialog', (d) => { if (cur) cur.dialogs.push(`${d.type()}: ${d.message().slice(0, 120)}`); d.dismiss().catch(() => {}); });

  const records = [];
  const key = ROLES[role];
  let signedAt = 0;
  const enter = async () => {
    locked = false;
    for (let attempt = 1; ; attempt++) {
      try {
        await ctx.clearCookies();
        await signIn(page, FIXTURES.users[key], st.APP);
        break;
      } catch (e) {
        if (attempt === 4) throw e; // the sign-in service has bad moments under load; four refusals in a row is something else
        await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
    await settle(page, inflight);
    locked = true; signedAt = Date.now();
  };
  if (key) await enter(); else locked = true;

  const dir = join(outDir, role, width);
  mkdirSync(dir, { recursive: true });

  for (const r of routes) {
    const rec = { role, width, route: r.route, file: null };
    if (r.onlyRoles && !r.onlyRoles.includes(role)) continue;
    const values = r.values || (params[r.route] ? (params[r.route][role] || params[r.route].default) : undefined);
    const url = fill(r.pattern || r.route, values);
    if (url === null) { rec.skipped = 'no id for its changing part'; records.push(rec); continue; }
    if (key && Date.now() - signedAt > 40 * 60 * 1000) await enter(); // a session lasts an hour
    const t0 = Date.now();
    // A signed-in visitor who lands on the sign-in screen, or gets a 401 or a server error, may have lost the session
    // (under load the local sign-in service fails for a moment and the app then signs the person out for good).
    // Sign in again and look once more; if the same thing happens again it is how the page behaves.
    let lastSign = null;
    let sameInARow = 0;
    for (let attempt = 1; attempt <= 5; attempt++) {
    for (const k of Object.keys(rec)) if (!['role', 'width', 'route', 'file'].includes(k)) delete rec[k];
    rec.file = null;
    cur = { outside: new Set(), refused: new Set(), allowed: new Set(), failed: new Set(), pageErrors: [], consoleErrors: 0, dialogs: [] };
    try {
      await page.setViewportSize(w.viewport);
      inflight.clear();
      const resp = await page.goto(st.APP + url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      rec.asked = url; rec.status = resp ? resp.status() : null;
      let s = await settle(page, inflight);
      rec.landed = pathOf(page.url());
      // The session trap: a page that asks for the session too early sends a signed-in person to the panel.
      // Such pages work when reached by a click, so try that way too.
      // (Not tried where the inventory says the middleware itself sends this role to the panel: a click meets the same middleware.)
      const middlewareSends = r.roles && r.roles[role] && /^sent to/.test(r.roles[role].middleware || '');
      if (key && !middlewareSends && new URL(page.url()).pathname === '/dashboard' && !/^\/dashboard/.test(url) && (REACH_BY_CLICK === 'all' || REACH_BY_CLICK.includes(r.route))) {
        await page.evaluate((to) => window.next.router.push(to), url);
        s = await settle(page, inflight);
        const now = pathOf(page.url());
        if (new URL(page.url()).pathname !== '/dashboard') { rec.directLanded = rec.landed; rec.reached = 'click'; rec.landed = now; }
      }
      const landedPath = new URL(page.url()).pathname;
      const askedPath = new URL(st.APP + url).pathname;
      rec.sentAway = decodeURIComponent(landedPath) !== decodeURIComponent(askedPath);
      Object.assign(rec, await describe(page));
      // A role that is sent to another address gets no picture of its own here when that address is photographed
      // directly anyway; the record of where it landed is the proof.
      const landedIsListed = listed.has(landedPath);
      if (rec.sentAway && landedIsListed) {
        rec.sameAs = landedPath;
      } else {
        await scrollThrough(page);
        s = await settle(page, inflight);
        // Make the window as tall as the page (plus what a list with its own scroll bar hides), so the picture needs
        // few parts. A page whose sections are sized by the window's height would only stretch: it keeps the
        // normal window and is taken in parts.
        const height = () => page.evaluate(() => document.documentElement.scrollHeight).catch(() => 0);
        const before = await height();
        const tall = Math.min(MAX_HEIGHT, Math.max(w.viewport.height, before) + await hiddenInScrollBoxes(page));
        if (tall > w.viewport.height) {
          await page.setViewportSize({ width: w.viewport.width, height: tall });
          s = await settle(page, inflight);
          if (await height() > before * 1.15 + 200) {
            await page.setViewportSize(w.viewport);
            s = await settle(page, inflight);
            rec.stretches = true;
          }
        }
        const pic = await stablePicture(page, cdp, r.pattern || r.route);
        const hidden = MASKS.filter((x) => x.route.test(r.pattern || r.route)).length; if (hidden) rec.masks = hidden;
        rec.file = `${role}/${width}/${slug(r.route)}.png`;
        const hash = createHash('sha256');
        pic.parts.forEach((png, n) => { writeFileSync(join(outDir, n ? rec.file.replace(/\.png$/, `.${n + 1}.png`) : rec.file), png); hash.update(png); });
        rec.sha = hash.digest('hex');
        if (pic.parts.length > 1) rec.parts = pic.parts.length;
        rec.bytes = pic.parts.reduce((a, b) => a + b.length, 0); rec.stable = pic.stable; rec.tries = pic.tries;
        rec.pageHeight = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => null);
        Object.assign(rec, await describe(page));
      }
      rec.quiet = s.quiet; rec.stillLoading = s.stillLoading; if (s.pending.length) rec.pending = s.pending;
    } catch (e) {
      rec.error = String(e.message).split('\n')[0].slice(0, 300);
    }
    if (!key) break;
    const trouble = [...cur.failed].filter((f) => /^(401|5\d\d) /.test(f)).sort();
    // Some pages send a visitor whose session they cannot read to /auth/login or /auth/signin, addresses that do not
    // exist: the same lost session, shown as a 404.
    const onSignIn = /^\/(auth\/)?(login|signin)/.test(rec.landed || '');
    // Still loading when the wait ran out. A few pages are like that every time; but now and then a page that
    // normally loads in three seconds hangs for good on one request (seen under load: /quiz-reviews/[id],
    // /mi-aprendizaje/tareas). One more look tells the two apart.
    const stuck = Boolean(rec.stillLoading);
    // An address reached by a click from the panel (REACH_BY_CLICK) whose own-profile read came back empty: the page
    // asked before the browser's session was attached to the request, the trap those addresses have. A person who
    // really clicks gets the page; look again until this visitor does.
    const beforeSession = rec.reached === 'click' && cur.failed.has('406 GET /rest/v1/profiles');
    const sign = JSON.stringify([rec.error || null, onSignIn, trouble, stuck, beforeSession]);
    if (!rec.error && !onSignIn && !trouble.length && !stuck && !beforeSession) break;
    // The sign-in service's bad moments last a few seconds and can catch the second look too: a landing on the
    // sign-in screen, or an error from the sign-in service itself, must be seen three times in a row to be believed.
    sameInARow = sign === lastSign ? sameInARow + 1 : 1;
    const needed = beforeSession ? 5 : onSignIn || trouble.some((f) => /\/auth\/v1\//.test(f)) ? 3 : 2;
    if (sameInARow >= needed || attempt === 5) { if (attempt > 1) rec.lookedAgain = attempt - 1; break; }
    lastSign = sign;
    await new Promise((r) => setTimeout(r, 1500 * attempt));
    cur = null;
    await enter();
    }
    rec.ms = Date.now() - t0;
    for (const k of ['outside', 'refused', 'allowed', 'failed']) if (cur[k].size) rec[k] = [...cur[k]].sort();
    if (cur.pageErrors.length) rec.pageErrors = cur.pageErrors.slice(0, 5);
    if (cur.consoleErrors) rec.consoleErrors = cur.consoleErrors;
    if (cur.dialogs.length) rec.dialogs = cur.dialogs;
    cur = null;
    records.push(rec);
    if (opt.verbose) console.log(`${role} ${width} ${r.route} → ${rec.error || rec.landed}${rec.sameAs ? ' (no picture)' : ''} ${rec.ms} ms`);
  }
  // With --add, the records of addresses walked now replace the ones kept; the rest of the lane's records stay.
  const laneFile = join(outDir, `${role}.${width}.json`);
  let keep = records;
  if (opt.add && existsSync(laneFile)) {
    const fresh = new Map(records.map((x) => [x.route, x]));
    keep = JSON.parse(readFileSync(laneFile, 'utf8')).map((x) => { const n = fresh.get(x.route); fresh.delete(x.route); return n || x; });
    keep.push(...fresh.values());
  }
  writeFileSync(laneFile, JSON.stringify(keep, null, 1));
  await ctx.close();
  return records;
}

const opt = args();
const st = stack();
const outDir = join(PICTURES, opt.name);
if (existsSync(outDir) && !opt.add) throw new Error(`${outDir} exists; give a new name, or --add`);
mkdirSync(outDir, { recursive: true });

const sh = (cmd, ...a) => execFileSync(join(ROOT, 'scripts/redesign/harness/stack.sh'), [cmd, ...a], { encoding: 'utf8' });
// The app must run with its clock standing still (stack.sh serve pictures); restore restarts it that way.
process.stdout.write(opt.snapshot ? sh('restore', opt.snapshot, 'pictures') : sh('serve', 'pictures'));
const fingerprint = () => { try { return JSON.parse(sh('fingerprint')); } catch (e) { return { error: String(e.message).slice(0, 200) }; } };
const before = fingerprint();

const index = JSON.parse(readFileSync(INDEX, 'utf8'));
let routes = index.routes;
const listed = new Set(index.routes.filter((r) => !r.dynamic).map((r) => r.route));
if (opt.only) routes = routes.filter((r) => opt.only.test(r.route));
const params = await allParams();
for (const [route, v] of Object.entries(EXTRA_PARAMS)) params[route] = { ...(params[route] || {}), ...v };
// Further states of some addresses (a contract's detail panel, a draft): walked after the address itself.
const withVariants = [];
const variants = await allVariants();
for (const r of routes) {
  withVariants.push(r);
  for (const v of variants.filter((x) => x.route === r.route)) withVariants.push({ ...r, route: `${r.route} ~${v.name}`, pattern: r.route, values: v.values, onlyRoles: v.roles, dynamic: true });
}
routes = withVariants;

const read = (f) => (existsSync(join(STATE, f)) ? readFileSync(join(STATE, f), 'utf8').trim() : null);
const meta = {
  name: opt.name, started: new Date().toISOString(), harnessNow: HARNESS_NOW,
  commit: execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  builtCommit: read('built-commit'), builtWithUncommitted: Boolean(read('built-dirty')),
  snapshot: opt.snapshot || read('restored'), snapshotRestoredForThisRun: Boolean(opt.snapshot),
  inventoryReadFrom: index.readFrom.commit, roles: opt.roles, widths: opt.widths, only: opt.only ? String(opt.only) : null,
  addresses: routes.length,
};

const browser = await chromium.launch({ headless: true });
const lanes = [];
for (const role of opt.roles) for (const width of opt.widths) lanes.push([role, width]);
const all = [];
let next = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(opt.jobs, lanes.length) }, async () => {
  while (next < lanes.length) {
    const [role, width] = lanes[next++];
    const t = Date.now();
    try {
      const recs = await lane(browser, st, { verbose: Boolean(opt.only) }, role, width, routes, params, outDir, listed);
      all.push(...recs);
      console.log(`${role} ${width}: ${recs.filter((r) => r.file).length} pictures, ${recs.filter((r) => r.sameAs).length} sent to an address photographed elsewhere, ${recs.filter((r) => r.skipped).length} without id, ${recs.filter((r) => r.error).length} errors, ${Math.round((Date.now() - t) / 1000)} s`);
    } catch (e) {
      console.error(`${role} ${width}: FAILED — ${String(e.message).split('\n')[0]}`);
      all.push({ role, width, laneError: String(e.message).split('\n')[0] });
      process.exitCode = 1;
    }
  }
}));
await browser.close();

const after = fingerprint();
meta.finished = new Date().toISOString();
meta.seconds = Math.round((Date.now() - t0) / 1000);
meta.pictures = all.filter((r) => r.file).length;
meta.unstable = all.filter((r) => r.file && !r.stable).length;
meta.errors = all.filter((r) => r.error || r.laneError).length;
meta.databaseChangedByTheWalk = before.error || after.error ? 'not measured' : Object.keys(after).filter((t) => after[t] !== before[t]).sort();
// With --add into a finished run, the run's own summary stays and this walk is noted under it.
const runFile = join(outDir, 'run.json');
if (opt.add && existsSync(runFile)) {
  const first = JSON.parse(readFileSync(runFile, 'utf8'));
  const { name: _n, harnessNow: _h, inventoryReadFrom: _i, ...note } = meta;
  first.added = [...(first.added || []), note];
  // The totals describe the run as it now stands.
  const now = readdirSync(outDir).filter((f) => /^[a-z_]+\.(desktop|phone)\.json$/.test(f)).flatMap((f) => JSON.parse(readFileSync(join(outDir, f), 'utf8')));
  first.pictures = now.filter((r) => r.file).length; first.unstable = now.filter((r) => r.file && !r.stable).length; first.errors = now.filter((r) => r.error).length;
  writeFileSync(runFile, JSON.stringify(first, null, 1));
} else writeFileSync(runFile, JSON.stringify(meta, null, 1));
console.log(`\n${opt.name}: ${meta.pictures} pictures in ${meta.seconds} s; ${meta.unstable} not stable; ${meta.errors} errors.`);
console.log(`Tables the walk changed: ${Array.isArray(meta.databaseChangedByTheWalk) ? (meta.databaseChangedByTheWalk.join(', ') || 'none') : meta.databaseChangedByTheWalk}`);
console.log(`Written to ${outDir}`);
