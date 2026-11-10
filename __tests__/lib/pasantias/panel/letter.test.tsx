// @vitest-environment node
/**
 * PASANTÍAS PANEL — the Carta de Invitación: the wording is FNE's template,
 * only four things vary, and the dates are each program's own.
 */
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  LETTER_SIGNER,
  letterDateRange,
  letterFileName,
  letterParagraphs,
  renderInvitationLetter,
} from '../../../../lib/pasantias/panel/letter';

const TEXT = {
  salutation: 'estimada' as const,
  fullName: 'Ana María Pérez',
  schoolLine: 'del Colegio Sintético de Valdivia, de la Región de Los Ríos, Chile',
  lodgingLine: 'la Residencia Sintética, ubicada en Calle Falsa 123, Barcelona.',
  program: 'inspira' as const,
};

/** A valid 2×2 white PNG, built here so no binary fixture lives in the repo. */
function tinyPng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.from([0, 255, 255, 255, 255, 255, 255]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat([row, row]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('letterDateRange', () => {
  it("uses each program's own dates, in 2027", () => {
    expect(letterDateRange('inspira')).toBe('entre el 18 y el 28 de enero de 2027');
    expect(letterDateRange('mirada-profunda')).toBe('entre el 18 y el 29 de enero de 2027');
  });
});

describe('letterParagraphs', () => {
  const letter = letterParagraphs(TEXT);

  it('greets with the chosen treatment and the full name', () => {
    expect(letter.greeting).toBe('Estimada Ana María Pérez');
    expect(letterParagraphs({ ...TEXT, salutation: 'estimado' }).greeting).toBe('Estimado Ana María Pérez');
  });

  it('keeps the template wording around the school line and the dates', () => {
    expect(letter.body).toHaveLength(4);
    expect(letter.body[0]).toBe(
      'Es un placer para mí extenderle, como parte del equipo del Colegio Sintético de Valdivia, de la Región de ' +
        'Los Ríos, Chile, una cordial invitación a participar en una pasantía educativa en escuelas de vanguardia ' +
        'en Barcelona, organizada por El Instituto Relacional de España. Dicha pasantía se llevará a cabo entre el ' +
        '18 y el 28 de enero de 2027.'
    );
  });

  it('writes the lodging sentence with exactly one final stop', () => {
    expect(letter.body[1]).toBe(
      'Usted se estará hospedando en la Residencia Sintética, ubicada en Calle Falsa 123, Barcelona.'
    );
  });

  it('never carries the template year or the template person', () => {
    const all = [letter.greeting, ...letter.body].join(' ');
    expect(all).not.toContain('2026');
    expect(all).not.toContain('Antonio');
    expect(all).not.toContain('Santa Marta');
    expect(letter.body[3]).toContain('desde el año 2015');
  });

  it('changes only the dates between programs', () => {
    const other = letterParagraphs({ ...TEXT, program: 'mirada-profunda' });
    expect(other.body[0]).toContain('entre el 18 y el 29 de enero de 2027.');
    expect(other.body.slice(1)).toEqual(letter.body.slice(1));
  });
});

describe('letterFileName', () => {
  it('names the file after the person and strips path characters', () => {
    expect(letterFileName('Ana María Pérez')).toBe('Carta Invitación - Ana María Pérez.pdf');
    expect(letterFileName('Ana/María: "Pérez"')).toBe('Carta Invitación - Ana María Pérez.pdf');
  });
});

describe('renderInvitationLetter', () => {
  it('renders a one-page PDF', async () => {
    const image = { data: tinyPng(), format: 'png' as const };
    const pdf = await renderInvitationLetter({ ...TEXT, logo: image, signature: image });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
    const text = pdf.toString('latin1');
    expect(text.match(/\/Type\s*\/Page\b/g) ?? []).toHaveLength(1);
    expect(LETTER_SIGNER.name).toBe('Arnoldo Cisternas');
  }, 30_000);
});
