/**
 * Phase 2b — template render tests.
 * Verifies both EvolucionaTemplate and PreparacionTemplate produce valid PDFs.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { Document, renderToBuffer } from '@react-pdf/renderer';
import type { ProposalConfig } from '../generator';
import '../fonts';

// ── Shared sample config ──────────────────────────────────────────────────────

const consultants: ProposalConfig['consultants'] = [
  {
    nombre: 'Arnoldo Cisternas Chávez',
    titulo: 'Director del Programa',
    bio: 'Psicólogo organizacional y Doctor en Ciencias de la Gestión (ESADE).',
  },
  {
    nombre: 'María Gabriela Naranjo Armas',
    titulo: 'Directora de la FNE',
    bio: 'Psicóloga con formación en Psicoterapia Corporal.',
  },
  {
    nombre: 'Ignacio Andrés Pavez Barrio',
    titulo: 'Director de Investigación',
    bio: 'Ingeniero Civil con PhD en Comportamiento Organizacional.',
  },
];

const modules: ProposalConfig['modules'] = [
  { nombre: 'Módulo 1 — Diagnóstico', horas_presenciales: 16, horas_sincronicas: 8, horas_asincronicas: 8 },
  { nombre: 'Módulo 2 — Liderazgo', horas_presenciales: 16, horas_sincronicas: 8, horas_asincronicas: 4 },
  { nombre: 'Módulo 3 — Comunidades', horas_presenciales: 16, horas_sincronicas: 8, horas_asincronicas: 4 },
];

const contentBlocks: ProposalConfig['contentBlocks'] = [
  {
    key: 'educacion_relacional',
    titulo: 'Modelo de Educación Relacional',
    contenido: {
      sections: [
        { type: 'heading', text: 'Educación Relacional', level: 1 },
        { type: 'paragraph', text: 'La Educación Relacional sitúa las relaciones humanas en el centro del proceso educativo.' },
        { type: 'paragraph', text: 'Este enfoque transforma la cultura escolar mediante vínculos seguros y comunidades de aprendizaje.' },
      ],
    },
    imagenes: null,
  },
  {
    key: 'modelo_consultoria_fases',
    titulo: 'Modelo de Consultoría: Fases',
    contenido: {
      sections: [
        { type: 'heading', text: 'Nuestro Modelo de Consultoría', level: 1 },
        { type: 'paragraph', text: 'Las tres fases: INICIA, INSPIRA, EVOLUCIONA.' },
        { type: 'list', items: ['INICIA: diagnóstico y fundamentos', 'INSPIRA: desarrollo de capacidades', 'EVOLUCIONA: transformación sostenida'] },
      ],
    },
    imagenes: [
      { key: 'fases-diagram', path: 'propuestas/infographics/modelo-fases-diagram.png', alt: 'Diagrama de fases' },
    ],
  },
  {
    key: 'liderazgo_cambio',
    titulo: 'Liderazgo para el Cambio',
    contenido: {
      sections: [
        { type: 'heading', text: 'Liderazgo para el Cambio', level: 1 },
        { type: 'paragraph', text: 'Desarrollando capacidades de liderazgo transformacional.' },
      ],
    },
    imagenes: null,
  },
];

const baseConfig: ProposalConfig = {
  type: 'preparacion',
  schoolName: 'Colegio Test',
  programYear: 2026,
  serviceName: 'Programa de Prueba',
  consultants,
  modules,
  horasPresenciales: 48,
  horasSincronicas: 24,
  horasAsincronicas: 16,
  pricing: {
    mode: 'per_hour',
    precioUf: 1.2,
    totalHours: 88,
    formaPago: '2 cuotas',
  },
  contentBlocks,
  startMonth: 3,
  duration: 7,
};

// ── PreparacionTemplate ───────────────────────────────────────────────────────

describe('PreparacionTemplate', () => {
  it('renders a valid multi-page PDF', async () => {
    const { PreparacionTemplate } = await import('../templates/PreparacionTemplate');

    const doc = React.createElement(
      Document,
      { title: 'Test Preparación' },
      React.createElement(PreparacionTemplate, { config: baseConfig })
    );

    const buf = await renderToBuffer(doc);

    expect(buf.length).toBeGreaterThan(0);
    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-');
  }, 60000);
});

// ── EvolucionaTemplate ────────────────────────────────────────────────────────

describe('EvolucionaTemplate', () => {
  it('renders a valid multi-page PDF', async () => {
    const { EvolucionaTemplate } = await import('../templates/EvolucionaTemplate');

    const config: ProposalConfig = {
      ...baseConfig,
      type: 'evoluciona',
      horasPresenciales: 80,
      horasSincronicas: 44,
      horasAsincronicas: 24,
      pricing: {
        mode: 'per_hour',
        precioUf: 1.2,
        totalHours: 148,
        formaPago: '3 cuotas iguales',
      },
      duration: 10,
    };

    const doc = React.createElement(
      Document,
      { title: 'Test Evoluciona' },
      React.createElement(EvolucionaTemplate, { config })
    );

    const buf = await renderToBuffer(doc);

    expect(buf.length).toBeGreaterThan(0);
    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-');
  }, 60000);
});
