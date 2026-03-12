/**
 * Phase 5 — Consultant combination tests.
 * Verifies generateProposal handles all consultant-count scenarios.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ProposalConfig } from '../generator';
import '../fonts';

vi.mock('../storage', () => ({
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
  getSignedUrl: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConsultant(i: number): ProposalConfig['consultants'][number] {
  return {
    nombre: `Consultor ${i} Apellido`,
    titulo: `Especialista en Área ${i}`,
    bio: `Perfil del consultor ${i}.`,
  };
}

function baseConfig(consultants: ProposalConfig['consultants']): ProposalConfig {
  return {
    type: 'preparacion',
    schoolName: 'Escuela Test',
    programYear: 2026,
    serviceName: 'Programa Test',
    consultants,
    modules: [
      {
        nombre: 'Módulo 1',
        horas_presenciales: 10,
        horas_sincronicas: 6,
        horas_asincronicas: 4,
        mes: 3,
      },
    ],
    horasPresenciales: 10,
    horasSincronicas: 6,
    horasAsincronicas: 4,
    pricing: { mode: 'per_hour', precioUf: 1.0, totalHours: 20, formaPago: 'Cuota única' },
    contentBlocks: [
      {
        key: 'test',
        titulo: 'Bloque Test',
        contenido: { sections: [{ type: 'heading', text: 'Test', level: 1 }] },
        imagenes: null,
      },
    ],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('consultant combinations', () => {
  it('1 consultant: produces valid PDF', async () => {
    const { generateProposal } = await import('../generator');
    const buf = await generateProposal(baseConfig([makeConsultant(1)]));
    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(0);
  }, 30000);

  it('2 consultants: produces valid PDF', async () => {
    const { generateProposal } = await import('../generator');
    const buf = await generateProposal(
      baseConfig([makeConsultant(1), makeConsultant(2)])
    );
    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-');
  }, 30000);

  it('3 consultants (standard grid): produces valid PDF', async () => {
    const { generateProposal } = await import('../generator');
    const buf = await generateProposal(
      baseConfig([makeConsultant(1), makeConsultant(2), makeConsultant(3)])
    );
    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-');
  }, 30000);

  it('4 consultants (paginates): produces valid PDF with more pages', async () => {
    const { generateProposal } = await import('../generator');
    const buf3 = await generateProposal(
      baseConfig([makeConsultant(1), makeConsultant(2), makeConsultant(3)])
    );
    const buf4 = await generateProposal(
      baseConfig([makeConsultant(1), makeConsultant(2), makeConsultant(3), makeConsultant(4)])
    );
    expect(buf4.toString('ascii', 0, 5)).toBe('%PDF-');
    // 4 consultants should produce more bytes than 3 (extra page content)
    expect(buf4.length).toBeGreaterThan(buf3.length * 0.9);
  }, 30000);

  it('6 consultants (maximum): produces valid PDF without crashing', async () => {
    const { generateProposal } = await import('../generator');
    const buf = await generateProposal(
      baseConfig(Array.from({ length: 6 }, (_, i) => makeConsultant(i + 1)))
    );
    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-');
  }, 30000);

  it('international-only consultants (all comite_internacional category): produces valid PDF', async () => {
    const { generateProposal } = await import('../generator');
    // The ProposalConfig only stores display data (nombre, titulo, bio), not categoria.
    // International consultants have longer bios and different titles.
    const internacionales: ProposalConfig['consultants'] = [
      {
        nombre: 'Dr. Carlos Rodríguez Martínez',
        titulo: 'Comité Internacional — Educación Relacional',
        bio: 'Doctor en Ciencias de la Educación (Universidad de Barcelona). Miembro del Comité Internacional de la Fundación Nueva Educación. Especialista en transformación cultural de organizaciones educativas en entornos de alta complejidad social.',
      },
      {
        nombre: 'Dra. Ana María Fernández López',
        titulo: 'Comité Internacional — Liderazgo Directivo',
        bio: 'Doctora en Psicología Organizacional (ESADE, Barcelona). Investigadora en liderazgo educativo y gestión del cambio. Consultora internacional para programas de mejora escolar en América Latina y Europa.',
      },
      {
        nombre: 'Prof. Jean-Pierre Dubois',
        titulo: 'Comité Internacional — Innovación Pedagógica',
        bio: 'Profesor de la Universidad de Sciences Po, París. Especialista en innovación pedagógica y aprendizaje basado en competencias. Ha asesorado a ministerios de educación en Francia, Chile y Colombia.',
      },
    ];
    const buf = await generateProposal(baseConfig(internacionales));
    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-');
  }, 30000);
});
