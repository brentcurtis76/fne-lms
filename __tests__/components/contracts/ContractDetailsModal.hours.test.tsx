// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ContractDetailsModal from '../../../components/contracts/ContractDetailsModal';

/**
 * F10b send-back 2, item 2: the details window shows the contract's own
 * «horas contratadas» next to the programme's hours (relabelled «Horas del
 * programa»), and in the manual block for a contract without a programme.
 * Before the fix only the programme's «Horas Totales» was shown. Invented data.
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
    nombre_legal: 'Colegio Inventado SpA',
    nombre_fantasia: 'Colegio Inventado',
    rut: '76.000.000-0',
    direccion: 'Calle Uno 123',
    comuna: 'Comuna Inventada',
    ciudad: 'Ciudad Inventada',
    nombre_representante: 'Persona Inventada',
  },
  programas: {
    id: 'p1',
    nombre: 'Programa Inventado',
    descripcion: 'Descripción inventada',
    horas_totales: 120,
    modalidad: 'mixta',
    codigo_servicio: 'PI-1',
  },
  cuotas: [],
  ...overrides,
});

const renderModal = (overrides: Record<string, any> = {}) =>
  render(
    <ContractDetailsModal
      contrato={makeContrato(overrides) as any}
      isOpen
      onClose={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onToggleCashFlow={vi.fn()}
      onUploadContract={vi.fn()}
      onActivateWithoutDocument={vi.fn(async () => true)}
      onMarkSigned={vi.fn()}
      onGeneratePDF={vi.fn()}
      isAdmin
    />,
  );

describe('ContractDetailsModal — the contract’s own hours', () => {
  it('a programme contract with 100 hours shows both lines with their labels', () => {
    renderModal({ horas_contratadas: 100 });
    expect(screen.getByText('Horas del programa')).toBeInTheDocument();
    expect(screen.getByText('120 horas')).toBeInTheDocument();
    expect(screen.queryByText('Horas Totales')).toBeNull();
    const line = screen.getByTestId('contract-details-hours');
    expect(line).toHaveTextContent('Horas contratadas');
    expect(line).toHaveTextContent('100 horas');
  });

  it('a contract without hours shows no new line', () => {
    renderModal({ horas_contratadas: null });
    expect(screen.queryByTestId('contract-details-hours')).toBeNull();
    expect(screen.queryByText('Horas contratadas')).toBeNull();
    expect(screen.getByText('Horas del programa')).toBeInTheDocument();
  });

  it('a manual contract shows its hours in the block with its description', () => {
    renderModal({ es_manual: true, programas: null, programa_id: null, descripcion_manual: 'Asesoría inventada', horas_contratadas: 30 });
    const line = screen.getByTestId('contract-details-hours');
    expect(line).toHaveTextContent('Horas contratadas');
    expect(line).toHaveTextContent('30 horas');
    expect(screen.queryByText('Horas del programa')).toBeNull();
  });

  it('a manual contract without hours shows no new line', () => {
    renderModal({ es_manual: true, programas: null, programa_id: null, descripcion_manual: 'Asesoría inventada' });
    expect(screen.queryByTestId('contract-details-hours')).toBeNull();
  });
});
