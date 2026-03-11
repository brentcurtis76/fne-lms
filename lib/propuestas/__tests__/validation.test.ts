import { describe, it, expect } from 'vitest';
import { validateProposalConfig } from '../validation';
import type { ValidationConfig } from '../validation';
import type { PropuestaFichaServicio } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeFicha(overrides: Partial<PropuestaFichaServicio> = {}): PropuestaFichaServicio {
  return {
    id: 'ficha-uuid',
    folio: 52244,
    nombre_servicio: 'Programa Evoluciona',
    dimension: 'Liderazgo',
    categoria: 'Asesoría',
    horas_presenciales: 148,
    horas_no_presenciales: 0,
    total_horas: 148,
    destinatarios: ['Docentes', 'Directores', 'Sostenedores'],
    objetivo_general: 'Fortalecer el liderazgo directivo',
    metodologia: null,
    equipo_trabajo: [
      { nombre: 'Ana García', formacion: 'PhD Educación', anos_experiencia: 15 },
      { nombre: 'Carlos López', formacion: 'Magíster', anos_experiencia: 10 },
      { nombre: 'María Torres', formacion: 'Magíster', anos_experiencia: 8 },
    ],
    fecha_inscripcion: '2020-01-01',
    activo: true,
    created_at: '2020-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ValidationConfig> = {}): ValidationConfig {
  return {
    nombre_servicio: 'Programa Evoluciona',
    horas_presenciales: 100,
    horas_sincronicas: 48,
    horas_asincronicas: 40,
    consultores: [
      { nombre: 'Ana García' },
      { nombre: 'Carlos López' },
    ],
    total_hours: 188,
    modules: [
      { horas_presenciales: 100, horas_sincronicas: 48, horas_asincronicas: 40 },
    ],
    ...overrides,
  };
}

// ── Rule 1: nombre_servicio exact match ────────────────────────────────────────

describe('Rule 1 — nombre_servicio', () => {
  it('passes when names match exactly', () => {
    const result = validateProposalConfig(makeConfig(), makeFicha());
    const rule1Errors = result.errors.filter(e => e.rule === 1);
    expect(rule1Errors).toHaveLength(0);
  });

  it('fails when names differ', () => {
    const config = makeConfig({ nombre_servicio: 'Programa DIFERENTE' });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.valid).toBe(false);
    const err = result.errors.find(e => e.rule === 1);
    expect(err).toBeDefined();
    expect(err?.field).toBe('nombre_servicio');
    expect(err?.expected).toBe('Programa Evoluciona');
    expect(err?.actual).toBe('Programa DIFERENTE');
  });
});

// ── Rule 2: presenciales + sincronicas <= ficha.horas_presenciales ─────────────

describe('Rule 2 — horas presenciales + sincrónicas', () => {
  it('passes when sum equals ficha hours exactly', () => {
    const config = makeConfig({ horas_presenciales: 100, horas_sincronicas: 48 });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.errors.filter(e => e.rule === 2)).toHaveLength(0);
  });

  it('passes when sum is below ficha hours', () => {
    const config = makeConfig({ horas_presenciales: 80, horas_sincronicas: 40 });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.errors.filter(e => e.rule === 2)).toHaveLength(0);
  });

  it('fails when sum exceeds ficha hours', () => {
    const config = makeConfig({ horas_presenciales: 130, horas_sincronicas: 30 }); // 160 > 148
    const result = validateProposalConfig(config, makeFicha());
    expect(result.valid).toBe(false);
    const err = result.errors.find(e => e.rule === 2);
    expect(err).toBeDefined();
    expect(err?.actual).toBe('160');
    expect(err?.expected).toBe('<= 148');
  });
});

// ── Rule 3: horas_asincronicas >= 0 ──────────────────────────────────────────

describe('Rule 3 — horas_asincronicas', () => {
  it('passes when asincronicas is zero', () => {
    const config = makeConfig({ horas_asincronicas: 0 });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.errors.filter(e => e.rule === 3)).toHaveLength(0);
  });

  it('passes when asincronicas is positive', () => {
    const config = makeConfig({ horas_asincronicas: 40 });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.errors.filter(e => e.rule === 3)).toHaveLength(0);
  });

  it('fails when asincronicas is negative', () => {
    const config = makeConfig({ horas_asincronicas: -5 });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.valid).toBe(false);
    const err = result.errors.find(e => e.rule === 3);
    expect(err).toBeDefined();
    expect(err?.actual).toBe('-5');
  });
});

// ── Rule 4: destinatarios subset ──────────────────────────────────────────────

describe('Rule 4 — destinatarios subset', () => {
  it('passes when destinatarios is a valid subset', () => {
    const config = makeConfig({ destinatarios: ['Docentes', 'Directores'] });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.errors.filter(e => e.rule === 4)).toHaveLength(0);
  });

  it('passes when destinatarios is not provided (skips rule)', () => {
    const config = makeConfig({ destinatarios: undefined });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.errors.filter(e => e.rule === 4)).toHaveLength(0);
  });

  it('fails when an invalid destinatario is included', () => {
    const config = makeConfig({ destinatarios: ['Docentes', 'Apoderados'] }); // Apoderados not in ficha
    const result = validateProposalConfig(config, makeFicha());
    expect(result.valid).toBe(false);
    const err = result.errors.find(e => e.rule === 4);
    expect(err).toBeDefined();
    expect(err?.message).toContain('Apoderados');
  });
});

// ── Rule 5: at least 2 consultores match ficha equipo_trabajo ─────────────────

describe('Rule 5 — consultores match', () => {
  it('passes with exactly 2 matching consultores', () => {
    const config = makeConfig({
      consultores: [{ nombre: 'Ana García' }, { nombre: 'Carlos López' }],
    });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.errors.filter(e => e.rule === 5)).toHaveLength(0);
  });

  it('passes with 3 matching consultores', () => {
    const config = makeConfig({
      consultores: [
        { nombre: 'Ana García' },
        { nombre: 'Carlos López' },
        { nombre: 'María Torres' },
      ],
    });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.errors.filter(e => e.rule === 5)).toHaveLength(0);
  });

  it('fails with 0 matching consultores', () => {
    const config = makeConfig({
      consultores: [{ nombre: 'Juan Pérez' }, { nombre: 'Pedro Soto' }],
    });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.valid).toBe(false);
    const err = result.errors.find(e => e.rule === 5);
    expect(err).toBeDefined();
    expect(err?.actual).toBe('0 coincidencia(s)');
  });

  it('fails with only 1 matching consultor', () => {
    const config = makeConfig({
      consultores: [{ nombre: 'Ana García' }, { nombre: 'Desconocido' }],
    });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.valid).toBe(false);
    const err = result.errors.find(e => e.rule === 5);
    expect(err?.actual).toBe('1 coincidencia(s)');
  });

  it('skips rule when ficha has no equipo_trabajo', () => {
    const config = makeConfig({ consultores: [{ nombre: 'Nadie' }] });
    const ficha = makeFicha({ equipo_trabajo: null });
    const result = validateProposalConfig(config, ficha);
    expect(result.errors.filter(e => e.rule === 5)).toHaveLength(0);
  });

  it('matching is case-insensitive', () => {
    const config = makeConfig({
      consultores: [{ nombre: 'ANA GARCÍA' }, { nombre: 'carlos lópez' }],
    });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.errors.filter(e => e.rule === 5)).toHaveLength(0);
  });
});

// ── Rule 7: SUM(modules[].hours) === total_hours ──────────────────────────────

describe('Rule 7 — module hours sum', () => {
  it('passes when sum matches total_hours', () => {
    const config = makeConfig({
      modules: [
        { horas_presenciales: 60, horas_sincronicas: 24, horas_asincronicas: 20 },
        { horas_presenciales: 40, horas_sincronicas: 24, horas_asincronicas: 20 },
      ],
      total_hours: 188,
    });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.errors.filter(e => e.rule === 7)).toHaveLength(0);
  });

  it('fails when sum does not match total_hours', () => {
    const config = makeConfig({
      modules: [
        { horas_presenciales: 10, horas_sincronicas: 5, horas_asincronicas: 5 },
      ],
      total_hours: 188,
    });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.valid).toBe(false);
    const err = result.errors.find(e => e.rule === 7);
    expect(err).toBeDefined();
    expect(err?.actual).toBe('20');
    expect(err?.expected).toBe('188');
  });

  it('skips rule when no modules provided', () => {
    const config = makeConfig({ modules: undefined });
    const result = validateProposalConfig(config, makeFicha());
    expect(result.errors.filter(e => e.rule === 7)).toHaveLength(0);
  });
});

// ── Expired certificates ───────────────────────────────────────────────────────

describe('Expired certificate blocking', () => {
  it('blocks generation when a certificate is expired', () => {
    const config = makeConfig();
    const expiredDoc = {
      id: 'doc-uuid',
      nombre: 'Certificado de Pertenencia',
      fecha_vencimiento: '2020-01-01', // clearly in the past
    };
    const result = validateProposalConfig(config, makeFicha(), [expiredDoc]);
    expect(result.valid).toBe(false);
    const err = result.errors.find(e => e.rule === 0 && e.field === 'documentos');
    expect(err).toBeDefined();
    expect(err?.message).toContain('Certificado de Pertenencia');
  });

  it('passes when all certificates are valid', () => {
    const config = makeConfig();
    const validDoc = {
      id: 'doc-uuid',
      nombre: 'Certificado de Pertenencia',
      fecha_vencimiento: '2099-12-31',
    };
    const result = validateProposalConfig(config, makeFicha(), [validDoc]);
    expect(result.errors.filter(e => e.field === 'documentos')).toHaveLength(0);
  });

  it('passes when documento has no fecha_vencimiento', () => {
    const config = makeConfig();
    const doc = { id: 'doc-uuid', nombre: 'Evaluaciones Clientes', fecha_vencimiento: null };
    const result = validateProposalConfig(config, makeFicha(), [doc]);
    expect(result.errors.filter(e => e.field === 'documentos')).toHaveLength(0);
  });

  it('cert expiring yesterday IS expired', () => {
    const config = makeConfig();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const doc = { id: 'doc-uuid', nombre: 'Cert Ayer', fecha_vencimiento: yesterdayStr };
    const result = validateProposalConfig(config, makeFicha(), [doc]);
    expect(result.errors.some(e => e.field === 'documentos')).toBe(true);
  });

  it('cert expiring today is NOT expired (inclusive last valid day)', () => {
    const config = makeConfig();
    const todayStr = new Date().toISOString().split('T')[0];
    const doc = { id: 'doc-uuid', nombre: 'Cert Hoy', fecha_vencimiento: todayStr };
    const result = validateProposalConfig(config, makeFicha(), [doc]);
    expect(result.errors.filter(e => e.field === 'documentos')).toHaveLength(0);
  });

  it('cert expiring tomorrow is NOT expired', () => {
    const config = makeConfig();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const doc = { id: 'doc-uuid', nombre: 'Cert Mañana', fecha_vencimiento: tomorrowStr };
    const result = validateProposalConfig(config, makeFicha(), [doc]);
    expect(result.errors.filter(e => e.field === 'documentos')).toHaveLength(0);
  });
});

// ── Multiple errors accumulated ───────────────────────────────────────────────

describe('Multiple errors accumulate correctly', () => {
  it('returns all rule violations in a single call', () => {
    const config = makeConfig({
      nombre_servicio: 'Nombre Incorrecto',               // Rule 1
      horas_presenciales: 200,                            // Rule 2 (200 > 148)
      horas_asincronicas: -10,                            // Rule 3
      consultores: [{ nombre: 'Desconocido' }],           // Rule 5
    });
    const expiredDoc = { id: 'd1', nombre: 'Cert', fecha_vencimiento: '2020-01-01' };
    const result = validateProposalConfig(config, makeFicha(), [expiredDoc]);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.rule === 1)).toBe(true);
    expect(result.errors.some(e => e.rule === 2)).toBe(true);
    expect(result.errors.some(e => e.rule === 3)).toBe(true);
    expect(result.errors.some(e => e.rule === 5)).toBe(true);
    expect(result.errors.some(e => e.field === 'documentos')).toBe(true);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });
});

// ── Valid config passes all rules ─────────────────────────────────────────────

describe('Full valid config', () => {
  it('returns valid=true with no errors', () => {
    const result = validateProposalConfig(makeConfig(), makeFicha());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
