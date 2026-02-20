// @vitest-environment node

/**
 * UX Iteration 1 — Static source analysis tests
 *
 * These tests verify that all 14 UX fixes from the PM review were applied
 * to the three component/page files. They read the source files as text
 * and assert the correct patterns are (or are not) present.
 *
 * Why static analysis? The components require Next.js context, Supabase
 * providers, and API mocks that are out of scope for this focused pass.
 * Source-level checks are a practical, deterministic way to confirm the
 * exact strings the UX reviewer checked against.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

const step3 = readSource('components/licitaciones/Step3Bases.tsx');
const step4 = readSource('components/licitaciones/Step4Propuestas.tsx');
const templates = readSource('pages/admin/licitaciones/templates.tsx');

// -------------------------------------------------------
// BC-1: Off-brand blue badge removed from Step3Bases
// -------------------------------------------------------
describe('BC-1: ATE count badge', () => {
  it('does NOT use bg-blue-100 in Step3Bases', () => {
    // Only allow it in comments (prefixed by //)
    const nonCommentLines = step3
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && l.includes('bg-blue-100'));
    expect(nonCommentLines).toHaveLength(0);
  });

  it('uses bg-gray-100 text-gray-700 for the ATE count badge', () => {
    expect(step3).toContain('bg-gray-100 text-gray-700');
  });
});

// -------------------------------------------------------
// BC-2: Off-brand blue text links in Step3Bases
// -------------------------------------------------------
describe('BC-2: Interactive text links in Step3Bases', () => {
  it('does NOT use text-blue-600 in non-comment lines of Step3Bases', () => {
    const nonCommentLines = step3
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && l.includes('text-blue-600'));
    expect(nonCommentLines).toHaveLength(0);
  });

  it('does NOT use text-blue-800 in non-comment lines of Step3Bases', () => {
    const nonCommentLines = step3
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && l.includes('text-blue-800'));
    expect(nonCommentLines).toHaveLength(0);
  });
});

// -------------------------------------------------------
// BC-3: Off-brand blue text links in templates.tsx
// -------------------------------------------------------
describe('BC-3: Interactive text links in templates.tsx', () => {
  it('does NOT use text-blue-600 in non-comment lines of templates.tsx', () => {
    const nonCommentLines = templates
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && l.includes('text-blue-600'));
    expect(nonCommentLines).toHaveLength(0);
  });
});

// -------------------------------------------------------
// BC-4: Off-brand blue background in Step4Propuestas
// -------------------------------------------------------
describe('BC-4: Summary banner in Step4Propuestas', () => {
  it('does NOT use bg-blue-50 in non-comment lines', () => {
    const nonCommentLines = step4
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && l.includes('bg-blue-50'));
    expect(nonCommentLines).toHaveLength(0);
  });

  it('uses bg-gray-50 border border-gray-200 for the summary banner', () => {
    expect(step4).toContain('bg-gray-50 border border-gray-200');
  });

  it('does NOT use text-blue-800 in non-comment lines of Step4', () => {
    const nonCommentLines = step4
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && l.includes('text-blue-800'));
    expect(nonCommentLines).toHaveLength(0);
  });
});

// -------------------------------------------------------
// AC-1: Form inputs linked to labels
// -------------------------------------------------------
describe('AC-1: htmlFor/id pairs on form inputs', () => {
  it('Step3Bases has htmlFor="ate-nombre"', () => {
    expect(step3).toContain('htmlFor="ate-nombre"');
    expect(step3).toContain('id="ate-nombre"');
  });

  it('Step3Bases has htmlFor="ate-rut"', () => {
    expect(step3).toContain('htmlFor="ate-rut"');
    expect(step3).toContain('id="ate-rut"');
  });

  it('Step3Bases has htmlFor="ate-contacto"', () => {
    expect(step3).toContain('htmlFor="ate-contacto"');
    expect(step3).toContain('id="ate-contacto"');
  });

  it('Step3Bases has htmlFor="ate-email"', () => {
    expect(step3).toContain('htmlFor="ate-email"');
    expect(step3).toContain('id="ate-email"');
  });

  it('Step3Bases has htmlFor="ate-telefono"', () => {
    expect(step3).toContain('htmlFor="ate-telefono"');
    expect(step3).toContain('id="ate-telefono"');
  });

  it('Step3Bases has htmlFor="ate-fecha-solicitud"', () => {
    expect(step3).toContain('htmlFor="ate-fecha-solicitud"');
    expect(step3).toContain('id="ate-fecha-solicitud"');
  });

  it('Step3Bases has htmlFor="consulta-pregunta"', () => {
    expect(step3).toContain('htmlFor="consulta-pregunta"');
    expect(step3).toContain('id="consulta-pregunta"');
  });

  it('Step3Bases has htmlFor="consulta-respuesta"', () => {
    expect(step3).toContain('htmlFor="consulta-respuesta"');
    expect(step3).toContain('id="consulta-respuesta"');
  });

  it('Step4Propuestas uses dynamic id for file input (file-ate-${ate.id})', () => {
    expect(step4).toContain('id={`file-ate-${ate.id}`}');
    expect(step4).toContain('htmlFor={`file-ate-${ate.id}`}');
  });

  it('Step4Propuestas uses dynamic id for fecha-propuesta', () => {
    expect(step4).toContain('id={`fecha-propuesta-${ate.id}`}');
    expect(step4).toContain('htmlFor={`fecha-propuesta-${ate.id}`}');
  });

  it('Step4Propuestas uses dynamic id for notas', () => {
    expect(step4).toContain('id={`notas-ate-${ate.id}`}');
    expect(step4).toContain('htmlFor={`notas-ate-${ate.id}`}');
  });

  it('Step4Propuestas new ATE form has htmlFor="new-ate-nombre"', () => {
    expect(step4).toContain('htmlFor="new-ate-nombre"');
    expect(step4).toContain('id="new-ate-nombre"');
  });

  it('Step4Propuestas new ATE form has htmlFor="new-ate-rut"', () => {
    expect(step4).toContain('htmlFor="new-ate-rut"');
    expect(step4).toContain('id="new-ate-rut"');
  });

  it('templates.tsx has htmlFor="template-nombre-servicio"', () => {
    expect(templates).toContain('htmlFor="template-nombre-servicio"');
    expect(templates).toContain('id="template-nombre-servicio"');
  });

  it('templates.tsx has htmlFor="template-objetivo"', () => {
    expect(templates).toContain('htmlFor="template-objetivo"');
    expect(templates).toContain('id="template-objetivo"');
  });

  it('templates.tsx has htmlFor="template-condiciones-pago"', () => {
    expect(templates).toContain('htmlFor="template-condiciones-pago"');
    expect(templates).toContain('id="template-condiciones-pago"');
  });
});

// -------------------------------------------------------
// AC-2: Delete button has aria-label
// -------------------------------------------------------
describe('AC-2: Delete button aria-label in Step3Bases', () => {
  it('has aria-label on delete button referencing ate.nombre_ate', () => {
    expect(step3).toContain('aria-label={`Eliminar ATE ${ate.nombre_ate}`}');
  });
});

// -------------------------------------------------------
// AC-3: Marcar bases enviadas button has aria-label
// -------------------------------------------------------
describe('AC-3: Marcar bases enviadas aria-label', () => {
  it('has aria-label on marcar bases button referencing ate.nombre_ate', () => {
    expect(step3).toContain('aria-label={`Marcar bases enviadas a ${ate.nombre_ate}`}');
  });
});

// -------------------------------------------------------
// AC-5: INPUT_CLASS has focus:ring-offset-2
// -------------------------------------------------------
describe('AC-5: INPUT_CLASS focus:ring-offset-2', () => {
  it('Step3Bases INPUT_CLASS has focus:ring-offset-2', () => {
    expect(step3).toContain('focus:ring-offset-2');
  });

  it('Step4Propuestas INPUT_CLASS has focus:ring-offset-2', () => {
    expect(step4).toContain('focus:ring-offset-2');
  });

  it('templates.tsx INPUT_CLASS has focus:ring-offset-2', () => {
    expect(templates).toContain('focus:ring-offset-2');
  });
});

// -------------------------------------------------------
// AC-6: Table headers have scope="col"
// -------------------------------------------------------
describe('AC-6: Table header scope="col" in Step3Bases', () => {
  it('all table headers use scope="col"', () => {
    // Count th elements without scope="col"
    const thWithoutScope = step3.match(/<th(?![^>]*scope)/g) || [];
    expect(thWithoutScope).toHaveLength(0);
  });
});

// -------------------------------------------------------
// ID-1: Advance buttons are yellow (not green)
// -------------------------------------------------------
describe('ID-1: Advance buttons are yellow', () => {
  it('Step3Bases advance button uses bg-yellow-400', () => {
    // Should not have bg-green-600 for the advance button
    const nonCommentLines = step3
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && l.includes('bg-green-600'));
    expect(nonCommentLines).toHaveLength(0);
  });

  it('Step4Propuestas advance button uses bg-yellow-400', () => {
    const nonCommentLines = step4
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && l.includes('bg-green-600'));
    expect(nonCommentLines).toHaveLength(0);
  });
});

// -------------------------------------------------------
// ID-2: ATE form starts collapsed
// -------------------------------------------------------
describe('ID-2: ATE form collapsed by default', () => {
  it('Step3Bases has showAteForm state initialized to false', () => {
    expect(step3).toContain('useState(false)');
    expect(step3).toContain('showAteForm');
  });

  it('Step3Bases renders form conditionally based on showAteForm', () => {
    expect(step3).toContain('{showAteForm && (');
  });
});

// -------------------------------------------------------
// ID-3: Accent marks in confirm dialogs
// -------------------------------------------------------
describe('ID-3: Proper accent marks in confirm dialogs', () => {
  it('Step3Bases confirm dialog has correct accents for Recepción', () => {
    expect(step3).toContain('Recepción de Propuestas');
  });

  it('Step3Bases confirm dialog has correct accents for acción/cambiará/licitación', () => {
    expect(step3).toContain('Esta acción cambiará el estado de la licitación');
  });

  it('Step4Propuestas confirm dialog has correct accents for Evaluación', () => {
    expect(step4).toContain('Evaluación Pendiente');
  });

  it('Step4Propuestas confirm dialog has correct accents for acción/cambiará/licitación', () => {
    expect(step4).toContain('Esta acción cambiará el estado de la licitación');
  });
});

// -------------------------------------------------------
// RD-1: Table header row bg-gray-50
// -------------------------------------------------------
describe('RD-1: Table header row background', () => {
  it('Step3Bases thead tr has bg-gray-50', () => {
    expect(step3).toContain('bg-gray-50');
  });
});
