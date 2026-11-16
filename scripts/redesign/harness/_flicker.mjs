// A session's tool: open one address as one account under the harness's clock, take pictures half a second apart and
// say where they differ.   node _flicker.mjs <fixture key|anon> <address> [phone]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { FIXTURES, stack, HARNESS_NOW, STATE } from './lib.mjs';
import { browserClock } from './clock.mjs';
const st = stack(); const [key, path, phone] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1366, height: 900 }, isMobile: !!phone, hasTouch: !!phone, deviceScaleFactor: 1, locale: 'es-CL', timezoneId: 'America/Santiago', reducedMotion: 'reduce' });
await ctx.addInitScript(browserClock, Date.parse(HARNESS_NOW));
const p = await ctx.newPage();
if (key !== 'anon') { const u = FIXTURES.users[key]; await p.goto(st.APP + '/login'); await p.getByPlaceholder('tu@email.com').fill(u.email); await p.locator('input[type="password"]').fill(u.password); await p.getByRole('button', { name: /iniciar sesión/i }).click(); await p.waitForURL(/dashboard/); }
await p.goto(st.APP + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(4000);
if (process.env.TALL) { const h = await p.evaluate(() => document.documentElement.scrollHeight); await p.setViewportSize({ width: p.viewportSize().width, height: h }); await p.waitForTimeout(4000); }
const opt = { fullPage: !process.env.TALL, animations: process.env.ANIM || 'disabled', caret: 'hide', scale: 'css' };
const shots = []; for (let i = 0; i < 4; i++) { shots.push(await p.screenshot(opt)); await p.waitForTimeout(500); }
const q = await b.newPage();
for (let i = 1; i < shots.length; i++) {
  const r = await q.evaluate(async ([a, c]) => { const img = (s) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = s; }); const [ia, ib] = await Promise.all([img(a), img(c)]); const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height); const d = (im) => { const cv = new OffscreenCanvas(w, h); const x = cv.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, w, h).data; }; const da = d(ia), db = d(ib); let n = 0, t = h, bo = -1, l = w, ri = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = (y * w + x) * 4; if (da[k] !== db[k] || da[k + 1] !== db[k + 1] || da[k + 2] !== db[k + 2]) { n++; if (y < t) t = y; if (y > bo) bo = y; if (x < l) l = x; if (x > ri) ri = x; } } return { n, box: [l, t, ri, bo], size: [ia.width, ia.height, ib.width, ib.height] }; }, [`data:image/png;base64,${shots[i - 1].toString('base64')}`, `data:image/png;base64,${shots[i].toString('base64')}`]);
  console.log(`shot ${i - 1} → ${i}:`, JSON.stringify(r));
  if (r.n && !globalThis.saved) { globalThis.saved = true; const [l, t, ri, bo] = r.box; const clip = { x: Math.max(0, l - 40), y: Math.max(0, t - 40), width: Math.min(900, ri - l + 80), height: Math.min(700, bo - t + 80) }; writeFileSync(`${STATE}/flicker-a.png`, await p.screenshot({ ...opt, clip })); await p.waitForTimeout(500); writeFileSync(`${STATE}/flicker-b.png`, await p.screenshot({ ...opt, clip })); console.log('saved the changing area to', `${STATE}/flicker-a.png`, 'and flicker-b.png'); }
}
await b.close();
