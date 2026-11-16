// A session's tool: open an address as an account, click a visible text (viewing only), print what the page then shows near it.
//   node _open.mjs <fixture key> <address> "<text to click>" [picture file]
import { chromium } from 'playwright';
import { FIXTURES, stack, HARNESS_NOW } from './lib.mjs';
import { browserClock } from './clock.mjs';
const st = stack(); const [key, path, text, out] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1, locale: 'es-CL', timezoneId: 'America/Santiago' });
await ctx.addInitScript(browserClock, Date.parse(HARNESS_NOW));
const refused = [];
await ctx.route('**/*', (route) => { const r = route.request(); const u = new URL(r.url()); if (['GET', 'HEAD', 'OPTIONS'].includes(r.method()) || globalThis.signingIn || /\/rest\/v1\/rpc\/|\/auth\/v1\/token/.test(u.pathname)) return route.continue(); refused.push(`${r.method()} ${u.pathname}`); return route.abort(); });
const p = await ctx.newPage();
globalThis.signingIn = true;
const u = FIXTURES.users[key]; await p.goto(st.APP + '/login'); await p.getByPlaceholder('tu@email.com').fill(u.email); await p.locator('input[type="password"]').fill(u.password); await p.getByRole('button', { name: /iniciar sesión/i }).click(); await p.waitForURL(/dashboard/);
globalThis.signingIn = false;
await p.goto(st.APP + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
const before = await p.evaluate(() => document.querySelector('main').innerText);
await p.getByText(text, { exact: true }).first().click();
await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(1500);
const after = await p.evaluate(() => ({ text: document.querySelector('main').innerText, buttons: [...document.querySelectorAll('main button, main a, [role="dialog"] button')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.innerText || e.getAttribute('aria-label') || e.getAttribute('title') || '').replace(/\s+/g, ' ').trim()).filter(Boolean), dialogs: [...document.querySelectorAll('[role="dialog"]')].map((e) => e.innerText.slice(0, 300)) }));
const b4 = new Set(before.split('\n').map((x) => x.trim()));
console.log(JSON.stringify({ url: p.url(), newLines: after.text.split('\n').map((x) => x.trim()).filter((x) => x && !b4.has(x)).slice(0, 80), newButtons: [...new Set(after.buttons)].filter((x) => !before.includes(x)).slice(0, 40), dialogs: after.dialogs, refused }, null, 1));
if (out) await p.screenshot({ path: out, fullPage: true });
await b.close();
