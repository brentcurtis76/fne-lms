/**
 * Null-safe search predicate for the /contracts list search box.
 *
 * The contracts query joins `clientes(*)` and `programas(*)` as LEFT joins, and
 * manual contracts have `programa_id = null`, so `contrato.programas` (and, in
 * principle, any joined row) can be null at runtime even though the page's
 * generated types declare them as non-null. Dereferencing those fields without
 * a guard threw `TypeError: Cannot read properties of null (reading 'nombre')`
 * on the first manual contract, which blanked the whole table.
 *
 * Optional chaining short-circuits the entire call chain when an operand is
 * nullish, so a missing join/field yields `undefined` instead of throwing.
 */
export interface ContractSearchFields {
  numero_contrato?: string | null;
  descripcion_manual?: string | null;
  clientes?: { nombre_legal?: string | null; nombre_fantasia?: string | null } | null;
  programas?: { nombre?: string | null } | null;
}

export function contractMatchesSearch(
  contrato: ContractSearchFields,
  searchQuery: string,
): boolean {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return true;

  return Boolean(
    contrato.numero_contrato?.toLowerCase().includes(query) ||
      contrato.clientes?.nombre_legal?.toLowerCase().includes(query) ||
      contrato.clientes?.nombre_fantasia?.toLowerCase().includes(query) ||
      contrato.programas?.nombre?.toLowerCase().includes(query) ||
      contrato.descripcion_manual?.toLowerCase().includes(query),
  );
}
