// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ContractDetailsModal from '../../../components/contracts/ContractDetailsModal';

/**
 * Behavioral coverage for the activate-without-signed-document flow inside
 * the contract details modal (feat/ctr-activate, review R1):
 * - borrador contracts must not offer the no-document activation action;
 * - the confirmation dialog closes only when activation succeeds;
 * - Escape dismisses the topmost layer only; Tab is trapped in the dialog;
 * - an imported active contract (contrato_url set, firmado=false) offers
 *   "Marcar como firmado" and the late-upload input;
 * - a signed active contract shows no upload section at all.
 */

const makeContrato = (overrides: Record<string, any> = {}) => ({
  id: 'c1',
  numero_contrato: 'C-001',
  fecha_contrato: '2026-01-15',
  fecha_fin: '2026-12-15',
  cliente_id: 'cl1',
  programa_id: 'p1',
  precio_total_uf: 100,
  tipo_moneda: 'UF' as const,
  firmado: false,
  estado: 'pendiente' as const,
  incluir_en_flujo: false,
  contrato_url: undefined,
  es_manual: false,
  clientes: {
    id: 'cl1',
    nombre_legal: 'Colegio Test SpA',
    nombre_fantasia: 'Colegio Test',
    rut: '76.000.000-0',
    direccion: 'Calle Uno 123',
    comuna: 'Providencia',
    ciudad: 'Santiago',
    nombre_representante: 'Rep Test',
  },
  programas: {
    id: 'p1',
    nombre: 'Programa Test',
    descripcion: 'Descripción test',
    horas_totales: 100,
    modalidad: 'mixta',
    codigo_servicio: 'PT-1',
  },
  cuotas: [],
  ...overrides,
});

const renderModal = (contratoOverrides: Record<string, any> = {}, propOverrides: Record<string, any> = {}) => {
  const props = {
    contrato: makeContrato(contratoOverrides) as any,
    isOpen: true,
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleCashFlow: vi.fn(),
    onUploadContract: vi.fn(),
    onActivateWithoutDocument: vi.fn(async () => true),
    onMarkSigned: vi.fn(),
    onGeneratePDF: vi.fn(),
    isAdmin: true,
    ...propOverrides,
  };
  render(<ContractDetailsModal {...props} />);
  return props;
};

describe('ContractDetailsModal — activation without signed document', () => {
  it('offers the activation action for a pendiente contract', () => {
    renderModal({ estado: 'pendiente' });
    expect(screen.getByTestId('activate-without-doc-btn')).toBeInTheDocument();
  });

  it('hides the activation action for a borrador and shows guidance instead', () => {
    renderModal({ estado: 'borrador' });
    expect(screen.queryByTestId('activate-without-doc-btn')).not.toBeInTheDocument();
    expect(screen.getByText(/Este contrato es un borrador/)).toBeInTheDocument();
    // The upload path itself stays available for drafts.
    expect(screen.getByTestId('signed-doc-upload-input')).toBeInTheDocument();
  });

  it('closes the confirmation dialog when activation succeeds', async () => {
    const user = userEvent.setup();
    const props = renderModal({ estado: 'pendiente' }, { onActivateWithoutDocument: vi.fn(async () => true) });

    await user.click(screen.getByTestId('activate-without-doc-btn'));
    await user.click(screen.getByTestId('confirm-activate-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('confirm-activate-btn')).not.toBeInTheDocument();
    });
    expect(props.onActivateWithoutDocument).toHaveBeenCalledTimes(1);
  });

  it('keeps the confirmation dialog open when activation fails', async () => {
    const user = userEvent.setup();
    const props = renderModal({ estado: 'pendiente' }, { onActivateWithoutDocument: vi.fn(async () => false) });

    await user.click(screen.getByTestId('activate-without-doc-btn'));
    await user.click(screen.getByTestId('confirm-activate-btn'));

    await waitFor(() => {
      expect(props.onActivateWithoutDocument).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('confirm-activate-btn')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-activate-btn')).not.toBeDisabled();
  });

  it('Escape dismisses only the confirmation dialog, then the modal itself', async () => {
    const user = userEvent.setup();
    const props = renderModal({ estado: 'pendiente' });

    await user.click(screen.getByTestId('activate-without-doc-btn'));
    expect(screen.getByTestId('confirm-activate-btn')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-activate-btn')).not.toBeInTheDocument();
    });
    expect(props.onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab focus inside the confirmation dialog', async () => {
    const user = userEvent.setup();
    renderModal({ estado: 'pendiente' });

    await user.click(screen.getByTestId('activate-without-doc-btn'));

    const cancelBtn = screen.getByTestId('cancel-activate-btn');
    const confirmBtn = screen.getByTestId('confirm-activate-btn');

    // Initial focus lands inside the dialog.
    await waitFor(() => expect(cancelBtn).toHaveFocus());

    await user.tab();
    expect(confirmBtn).toHaveFocus();

    await user.tab();
    expect(cancelBtn).toHaveFocus();

    await user.tab({ shift: true });
    expect(confirmBtn).toHaveFocus();
  });

  it('lets an imported active contract with an unconfirmed signature be marked as signed', async () => {
    const user = userEvent.setup();
    const props = renderModal({
      estado: 'activo',
      firmado: false,
      contrato_url: 'https://storage.test/imported.pdf',
    });

    // Late upload stays available and the on-file document can be confirmed.
    expect(screen.getByTestId('late-upload-input')).toBeInTheDocument();
    const markBtn = screen.getByTestId('mark-signed-btn');
    await user.click(markBtn);

    expect(props.onMarkSigned).toHaveBeenCalledTimes(1);
    expect((props.onMarkSigned as any).mock.calls[0][0].id).toBe('c1');
  });

  it('shows no upload section once the signature is confirmed', () => {
    renderModal({ estado: 'activo', firmado: true, contrato_url: 'https://storage.test/signed.pdf' });
    expect(screen.queryByText('Subir Contrato Firmado')).not.toBeInTheDocument();
    expect(screen.queryByTestId('late-upload-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mark-signed-btn')).not.toBeInTheDocument();
  });
});
