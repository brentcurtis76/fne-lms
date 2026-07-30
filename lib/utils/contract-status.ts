/**
 * Shared contract-status predicates for the contracts page and detail modal.
 *
 * "Firma pendiente" means the contract is operating (estado 'activo') but the
 * signed document has not been confirmed received. It is derived from the
 * `firmado` flag, NOT from `contrato_url`: imported/manual contracts carry
 * their source PDF in `contrato_url` from creation, before any signature is
 * confirmed, so the URL's presence says nothing about signature status.
 */
export interface ContractStatusFields {
  estado?: string | null;
  firmado?: boolean | null;
}

export const isFirmaPendiente = (contrato: ContractStatusFields): boolean =>
  contrato.estado === 'activo' && !contrato.firmado;
