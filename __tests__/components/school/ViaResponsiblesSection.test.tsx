// @vitest-environment jsdom
/**
 * ViaResponsiblesSection (20261008120000): rows per school-level vía, assign /
 * re-send / replace through the API, refusal messages shown with the started
 * registros, read-only viewers see no actions.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ViaResponsiblesSection from '../../../components/school/ViaResponsiblesSection';

const ANA = { id: 'u-ana', name: 'Ana Pérez', email: 'ana@test.local' };
const LUIS = { id: 'u-luis', name: 'Luis Soto', email: null };

const lid = (overrides: Record<string, unknown> = {}) => ({
  area: 'liderazgo', label: 'Liderazgo', templates: [{ id: 't1', name: 'LID Equipo' }],
  responsible: null, pendingTemplates: [], ...overrides,
});
const pro = (overrides: Record<string, unknown> = {}) => ({
  area: 'proposito', label: 'Propósito', templates: [], responsible: null, pendingTemplates: [], ...overrides,
});

let getBody: any;
let postResponse: { status: number; body: any };
let posts: any[];

beforeEach(() => {
  posts = [];
  getBody = { vias: [lid(), pro()], candidates: [ANA, LUIS], canWrite: true };
  postResponse = { status: 200, body: { mode: 'assigned', details: [{ templateName: 'LID Equipo', outcome: 'created' }] } };
  global.fetch = vi.fn((url: any, init?: any) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(init.body));
      return Promise.resolve({ ok: postResponse.status < 300, json: () => Promise.resolve(postResponse.body) } as Response);
    }
    expect(String(url)).toContain('school_id=42');
    return Promise.resolve({ ok: true, json: () => Promise.resolve(getBody) } as Response);
  }) as any;
});

describe('ViaResponsiblesSection', () => {
  it('lists each school-level vía and assigns a picked directivo', async () => {
    render(<ViaResponsiblesSection schoolId={42} />);
    expect(await screen.findByTestId('via-row-liderazgo')).toHaveTextContent('Sin responsable asignado');
    expect(screen.getByTestId('via-row-proposito')).toHaveTextContent('Aún no hay templates publicados');

    fireEvent.click(screen.getByTestId('via-assign-liderazgo'));
    fireEvent.change(screen.getByTestId('via-modal-select'), { target: { value: ANA.id } });
    getBody = { ...getBody, vias: [lid({ responsible: { ...ANA, assignedAt: '2026-10-08' } }), pro()] };
    fireEvent.click(screen.getByTestId('via-modal-confirm'));

    await waitFor(() => expect(screen.getByTestId('via-responsibles-notice')).toHaveTextContent('LID Equipo: creado'));
    expect(posts).toEqual([{ school_id: 42, area: 'liderazgo', user_id: ANA.id, mode: 'assign' }]);
    expect(screen.getByTestId('via-row-liderazgo')).toHaveTextContent('Ana Pérez');
  });

  it('re-sends to the current responsible and shows pending delivery', async () => {
    getBody.vias = [lid({ responsible: { ...ANA, assignedAt: '2026-10-08' }, pendingTemplates: [{ id: 't2', name: 'LID Base' }] }), pro()];
    render(<ViaResponsiblesSection schoolId={42} />);
    expect(await screen.findByTestId('via-pending-liderazgo')).toHaveTextContent('1 pendiente de entregar');
    postResponse = { status: 200, body: { mode: 'resent', details: [{ templateName: 'LID Base', outcome: 'created' }] } };
    fireEvent.click(screen.getByTestId('via-resend-liderazgo'));
    await waitFor(() => expect(posts).toEqual([{ school_id: 42, area: 'liderazgo', user_id: ANA.id, mode: 'assign' }]));
  });

  it('a refused replace keeps the modal open and names the started registros', async () => {
    getBody.vias = [lid({ responsible: { ...ANA, assignedAt: '2026-10-08' } }), pro()];
    render(<ViaResponsiblesSection schoolId={42} />);
    fireEvent.click(await screen.findByTestId('via-replace-liderazgo'));
    // the current responsible is not offered as replacement
    expect(screen.getByTestId('via-modal-select')).not.toHaveTextContent('Ana Pérez');
    fireEvent.change(screen.getByTestId('via-modal-select'), { target: { value: LUIS.id } });
    postResponse = { status: 409, body: { code: 'registros_already_started', error: 'No se puede reemplazar', templates: ['LID Equipo'] } };
    fireEvent.click(screen.getByTestId('via-modal-confirm'));
    expect(await screen.findByTestId('via-modal-error')).toHaveTextContent('No se puede reemplazar (LID Equipo)');
    expect(posts[0]).toMatchObject({ mode: 'replace', user_id: LUIS.id });
  });

  it('read-only viewers see the rows without actions', async () => {
    getBody = { vias: [lid({ responsible: { ...ANA, assignedAt: '2026-10-08' } })], candidates: [], canWrite: false };
    render(<ViaResponsiblesSection schoolId={42} />);
    expect(await screen.findByTestId('via-row-liderazgo')).toHaveTextContent('Ana Pérez');
    expect(screen.queryByTestId('via-replace-liderazgo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('via-resend-liderazgo')).not.toBeInTheDocument();
  });

  it('renders nothing when no vía is school-level', async () => {
    getBody = { vias: [], candidates: [], canWrite: true };
    const { container } = render(<ViaResponsiblesSection schoolId={42} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
