/**
 * Decide what the /contracts "PDF" button should do for a given contract row.
 *
 * Background: "manual" contracts are external PDFs brought in by the AI importer
 * (programa_id = null, es_manual = true). Their real document is the uploaded
 * original (contrato_url), not the FNE template. But annexes are different:
 *  - The annex print page is null-safe and renders from a template, and
 *  - an annex of a MANUAL parent inherits programa_id = null (AnnexForm), yet it
 *    is NOT an imported document and must still open its annex template.
 * So annexes always resolve to the template, regardless of programa_id.
 */
export interface ContractPdfTargetInput {
  is_anexo?: boolean;
  es_manual?: boolean;
  programa_id?: string | null;
  contrato_url?: string | null;
}

export type ContractPdfTarget =
  | { kind: 'original'; url: string } // open the uploaded original document
  | { kind: 'template' } // render /contract-print/[id]
  | { kind: 'missing' }; // imported contract with no original on file yet

export function resolveContractPdfTarget(contrato: ContractPdfTargetInput): ContractPdfTarget {
  // Only top-level contracts get the imported-document treatment. Annexes (even
  // those whose manual parent left programa_id null) always render the template.
  if (!contrato.is_anexo) {
    if (contrato.contrato_url) return { kind: 'original', url: contrato.contrato_url };
    if (contrato.es_manual || !contrato.programa_id) return { kind: 'missing' };
  }
  return { kind: 'template' };
}
