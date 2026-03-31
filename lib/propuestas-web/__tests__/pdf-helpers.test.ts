import { describe, it, expect } from 'vitest';
import { isHeadingRedundant, splitBoldLead } from '../pdf-generator';

// ─── isHeadingRedundant ──────────────────────────────────────────────

describe('isHeadingRedundant', () => {
  it('exact match → suppressed', () => {
    expect(isHeadingRedundant('Generación Tractor', 'Generación Tractor')).toBe(true);
  });

  it('exact match ignoring accents and case → suppressed', () => {
    expect(isHeadingRedundant('Generación Tractor', 'generacion tractor')).toBe(true);
  });

  it('heading is substring of title → suppressed', () => {
    expect(isHeadingRedundant('Modelo de Consultoría Educativa', 'Consultoría Educativa')).toBe(true);
  });

  it('title is substring of heading → suppressed', () => {
    expect(isHeadingRedundant('Consultoría', 'Modelo de Consultoría Educativa')).toBe(true);
  });

  it('expanded acronym (MEC7 case) → NOT suppressed', () => {
    // overlap = 1 ("mec7") / max(2, 5) = 0.2 < 0.5
    expect(
      isHeadingRedundant(
        'Modelo MEC7',
        'Marco de Efectividad y Calidad Educativa — MEC7',
      ),
    ).toBe(false);
  });

  it('unrelated heading → NOT suppressed', () => {
    expect(isHeadingRedundant('Generación Tractor', 'Metodología de Evaluación')).toBe(false);
  });

  it('50% overlap boundary — at threshold → suppressed', () => {
    // title: "Alfa Beta" → words ["alfa","beta"] (2 significant)
    // heading: "Alfa Beta Gamma Delta" → words ["alfa","beta","gamma","delta"] (4 significant)
    // overlap = 2, max(2, 4) = 4, ratio = 0.5 → suppressed
    expect(isHeadingRedundant('Alfa Beta', 'Alfa Beta Gamma Delta')).toBe(true);
  });

  it('just below 50% threshold → NOT suppressed', () => {
    // title: "Alfa Beta" → words ["alfa","beta"] (2)
    // heading: "Alfa Gamma Delta Epsilon Zeta" → words ["alfa","gamma","delta","epsilon","zeta"] (5)
    // overlap = 1 ("alfa"), max(2, 5) = 5, ratio = 0.2 → not suppressed
    expect(isHeadingRedundant('Alfa Beta', 'Alfa Gamma Delta Epsilon Zeta')).toBe(false);
  });

  it('empty heading → NOT suppressed', () => {
    expect(isHeadingRedundant('Some Title', '')).toBe(false);
  });

  it('empty title → NOT suppressed', () => {
    expect(isHeadingRedundant('', 'Some Heading')).toBe(false);
  });
});

// ─── splitBoldLead ───────────────────────────────────────────────────

describe('splitBoldLead', () => {
  it('text with period split → bold + rest', () => {
    const text =
      'Nuestra metodología se basa en tres pilares. El primero es la formación continua de los docentes en servicio activo.';
    const result = splitBoldLead(text);
    expect(result).not.toBeNull();
    expect(result!.bold).toBe('Nuestra metodología se basa en tres pilares.');
    expect(result!.rest).toBe(
      'El primero es la formación continua de los docentes en servicio activo.',
    );
  });

  it('text with colon split → bold + rest', () => {
    const text =
      'Objetivo principal: Desarrollar competencias pedagógicas avanzadas en el equipo docente completo.';
    const result = splitBoldLead(text);
    expect(result).not.toBeNull();
    expect(result!.bold).toBe('Objetivo principal:');
    expect(result!.rest).toBe(
      'Desarrollar competencias pedagógicas avanzadas en el equipo docente completo.',
    );
  });

  it('text without clean split → null', () => {
    const result = splitBoldLead('Short text only');
    expect(result).toBeNull();
  });

  it('empty string → null', () => {
    const result = splitBoldLead('');
    expect(result).toBeNull();
  });

  it('remainder too short → null (fallback)', () => {
    // First sentence is fine, but remainder is < 30 chars
    const result = splitBoldLead('Long enough lead sentence here. Too short.');
    expect(result).toBeNull();
  });
});
