/**
 * Shared test harness for ContractForm component tests (F10b).
 *
 * A fake Supabase client that answers the reads ContractForm makes and records
 * every write (insert / update / delete) with its table and payload, so a test
 * can assert exactly what the form would send — and count that nothing was
 * written at all. Only synthetic data is used.
 *
 * Not a test file itself (no `.test.` in the name): imported by the
 * ContractForm.*.test.tsx files next to it.
 */
import { fireEvent, screen } from '@testing-library/react';

type Row = Record<string, any>;

export interface FakeWrite {
  table: string;
  op: 'insert' | 'update' | 'delete';
  payload: any;
  filters: Row;
}

export interface FakeOptions {
  /** Row returned by `clientes … eq('rut', x).single()`; null = no client with that RUT. */
  clienteByRut?: Row | null;
  /** Error returned by an insert into clientes. */
  clienteInsertError?: { message: string; code?: string } | null;
  /** Row returned by the draft lookup `contratos … eq('estado','borrador').single()`. */
  existingDraft?: Row | null;
  /** Rows returned by `cuotas … select('id, numero_cuota') / select('id')`. */
  existingCuotas?: Row[];
  /** Rows returned by `contract_hour_allocations` reads. */
  allocations?: Row[];
  /** Error returned by `contract_hour_allocations` reads. */
  allocationsError?: { message: string } | null;
}

export function createFakeSupabase(options: FakeOptions = {}) {
  const writes: FakeWrite[] = [];
  const reads: Array<{ table: string; filters: Row }> = [];

  const makeChain = (table: string) => {
    const ctx: { op: 'select' | 'insert' | 'update' | 'delete'; payload?: any; filters: Row; single: boolean } = {
      op: 'select',
      filters: {},
      single: false,
    };
    let selectAfterWrite = false;

    const resolve = (): { data: any; error: any } => {
      if (ctx.op === 'insert') {
        if (table === 'clientes' && options.clienteInsertError) {
          writes.push({ table, op: 'insert', payload: ctx.payload, filters: { ...ctx.filters } });
          return { data: null, error: options.clienteInsertError };
        }
        writes.push({ table, op: 'insert', payload: ctx.payload, filters: { ...ctx.filters } });
        const first = Array.isArray(ctx.payload) ? ctx.payload[0] : ctx.payload;
        if (table === 'clientes') return { data: { id: 'cliente-nuevo', ...first }, error: null };
        if (table === 'contratos') return { data: { id: 'contrato-nuevo', ...first }, error: null };
        return { data: selectAfterWrite ? first : null, error: null };
      }
      if (ctx.op === 'update') {
        writes.push({ table, op: 'update', payload: ctx.payload, filters: { ...ctx.filters } });
        return { data: { id: ctx.filters.id ?? 'updated', ...ctx.payload }, error: null };
      }
      if (ctx.op === 'delete') {
        writes.push({ table, op: 'delete', payload: null, filters: { ...ctx.filters } });
        return { data: null, error: null };
      }
      reads.push({ table, filters: { ...ctx.filters } });
      if (table === 'schools') return { data: [], error: null };
      if (table === 'clientes' && 'rut' in ctx.filters) {
        const row = options.clienteByRut ?? null;
        return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      }
      if (table === 'contratos' && ctx.single) {
        if (ctx.filters.estado === 'borrador') {
          const row = options.existingDraft ?? null;
          return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
        }
        return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      }
      if (table === 'cuotas') return { data: options.existingCuotas ?? [], error: null };
      if (table === 'contract_hour_allocations') {
        if (options.allocationsError) return { data: null, error: options.allocationsError };
        return { data: options.allocations ?? [], error: null };
      }
      return { data: [], error: null };
    };

    const chain: any = {
      select: () => {
        if (ctx.op !== 'select') selectAfterWrite = true;
        return chain;
      },
      insert: (payload: any) => {
        ctx.op = 'insert';
        ctx.payload = payload;
        return chain;
      },
      update: (payload: any) => {
        ctx.op = 'update';
        ctx.payload = payload;
        return chain;
      },
      delete: () => {
        ctx.op = 'delete';
        return chain;
      },
      eq: (col: string, value: any) => {
        ctx.filters[col] = value;
        return chain;
      },
      in: (col: string, value: any) => {
        ctx.filters[col] = value;
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      single: () => {
        ctx.single = true;
        return chain;
      },
      maybeSingle: () => {
        ctx.single = true;
        return chain;
      },
      then: (onFulfilled: any, onRejected: any) => Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };
    return chain;
  };

  return {
    auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) },
    from: (table: string) => makeChain(table),
    __writes: writes,
    __reads: reads,
  };
}

/** The columns of public.clientes the form may write (baseline: clientes table). */
export const CLIENT_COLUMNS_SORTED = [
  'ciudad',
  'comuna',
  'comuna_notaria',
  'direccion',
  'email_contacto_administrativo',
  'email_encargado_proyecto',
  'fecha_escritura',
  'nombre_contacto_administrativo',
  'nombre_encargado_proyecto',
  'nombre_fantasia',
  'nombre_legal',
  'nombre_notario',
  'nombre_representante',
  'rut',
  'rut_representante',
  'school_id',
  'telefono_contacto_administrativo',
  'telefono_encargado_proyecto',
];

export const PROGRAMAS = [
  { id: 'prog-a', nombre: 'Programa Sintético A', descripcion: 'Desc A', horas_totales: 120, modalidad: 'mixta' },
  { id: 'prog-b', nombre: 'Programa Sintético B', descripcion: 'Desc B', horas_totales: 80, modalidad: 'online' },
];

export const typeInto = (el: Element, value: string) => {
  fireEvent.change(el, { target: { value } });
};

/** Step 1 for a brand-new (non-manual) client: fill the required fields with invented data. */
export function fillNewClientStep() {
  typeInto(screen.getByPlaceholderText('Nombre legal de la empresa'), 'Colegio Inventado SpA');
  typeInto(screen.getByPlaceholderText('Nombre comercial'), 'Colegio Inventado');
  // The first '12.345.678-9' input is the client's RUT; the second is the representative's.
  typeInto(screen.getAllByPlaceholderText('12.345.678-9')[0], '76.123.456-0');
  typeInto(screen.getByPlaceholderText('Calle y número'), 'Calle Falsa 123');
  typeInto(screen.getByPlaceholderText('Comuna'), 'Comuna Inventada');
  typeInto(screen.getByPlaceholderText('Ciudad'), 'Ciudad Inventada');
  typeInto(screen.getByPlaceholderText('Nombre del representante'), 'Persona Inventada');
}

export const clickButton = (name: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name }));
};

/** Step 2 (programme branch): end date, programme and total price. */
export function fillContractStep(container: HTMLElement, opts: { programaId?: string; total: number }) {
  const dates = container.querySelectorAll('input[type="date"]');
  // dates[0] = Fecha del Contrato (prefilled today), dates[1] = Fecha de Finalización
  typeInto(dates[1], '2099-12-31');
  if (opts.programaId) {
    typeInto(screen.getByDisplayValue('-- Seleccionar programa --'), opts.programaId);
  }
  typeInto(screen.getByPlaceholderText('0.00'), String(opts.total));
}

/** Step 3: give every cuota a date. */
export function fillCuotaDates(container: HTMLElement, date = '2099-06-30') {
  container.querySelectorAll('input[type="date"]').forEach((el) => typeInto(el, date));
}
