// Tiny generated files for module 50 (contracts, licitaciones, proposals): a one-page PDF, a solid-colour PNG and a
// minimal Word document. Content is invented; the files only exist so that the screens' document lists, previews and
// downloads point at something real in the local storage.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// PDF text must be Latin-1 and escape ( ) \ — accents are kept through WinAnsiEncoding.
const pdfText = (s) => s.replace(/[—–]/g, '-').replace(/[^\x00-\xff]/g, '?')
  .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

// One A4 page with a title and a few lines of text.
export function pdf(title, lines = []) {
  const ops = ['BT', '/F1 16 Tf', '56 780 Td', `(${pdfText(title)}) Tj`, '/F1 11 Tf'];
  for (const l of lines) ops.push('0 -20 Td', `(${pdfText(l)}) Tj`);
  ops.push('ET');
  const stream = Buffer.from(ops.join('\n'), 'latin1');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    null, // the content stream
  ];
  const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let len = parts[0].length;
  objs.forEach((o, i) => {
    offsets.push(len);
    const body = o === null
      ? Buffer.concat([Buffer.from(`${i + 1} 0 obj\n<< /Length ${stream.length} >>\nstream\n`, 'latin1'), stream, Buffer.from('\nendstream\nendobj\n', 'latin1')])
      : Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1');
    parts.push(body);
    len += body.length;
  });
  const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}

// A solid-colour PNG with a darker band, w × h pixels.
export function png(w = 320, h = 200, rgb = [251, 191, 36], band = [10, 10, 10]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    const c = y > h * 0.7 && y < h * 0.85 ? band : rgb;
    for (let x = 0; x < w; x++) raw.set(c, y * (w * 3 + 1) + 1 + x * 3);
  }
  const chunk = (type, data) => {
    const t = Buffer.from(type, 'latin1');
    const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([l, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// A zip archive with stored (uncompressed) entries and a fixed timestamp, so the bytes never change.
function zip(entries) {
  const locals = []; const centrals = []; let offset = 0;
  const DOS_TIME = 0x6000; const DOS_DATE = ((2026 - 1980) << 9) | (10 << 5) | 15; // 2026-10-15 12:00
  for (const [name, content] of entries) {
    const data = Buffer.from(content, 'utf8'); const fname = Buffer.from(name, 'utf8'); const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(fname.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(fname.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, fname, data); centrals.push(ch, fname);
    offset += lh.length + fname.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A minimal .docx with a heading line and paragraphs.
export function docx(title, paragraphs = []) {
  const p = (t, bold) => `<w:p><w:r>${bold ? '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>' : ''}<w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r></w:p>`;
  const body = [p(title, true), ...paragraphs.map((t) => p(t, false))].join('');
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`],
  ]);
}

export const MIME = {
  pdf: 'application/pdf',
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
