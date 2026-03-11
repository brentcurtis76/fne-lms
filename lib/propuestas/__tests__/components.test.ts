/**
 * Phase 2b — component render tests.
 * Each test verifies that the component produces a valid PDF buffer.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { Document, renderToBuffer } from '@react-pdf/renderer';
import '../fonts';

// ── helpers ──────────────────────────────────────────────────────────────────

async function renderDoc(...elements: React.ReactNode[]): Promise<Buffer> {
  const doc = React.createElement(Document, {}, ...elements);
  return renderToBuffer(doc as React.ReactElement);
}

function assertValidPdf(buf: Buffer) {
  expect(buf.length).toBeGreaterThan(0);
  expect(buf.toString('ascii', 0, 5)).toBe('%PDF-');
}

// ── CoverPage ────────────────────────────────────────────────────────────────

describe('CoverPage', () => {
  it('renders a valid PDF', async () => {
    const { CoverPage } = await import('../components/CoverPage');
    const buf = await renderDoc(
      React.createElement(CoverPage, {
        programYear: 2026,
        serviceName: 'Programa Test',
        schoolName: 'Escuela Test',
      })
    );
    assertValidPdf(buf);
  }, 30000);
});

// ── DarkSection ──────────────────────────────────────────────────────────────

describe('DarkSection', () => {
  it('renders a valid PDF', async () => {
    const { DarkSection, DarkBody } = await import('../components/DarkSection');
    const buf = await renderDoc(
      React.createElement(
        DarkSection,
        { heading: 'Test Heading', showLogo: true },
        React.createElement(DarkBody, null, 'Test body text.')
      )
    );
    assertValidPdf(buf);
  }, 30000);
});

// ── LightSection ─────────────────────────────────────────────────────────────

describe('LightSection', () => {
  it('renders a valid PDF', async () => {
    const { LightSection, LightBody } = await import('../components/LightSection');
    const buf = await renderDoc(
      React.createElement(
        LightSection,
        { heading: 'Test Heading', showLogo: true },
        React.createElement(LightBody, null, 'Test body text.')
      )
    );
    assertValidPdf(buf);
  }, 30000);
});

// ── ContentBlock ─────────────────────────────────────────────────────────────

describe('ContentBlock', () => {
  it('renders dark block (even index)', async () => {
    const { ContentBlock } = await import('../components/ContentBlock');
    const block = {
      key: 'test',
      titulo: 'Test Block',
      contenido: {
        sections: [
          { type: 'heading' as const, text: 'Test Heading', level: 1 },
          { type: 'paragraph' as const, text: 'Test paragraph text.' },
          { type: 'list' as const, items: ['Item 1', 'Item 2'] },
        ],
      },
      imagenes: null,
    };
    const buf = await renderDoc(
      React.createElement(ContentBlock, { block, index: 0 })
    );
    assertValidPdf(buf);
  }, 30000);

  it('renders light block (odd index)', async () => {
    const { ContentBlock } = await import('../components/ContentBlock');
    const block = {
      key: 'test-light',
      titulo: 'Test Block Light',
      contenido: {
        sections: [
          { type: 'heading' as const, text: 'Test Heading', level: 1 },
          { type: 'paragraph' as const, text: 'Test paragraph.' },
        ],
      },
      imagenes: null,
    };
    const buf = await renderDoc(
      React.createElement(ContentBlock, { block, index: 1 })
    );
    assertValidPdf(buf);
  }, 30000);

  it('renders image placeholder when image file does not exist', async () => {
    const { ContentBlock } = await import('../components/ContentBlock');
    const block = {
      key: 'test-img',
      titulo: 'Block With Image',
      contenido: {
        sections: [
          { type: 'heading' as const, text: 'Heading', level: 1 },
          { type: 'image' as const, path: 'propuestas/infographics/nonexistent.png' },
        ],
      },
      imagenes: [
        { key: 'img1', path: 'propuestas/infographics/also-missing.png', alt: 'Missing image' },
      ],
    };
    const buf = await renderDoc(
      React.createElement(ContentBlock, { block, index: 0 })
    );
    assertValidPdf(buf);
  }, 30000);
});

// ── ModuleTable ──────────────────────────────────────────────────────────────

describe('ModuleTable', () => {
  it('renders a valid PDF', async () => {
    const { ModuleTable } = await import('../components/ModuleTable');
    const buf = await renderDoc(
      React.createElement(ModuleTable, {
        modules: [
          { nombre: 'Módulo 1', horas_presenciales: 16, horas_sincronicas: 8, horas_asincronicas: 8 },
          { nombre: 'Módulo 2', horas_presenciales: 16, horas_sincronicas: 8, horas_asincronicas: 4 },
        ],
        totals: { horas_presenciales: 32, horas_sincronicas: 16, horas_asincronicas: 12, total: 60 },
      })
    );
    assertValidPdf(buf);
  }, 30000);
});

// ── PricingTable ─────────────────────────────────────────────────────────────

describe('PricingTable', () => {
  it('renders per_hour mode', async () => {
    const { PricingTable } = await import('../components/PricingTable');
    const buf = await renderDoc(
      React.createElement(PricingTable, {
        mode: 'per_hour',
        precioUf: 1.2,
        totalHours: 148,
        formaPago: '3 cuotas iguales',
      })
    );
    assertValidPdf(buf);
  }, 30000);

  it('renders fixed mode', async () => {
    const { PricingTable } = await import('../components/PricingTable');
    const buf = await renderDoc(
      React.createElement(PricingTable, {
        mode: 'fixed',
        precioUf: 1.2,
        totalHours: 148,
        formaPago: '2 cuotas',
        fixedUf: 200,
      })
    );
    assertValidPdf(buf);
  }, 30000);
});

// ── TimelineBar ──────────────────────────────────────────────────────────────

describe('TimelineBar', () => {
  it('renders a valid PDF', async () => {
    const { TimelineBar } = await import('../components/TimelineBar');
    const buf = await renderDoc(
      React.createElement(TimelineBar, {
        modules: [
          { nombre: 'Módulo 1' },
          { nombre: 'Módulo 2', mes: 4 },
          { nombre: 'Módulo 3', mes: 6 },
        ],
        startMonth: 3,
        duration: 8,
      })
    );
    assertValidPdf(buf);
  }, 30000);
});

// ── TableOfContents ──────────────────────────────────────────────────────────

describe('TableOfContents', () => {
  it('renders a valid PDF', async () => {
    const { TableOfContents } = await import('../components/TableOfContents');
    const buf = await renderDoc(
      React.createElement(TableOfContents, {
        sections: ['Sección 1', 'Sección 2', 'Equipo Consultor', 'Propuesta Económica'],
        year: 2026,
      })
    );
    assertValidPdf(buf);
  }, 30000);
});

// ── BrandElements ─────────────────────────────────────────────────────────────

describe('BrandElements', () => {
  it('renders a page with PageNumber, FooterBar, and LogoHeader', async () => {
    const { Page, View } = await import('@react-pdf/renderer');
    const { PageNumber, FooterBar, LogoHeader } = await import('../components/BrandElements');
    const buf = await renderDoc(
      React.createElement(
        Page,
        { size: 'A4' },
        React.createElement(View, { style: { flex: 1 } }),
        React.createElement(PageNumber, { number: 1, year: 2026 }),
        React.createElement(FooterBar, { showTagline: true }),
        React.createElement(LogoHeader, { position: 'right', variant: 'dark' })
      )
    );
    assertValidPdf(buf);
  }, 30000);
});

// ── Layout ────────────────────────────────────────────────────────────────────

describe('Layout', () => {
  it('renders SingleColumn, TwoColumn, ThreeColumn without throwing', async () => {
    const { Page, Text } = await import('@react-pdf/renderer');
    const { SingleColumn, TwoColumn, ThreeColumn } = await import('../components/Layout');

    const buf = await renderDoc(
      React.createElement(
        Page,
        { size: 'A4' },
        React.createElement(
          SingleColumn,
          null,
          React.createElement(Text, null, 'Single')
        ),
        React.createElement(
          TwoColumn,
          {
            left: React.createElement(Text, null, 'Left'),
            right: React.createElement(Text, null, 'Right'),
          }
        ),
        React.createElement(
          ThreeColumn,
          null,
          React.createElement(Text, null, 'A'),
          React.createElement(Text, null, 'B'),
          React.createElement(Text, null, 'C')
        )
      )
    );
    assertValidPdf(buf);
  }, 30000);
});
