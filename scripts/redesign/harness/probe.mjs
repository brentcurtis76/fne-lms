import { chromium } from 'playwright';
import { FIXTURES, stack, HARNESS_NOW } from './lib.mjs';
import { browserClock } from './clock.mjs';
const st = stack(); const [key, path, ...js] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-CL', timezoneId: 'America/Santiago' });
if (process.env.CLOCK) await ctx.addInitScript(browserClock, Date.parse(HARNESS_NOW));
const p = await ctx.newPage();
if (key !== 'anon') { const u = FIXTURES.users[key]; await p.goto(st.APP + '/login'); await p.getByPlaceholder('tu@email.com').fill(u.email); await p.locator('input[type="password"]').fill(u.password); await p.getByRole('button', { name: /iniciar sesión/i }).click(); await p.waitForURL(/dashboard/); }
await p.goto(st.APP + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(Number(process.env.WAIT || 3000));
console.log(JSON.stringify(await p.evaluate(js.join(' ')), null, 1));
await b.close();
