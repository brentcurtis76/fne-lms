#!/usr/bin/env node
// A session's tool: which pixels differ between two pictures, and from which colour to which.
//   node scripts/redesign/harness/_px.mjs <a.png> <b.png> [--crop x,y,w,h --out <file.png>]
// Prints the most frequent colour changes and where they are; with --crop it also saves that part of both pictures
// side by side, three times enlarged, for looking at.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const crop = args.includes('--crop') ? args[args.indexOf('--crop') + 1].split(',').map(Number) : null;
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const [fa, fb] = args.filter((x, i) => !x.startsWith('--') && !['--crop', '--out'].includes(args[i - 1]));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const b64 = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
const res = await page.evaluate(async ({ a, b, crop }) => {
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
  const [ia, ib] = [await load(a), await load(b)];
  const data = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
  const [da, db] = [data(ia), data(ib)];
  const pairs = {}; let n = 0; let box = [1e9, 1e9, -1, -1]; const bands = {};
  const w = ia.width; const h = Math.min(ia.height, ib.height);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) {
      n++; const k = `${da[i]},${da[i + 1]},${da[i + 2]} -> ${db[i]},${db[i + 1]},${db[i + 2]}`; pairs[k] = (pairs[k] || 0) + 1;
      box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
      const band = `${Math.floor(y / 40) * 40}`; bands[band] = (bands[band] || 0) + 1;
    }
  }
  let png = null;
  if (crop) {
    const [x, y, cw, ch] = crop; const c = document.createElement('canvas'); c.width = cw * 6 + 12; c.height = ch * 3; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#f0f'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(ia, x, y, cw, ch, 0, 0, cw * 3, ch * 3); g.drawImage(ib, x, y, cw, ch, cw * 3 + 12, 0, cw * 3, ch * 3);
    png = c.toDataURL('image/png');
  }
  return { size: [ia.width, ia.height, ib.width, ib.height], n, box, pairs: Object.entries(pairs).sort((p, q) => q[1] - p[1]).slice(0, 12), bands, png };
}, { a: b64(fa), b: b64(fb), crop });
await browser.close();
console.log(`sizes ${res.size.join(' ')}; ${res.n} pixels differ; box x ${res.box[0]}–${res.box[2]}, y ${res.box[1]}–${res.box[3]}`);
for (const [k, v] of res.pairs) console.log(`  ${v}× ${k}`);
console.log(`by 40 px band: ${Object.entries(res.bands).map(([k, v]) => `${k}:${v}`).join(' ')}`);
if (res.png && out) { writeFileSync(out, Buffer.from(res.png.split(',')[1], 'base64')); console.log(`saved ${out}`); }
