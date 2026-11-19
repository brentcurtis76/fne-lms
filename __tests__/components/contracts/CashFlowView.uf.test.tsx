// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// CashFlowView uses the automatic JSX runtime and doesn't import React, but
// vitest's esbuild transform here is classic — provide the global it expects.
(globalThis as any).React = React;

// N89-screen: «Flujo de caja» never computes with a UF it does not have yet,
// never shows «∞» or «NaN», and says where the UF value comes from when it is
// not today's. Same harness as CashFlowView.invoice-link / invoice-upload; the
// service's real formatCurrency is kept so «∞» would show as on the screen.
// All ids, names and amounts are invented. No outside host is contacted.

const { svc } = vi.hoisted(() => ({
  svc: { getCurrentUF: vi.fn(), getProjectedUF: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({ storage: { from: vi.fn() }, from: vi.fn() }),
}));
vi.mock('../../../lib/uf-service', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getFixedUF: vi.fn(actual.getFixedUF),
    projectUF: vi.fn(actual.projectUF),
    default: {
      getCurrentUF: svc.getCurrentUF,
      getProjectedUF: svc.getProjectedUF,
      formatCurrency: actual.default.formatCurrency.bind(actual.default),
    },
  };
});

import CashFlowView from '../../../components/contracts/CashFlowView';
import * as ufModule from '../../../lib/uf-service';

const LIVE_SENTENCE = 'Actualizado automáticamente';
const NOT_TODAY_PREFIX = 'No se pudo obtener la UF de hoy.';

function nextMonthDay(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
}

// One UF contract (100 UF, one unpaid instalment of 50 UF next month) and one
// CLP contract (4.000.000, one unpaid instalment of 4.000.000 next month): the
// CLP one is what turned into «UF ∞» when divided by a UF of 0.
const contratos = () => [
  {
    id: 'c1',
    numero_contrato: 'C-001',
    fecha_contrato: '2026-01-15',
    cliente_id: 'cl1',
    programa_id: 'p1',
    precio_total_uf: 100,
    tipo_moneda: 'UF' as const,
    incluir_en_flujo: true,
    clientes: { nombre_legal: 'Colegio Inventado SpA', nombre_fantasia: 'Colegio Inventado', rut: '76.000.000-0' },
    programas: { nombre: 'Programa Inventado' },
    cuotas: [
      { id: 'q1', contrato_id: 'c1', numero_cuota: 1, fecha_vencimiento: nextMonthDay(), monto_uf: 50, pagada: false, created_at: '2026-01-15T00:00:00Z' },
    ],
  },
  {
    id: 'c2',
    numero_contrato: 'C-002',
    fecha_contrato: '2026-01-15',
    cliente_id: 'cl2',
    programa_id: 'p1',
    precio_total_uf: 4000000,
    tipo_moneda: 'CLP' as const,
    incluir_en_flujo: true,
    clientes: { nombre_legal: 'Escuela Ficticia Ltda', nombre_fantasia: 'Escuela Ficticia', rut: '77.000.000-0' },
    programas: { nombre: 'Programa Inventado' },
    cuotas: [
      { id: 'q2', contrato_id: 'c2', numero_cuota: 1, fecha_vencimiento: nextMonthDay(), monto_uf: 4000000, pagada: false, created_at: '2026-01-15T00:00:00Z' },
    ],
  },
];

const TOTAL_LABELS = ['Total de Contratos', 'Total Pagado', 'Total Pendiente', 'Pagado (período)', 'Pendiente (período)'];
const valueUnder = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
const valueUnderProjected = () => screen.getByText(/^Proyectado \(/).nextElementSibling?.textContent;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  svc.getProjectedUF.mockImplementation(async (fecha: string) => ({ fecha, valor: 40000, source: 'live' }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CashFlowView — the UF value', () => {
  it('(1) while the value is pending: every total shows «—», and the page holds no «∞» and no «NaN»', async () => {
    svc.getCurrentUF.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<CashFlowView contratos={contratos() as any} />);
    await waitFor(() => expect(svc.getCurrentUF).toHaveBeenCalled());
    for (const label of TOTAL_LABELS) expect(valueUnder(label)).toBe('—');
    expect(valueUnderProjected()).toBe('—');
    expect(container.textContent).not.toMatch(/∞|NaN|Infinity/);
    expect(screen.queryByText(LIVE_SENTENCE)).toBeNull();
  });

  it('(2) source live → the value and «Actualizado automáticamente», as today', async () => {
    svc.getCurrentUF.mockResolvedValue({ fecha: '2026-11-18', valor: 40000, source: 'live' });
    render(<CashFlowView contratos={contratos() as any} />);
    expect(await screen.findByText(LIVE_SENTENCE)).toBeInTheDocument();
    expect(screen.getByText('$40.000')).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(NOT_TODAY_PREFIX))).toBeNull();
  });

  it('(3) source last-known → the value and the sentence with its own date, in place of «Actualizado automáticamente»', async () => {
    svc.getCurrentUF.mockResolvedValue({ fecha: '2026-11-17', valor: 39990, source: 'last-known' });
    render(<CashFlowView contratos={contratos() as any} />);
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('No se pudo obtener la UF de hoy. Se usa el valor del 17-11-2026.');
    expect(screen.getByText('$39.990')).toBeInTheDocument();
    expect(screen.queryByText(LIVE_SENTENCE)).toBeNull();
  });

  it('(4) source fixed → the reference-value sentence with the fixed value\'s date', async () => {
    svc.getCurrentUF.mockResolvedValue({ fecha: '2025-05-29', valor: 39184, source: 'fixed' });
    render(<CashFlowView contratos={contratos() as any} />);
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('No se pudo obtener la UF de hoy. Se usa un valor de referencia del 29-05-2025.');
    expect(screen.getByText('$39.184')).toBeInTheDocument();
    expect(screen.queryByText(LIVE_SENTENCE)).toBeNull();
  });

  it('(5) getCurrentUF rejects → the screen uses the service\'s exported fixed value, shown as such', async () => {
    svc.getCurrentUF.mockRejectedValue(new Error('unexpected'));
    render(<CashFlowView contratos={contratos() as any} />);
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('No se pudo obtener la UF de hoy. Se usa un valor de referencia del 29-05-2025.');
    expect((ufModule as any).getFixedUF).toHaveBeenCalled();
    expect(screen.getByText('$39.184')).toBeInTheDocument();
  });

  it.each([
    ['live', '2026-11-18'],
    ['last-known', '2026-11-17'],
    ['fixed', '2025-05-29'],
  ])('(6) source %s → the projection rows and the totals are computed with the value', async (source, fecha) => {
    svc.getCurrentUF.mockResolvedValue({ fecha, valor: 40000, source });
    const { container } = render(<CashFlowView contratos={contratos() as any} />);
    await screen.findByText('$40.000');
    // All contracts: 100 UF + 4.000.000 CLP (= 100 UF at 40.000) → 200 UF, 8.000.000 CLP.
    await waitFor(() => expect(valueUnder('Total de Contratos')).toBe('UF 200,00 ($8.000.000)'));
    // Pending (from the instalments): 50 UF (2.000.000) + 4.000.000 CLP (100 UF) → 150 UF, 6.000.000 CLP.
    expect(valueUnder('Total Pendiente')).toBe('UF 150,00 ($6.000.000)');
    expect(valueUnder('Total Pagado')).toBe('UF 0,00 ($0)');
    // Period (send-back 1: projected from the load's value with projectUF, one
    // month ahead: round(40.000 × 1,0021) = 40.084): 50 UF (2.004.200) +
    // 4.000.000 CLP (100 UF) → 150 UF, 6.004.200 CLP.
    expect(valueUnderProjected()).toBe('UF 150,00 ($6.004.200)');
    expect(valueUnder('Pendiente (período)')).toBe('UF 150,00 ($6.004.200)');
    // The monthly projection has a row with both instalments.
    expect(screen.getByText('2 cuotas programadas')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/∞|NaN|Infinity/);
  });

  it('the period selector, the currency display and the payment filter still work with a known value', async () => {
    svc.getCurrentUF.mockResolvedValue({ fecha: '2026-11-18', valor: 40000, source: 'live' });
    const user = userEvent.setup();
    render(<CashFlowView contratos={contratos() as any} />);
    await waitFor(() => expect(valueUnder('Total de Contratos')).toBe('UF 200,00 ($8.000.000)'));
    await user.click(screen.getByText('UF', { exact: true, selector: 'button' }));
    expect(valueUnder('Total de Contratos')).toBe('UF 200,00');
    await user.click(screen.getByText('CLP', { exact: true, selector: 'button' }));
    expect(valueUnder('Total de Contratos')).toBe('$8.000.000');
    await user.click(screen.getByText('12 Meses'));
    await waitFor(() => expect(svc.getCurrentUF).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/^Proyectado \(12 meses\)/)).toBeInTheDocument();
    expect(valueUnderProjected()).toBe('$6.004.200'); // send-back 1: projected with projectUF (see (6))
    await user.click(screen.getByText('Vista Detallada'));
    expect(await screen.findByText('C-002')).toBeInTheDocument();
    // Both instalments fall next month: «Vencidas sin pagar» hides them, «Todas» brings them back.
    await user.click(screen.getByText('Vencidas sin pagar'));
    await waitFor(() => expect(screen.queryByText('C-002')).toBeNull());
    await user.click(screen.getByText('Todas'));
    expect(await screen.findByText('C-002')).toBeInTheDocument();
  });

  // ---- send-back 1 ----

  function monthsAgoDay(n: number): string {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - n, 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10`;
  }
  function inMonthsDay(n: number): string {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + n, 15);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
  }

  // An overdue CLP instalment (4.000.000) and an overdue UF instalment (50 UF, no stored CLP amount).
  const overdueContratos = () => {
    const [uf, clp] = contratos();
    uf.cuotas = [{ ...uf.cuotas[0], id: 'q9', numero_cuota: 9, fecha_vencimiento: monthsAgoDay(1) }];
    clp.cuotas = [{ ...clp.cuotas[0], id: 'q8', numero_cuota: 8, fecha_vencimiento: monthsAgoDay(1) }];
    return [uf, clp];
  };
  const overdueAmount = (contrato: string, cuota: number) =>
    screen.getByText(`Contrato ${contrato} - Cuota ${cuota}`).parentElement!.parentElement!
      .querySelector('p.font-medium.text-red-600')!.textContent;

  it('(7) while loading, the overdue list shows «—» for the part that needs the UF, in each of the three displays, never «UF ∞»', async () => {
    svc.getCurrentUF.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    const { container } = render(<CashFlowView contratos={overdueContratos() as any} />);
    await waitFor(() => expect(svc.getCurrentUF).toHaveBeenCalled());
    // «Ambos» (the default): pesos shown, the UF part «—»; a UF amount shown, its pesos «—».
    expect(overdueAmount('C-002', 8)).toBe('— ($4.000.000)');
    expect(overdueAmount('C-001', 9)).toBe('UF 50,00 (—)');
    expect(container.textContent).not.toMatch(/∞|NaN|Infinity/);
    await user.click(screen.getByText('UF', { exact: true, selector: 'button' }));
    expect(overdueAmount('C-002', 8)).toBe('—');
    expect(overdueAmount('C-001', 9)).toBe('UF 50,00');
    await user.click(screen.getByText('CLP', { exact: true, selector: 'button' }));
    expect(overdueAmount('C-002', 8)).toBe('$4.000.000');
    expect(overdueAmount('C-001', 9)).toBe('—');
    expect(container.textContent).not.toMatch(/∞|NaN|Infinity/);
  });

  it('(8) a slow six-month load that finishes after a quick three-month load writes nothing: the three-month rows stay', async () => {
    let finishSlow: (v: unknown) => void = () => {};
    svc.getCurrentUF
      .mockImplementationOnce(() => new Promise((resolve) => { finishSlow = resolve; }))
      .mockResolvedValue({ fecha: '2026-11-18', valor: 40000, source: 'live' });
    const user = userEvent.setup();
    render(<CashFlowView contratos={contratos() as any} />);
    await waitFor(() => expect(svc.getCurrentUF).toHaveBeenCalledTimes(1));
    await user.click(screen.getByText('3 Meses'));
    await waitFor(() => expect(screen.getAllByText(/cuotas programadas$/)).toHaveLength(3));
    await act(async () => { finishSlow({ fecha: '2026-11-18', valor: 39000, source: 'live' }); });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getAllByText(/cuotas programadas$/)).toHaveLength(3);
    expect(screen.getByText(/^Proyectado \(3 meses\)/)).toBeInTheDocument();
    // and the value shown is the newer load's
    expect(screen.getByText('$40.000')).toBeInTheDocument();
    expect(screen.queryByText('$39.000')).toBeNull();
  });

  it('(8b) unmounting during a load: the load stops, computes nothing, writes nothing, and React warns of nothing', async () => {
    let finish: (v: unknown) => void = () => {};
    svc.getCurrentUF.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { unmount } = render(<CashFlowView contratos={contratos() as any} />);
    await waitFor(() => expect(svc.getCurrentUF).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => { finish({ fecha: '2026-11-18', valor: 40000, source: 'live' }); });
    await new Promise((r) => setTimeout(r, 0));
    expect(svc.getProjectedUF).not.toHaveBeenCalled();
    expect((ufModule as any).projectUF).not.toHaveBeenCalled();
    const reactWarnings = (console.error as any).mock.calls.filter((c: unknown[]) =>
      String(c[0]).match(/unmounted|not wrapped in act|Warning:/));
    expect(reactWarnings).toEqual([]);
  });

  it('(9) one load asks getCurrentUF exactly once, whatever the number of UF instalments, and never getProjectedUF', async () => {
    // A fake getProjectedUF that asks getCurrentUF, as the real one does.
    svc.getProjectedUF.mockImplementation(async (fecha: string) => {
      const current = await svc.getCurrentUF();
      return { fecha, valor: current.valor, source: current.source };
    });
    svc.getCurrentUF.mockResolvedValue({ fecha: '2026-11-18', valor: 40000, source: 'live' });
    const [uf, clp] = contratos();
    uf.cuotas = [1, 2, 3].map((n) => ({ ...uf.cuotas[0], id: `q${n}`, numero_cuota: n, fecha_vencimiento: inMonthsDay(n) }));
    render(<CashFlowView contratos={[uf, clp] as any} />);
    expect(await screen.findByText('Actualizado automáticamente')).toBeInTheDocument();
    await waitFor(() => expect(valueUnder('Total de Contratos')).toBe('UF 200,00 ($8.000.000)'));
    expect(svc.getCurrentUF).toHaveBeenCalledTimes(1);
    expect(svc.getProjectedUF).not.toHaveBeenCalled();
  });

  it('(9b) a page whose value is fixed shows projections computed from the fixed value', async () => {
    svc.getCurrentUF.mockResolvedValue({ fecha: '2025-05-29', valor: 39184, source: 'fixed' });
    const user = userEvent.setup();
    render(<CashFlowView contratos={contratos() as any} />);
    await screen.findByRole('status');
    await user.click(screen.getByText('CLP', { exact: true, selector: 'button' }));
    // The UF instalment (50 UF, next month) projected from 39.184, one month
    // ahead, by the old formula: round(39.184 × 1,0021) = 39.266 → 1.963.300;
    // plus the CLP instalment of 4.000.000.
    expect(Math.round(39184 * Math.pow(1 + 0.0021, 1))).toBe(39266);
    await waitFor(() => expect(valueUnderProjected()).toBe('$5.963.300'));
  });
});
