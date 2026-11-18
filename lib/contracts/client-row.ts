/**
 * The row ContractForm writes into public.clientes (GES-2.1).
 *
 * The form's client state is spread into inserts and updates; any key that is
 * not a column of clientes (such as the old `telefono`) makes PostgREST refuse
 * the whole write. This helper names the columns explicitly — taken from the
 * clientes table in supabase/migrations/00000000000000_baseline.sql, minus id and
 * created_at, which the form never writes — and copies only those.
 *
 * Values are copied unchanged (a column missing from the form object becomes '').
 * Defaults and placeholders for a new client are the caller's business.
 */

export const CLIENT_FORM_COLUMNS = [
  'nombre_legal',
  'nombre_fantasia',
  'rut',
  'direccion',
  'comuna',
  'ciudad',
  'nombre_representante',
  'rut_representante',
  'fecha_escritura',
  'nombre_notario',
  'comuna_notaria',
  'nombre_encargado_proyecto',
  'telefono_encargado_proyecto',
  'email_encargado_proyecto',
  'nombre_contacto_administrativo',
  'telefono_contacto_administrativo',
  'email_contacto_administrativo',
] as const;

/** Every column of clientes the form may write: the form's client fields plus school_id. */
export const CLIENT_ROW_COLUMNS = [...CLIENT_FORM_COLUMNS, 'school_id'] as const;

export type ClientFormColumn = (typeof CLIENT_FORM_COLUMNS)[number];

export type ClientRow = Record<ClientFormColumn, string | null> & { school_id: number | null };

export function buildClientRow(
  form: Partial<Record<ClientFormColumn, string | null>>,
  schoolId: number | '' | null | undefined,
): ClientRow {
  const row = {} as ClientRow;
  for (const column of CLIENT_FORM_COLUMNS) {
    row[column] = form[column] ?? '';
  }
  row.school_id = schoolId || null;
  return row;
}
