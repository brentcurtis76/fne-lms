// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as any).React = React;

import {
  createFakeSupabase,
  PROGRAMAS,
  fillNewClientStep,
  fillContractStep,
  fillCuotaDates,
  clickButton,
} from './contract-form-harness';

let currentClient: any;
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => currentClient }));
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

// The preview window is replaced by a recorder of the HTML it would show.
const previews: string[] = [];
vi.mock('@/lib/contract-document', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    openDocumentPreview: () => ({}) as Window,
    renderDocumentPreview: async (_preview: Window, html: string) => {
      previews.push(html);
    },
  };
});

import ContractForm from '../../../components/contracts/ContractForm';

/**
 * F22a (T3): «Vista previa / PDF» shows the text the contract will print. A new
 * contract is made on the corrected text (the database gives it version 2); a
 * contract edited while still on the old text (plantilla_version empty) previews
 * the old text. All data here is invented.
 */
const OLD_TEXT = 'educación cristiana';
const NEW_TEXT = 'es una institución educacional.';

const client = {
  id: 'cliente-1',
  nombre_legal: 'Colegio Inventado SpA',
  nombre_fantasia: 'Colegio Inventado',
  rut: '76.123.456-0',
  direccion: 'Calle Falsa 123',
  comuna: 'Comuna Inventada',
  ciudad: 'Ciudad Inventada',
  nombre_representante: 'Persona Inventada',
  rut_representante: '11.222.333-4',
  fecha_escritura: '2020-01-02',
  nombre_notario: 'Notaría Inventada',
  comuna_notaria: '',
  nombre_encargado_proyecto: '',
  telefono_encargado_proyecto: '',
  email_encargado_proyecto: '',
  nombre_contacto_administrativo: 'Contacto Inventado',
  telefono_contacto_administrativo: '',
  email_contacto_administrativo: 'contacto@ejemplo.test',
  school_id: null,
  created_at: '2026-01-01T00:00:00Z',
};

const editing = (overrides: Record<string, any> = {}) => ({
  id: 'contrato-1',
  numero_contrato: 'FNE-2026-11-123',
  fecha_contrato: '2026-01-15',
  fecha_fin: '2026-12-15',
  cliente_id: 'cliente-1',
  programa_id: 'prog-a',
  precio_total_uf: 100,
  tipo_moneda: 'UF',
  es_manual: false,
  descripcion_manual: null,
  contrato_url: null,
  estado: 'pendiente',
  horas_contratadas: null,
  plantilla_version: null,
  clientes: client,
  programas: PROGRAMAS[0],
  cuotas: [{ id: 'cuota-1', numero_cuota: 1, fecha_vencimiento: '2026-06-30', monto_uf: 100 }],
  ...overrides,
});

const openPreview = async () => {
  clickButton(/Vista previa \/ PDF/);
  await waitFor(() => expect(previews).toHaveLength(1));
  return previews[0];
};

describe('ContractForm — the preview prints the contract\'s own text', () => {
  beforeEach(() => {
    previews.length = 0;
  });

  it('a new contract previews the corrected text', async () => {
    currentClient = createFakeSupabase();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fillNewClientStep();
    clickButton('Siguiente');
    fillContractStep(container, { programaId: 'prog-a', total: 100 });
    clickButton('Siguiente');
    clickButton(/Agregar Cuota/);
    clickButton('Calcular Automático');
    fillCuotaDates(container);
    const html = await openPreview();
    expect(html).toContain(NEW_TEXT);
    expect(html).not.toContain(OLD_TEXT);
  });

  // «Guardar Borrador» of a new form reuses the draft with the same number (estado 'borrador')
  // and keeps its mark, so the preview must show the text that draft prints (send-back 1, R2).
  const newFormPreview = async (existingDraft: Record<string, any> | null) => {
    currentClient = createFakeSupabase({ existingDraft });
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fillNewClientStep();
    clickButton('Siguiente');
    fillContractStep(container, { programaId: 'prog-a', total: 100 });
    clickButton('Siguiente');
    clickButton(/Agregar Cuota/);
    clickButton('Calcular Automático');
    fillCuotaDates(container);
    const html = await openPreview();
    return { html, reads: currentClient.__reads as Array<{ table: string; filters: Record<string, any> }> };
  };

  it('a new form whose number matches an old-text draft previews the old text', async () => {
    const { html, reads } = await newFormPreview({ id: 'draft-1', numero_contrato: 'X', estado: 'borrador', plantilla_version: null });
    expect(html).toContain(OLD_TEXT);
    expect(html).not.toContain(NEW_TEXT);
    expect(reads.some((r) => r.table === 'contratos' && r.filters.estado === 'borrador' && 'numero_contrato' in r.filters)).toBe(true);
  });

  it('a new form whose number matches a draft on version 2 previews the corrected text', async () => {
    const { html } = await newFormPreview({ id: 'draft-2', numero_contrato: 'X', estado: 'borrador', plantilla_version: 2 });
    expect(html).toContain(NEW_TEXT);
    expect(html).not.toContain(OLD_TEXT);
  });

  it('a new form with no such draft previews the corrected text', async () => {
    const { html } = await newFormPreview(null);
    expect(html).toContain(NEW_TEXT);
    expect(html).not.toContain(OLD_TEXT);
  });

  it('editing a contract still on the old text previews the old text', async () => {
    currentClient = createFakeSupabase();
    render(<ContractForm programas={PROGRAMAS} clientes={[client]} editingContract={editing()} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    clickButton('Siguiente');
    clickButton('Siguiente');
    const html = await openPreview();
    expect(html).toContain(OLD_TEXT);
    expect(html).not.toContain(NEW_TEXT);
  });

  it('editing a contract on version 2 previews the corrected text', async () => {
    currentClient = createFakeSupabase();
    render(<ContractForm programas={PROGRAMAS} clientes={[client]} editingContract={editing({ plantilla_version: 2 })} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    clickButton('Siguiente');
    clickButton('Siguiente');
    const html = await openPreview();
    expect(html).toContain(NEW_TEXT);
    expect(screen.queryByText(OLD_TEXT)).toBeNull();
  });
});
