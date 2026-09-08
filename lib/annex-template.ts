import { documentHeader, documentSignatures, DOCUMENT_FOOTER, escapeDocumentText } from './contract-document';

export const ANNEX_TEMPLATE = `<article class="fne-document fne-annex">
${documentHeader('Anexo de contrato de prestación de servicios', '{{CONTRATO_NUMERO}}', '{{FECHA_ANEXO}}', '{{CLIENTE_NOMBRE_LEGAL}}', '{{ANEXO_NUMERO}}')}
<p>En Santiago de Chile, a {{FECHA_ANEXO}}, las partes firmantes del contrato original suscrito con fecha {{FECHA_CONTRATO}}, entre {{CLIENTE_NOMBRE_LEGAL}} y Fundación Instituto Relacional (Nueva Educación), acuerdan el presente Anexo, que se incorpora como parte integrante del contrato {{CONTRATO_NUMERO}}, según las condiciones que siguen:</p>
<section class="annex-clause"><h2><span class="clause-index">1</span>Ingreso de nuevos destinatarios</h2><p>Se acuerda la incorporación de {{NÚMERO_PARTICIPANTES}} líderes del {{NOMBRE_CICLO}} del colegio al programa de asesoría "{{PROGRAMA_NOMBRE}}".</p></section>
<section class="annex-clause"><h2><span class="clause-index">2</span>Valor y forma de pago</h2><p>El valor total del programa asciende a {{IF_UF}}{{ANEXO_VALOR_UF}}{{/IF_UF}}{{IF_CLP}}{{ANEXO_VALOR_CLP}}{{/IF_CLP}}. El pago se realizará en {{CUOTAS_CANTIDAD}} {{CUOTAS_UNIDAD}}, {{CUOTAS_DETALLADAS}} a continuación:</p>{{CUOTAS_DETALLE}}<p>El pago de cada cuota se efectuará mediante la emisión de la factura correspondiente por parte de la Fundación Instituto Relacional (Nueva Educación) y su cancelación por {{CLIENTE_NOMBRE_FANTASIA}} dentro de los plazos antes señalados. La mora o retraso en cualquiera de los pagos autorizará a la Fundación Instituto Relacional (Nueva Educación) a suspender los servicios, sin perjuicio de las demás acciones que le correspondan en derecho.</p></section>
<section class="annex-clause"><h2><span class="clause-index">3</span>Ratificación del contrato original</h2><p>Todas las demás disposiciones del contrato {{CONTRATO_NUMERO}} de prestación de servicios firmado el {{FECHA_CONTRATO}} permanecen plenamente vigentes y se aplican al presente Anexo, salvo las modificaciones expresamente señaladas en este documento.</p></section>
<section class="annex-clause"><h2><span class="clause-index">4</span>Firma de conformidad</h2><p>Las partes firman el presente Anexo en dos ejemplares del mismo tenor y fecha, quedando cada una con un ejemplar para su resguardo.</p></section>
<div class="doc-closing">${documentSignatures('{{CLIENTE_REPRESENTANTE}}', '{{CLIENTE_NOMBRE_LEGAL}}')}
${DOCUMENT_FOOTER}</div></article>`;

// Function to replace placeholders with actual data for annexes
export function generateAnnexFromTemplate(annexData: any): string {
  let contract = ANNEX_TEMPLATE;

  // Date formatting - parse as local date to avoid timezone issues
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    // Split the date string to avoid timezone conversion issues
    const parts = dateString.split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // months are 0-indexed
      const day = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      return date.toLocaleDateString('es-CL');
    }
    return new Date(dateString).toLocaleDateString('es-CL');
  };

  // Determine currency type (default to UF for existing contracts)
  const isUF = !annexData.tipo_moneda || annexData.tipo_moneda === 'UF';
  const isCLP = annexData.tipo_moneda === 'CLP';

  // Currency formatting
  const formatCurrencyUF = (amount: number) => {
    return `UF ${amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatCurrencyCLP = (amount: number) => {
    return `$${amount.toLocaleString('es-CL')}`;
  };

  const formatCurrencyByType = (amount: number) => {
    return isUF ? formatCurrencyUF(amount) : formatCurrencyCLP(amount);
  };

  // Generate installments details with proper HTML line breaks
  const generateCuotasDetalle = (cuotas: any[]) => {
    if (!cuotas || cuotas.length === 0) return '<p>Sin cuotas definidas</p>';

    return `<table><thead><tr><th>Cuota</th><th>Monto</th><th>Vencimiento</th></tr></thead><tbody>${cuotas.map(cuota =>
      `<tr><td>N.º ${escapeDocumentText(cuota.numero_cuota)}</td><td>${formatCurrencyByType(cuota.monto_uf || cuota.monto_clp || 0)}</td><td>${formatDate(cuota.fecha_vencimiento)}</td></tr>`
    ).join('')}</tbody></table>`;
  };

  // Process conditional blocks first
  contract = processConditionalBlocks(contract, isUF, isCLP);

  // Basic replacements for annex (includes parent contract data + annex-specific data)
  const parentContract = annexData.parentContract || {};
  const replacements: { [key: string]: string } = {
    // Parent contract data
    '{{FECHA_CONTRATO}}': formatDate(parentContract.fecha_contrato || ''),
    '{{CONTRATO_NUMERO}}': parentContract.numero_contrato || '',

    // Client data (from parent contract) - uppercase to match contract style
    '{{CLIENTE_NOMBRE_LEGAL}}': (parentContract.cliente?.nombre_legal || ''),
    '{{CLIENTE_NOMBRE_FANTASIA}}': (parentContract.cliente?.nombre_fantasia || ''),
    '{{CLIENTE_RUT}}': parentContract.cliente?.rut || '',
    '{{CLIENTE_DIRECCION}}': parentContract.cliente?.direccion || '',
    '{{CLIENTE_COMUNA}}': parentContract.cliente?.comuna || '',
    '{{CLIENTE_CIUDAD}}': parentContract.cliente?.ciudad || '',
    '{{CLIENTE_REPRESENTANTE}}': (parentContract.cliente?.nombre_representante || ''),
    '{{CLIENTE_RUT_REPRESENTANTE}}': parentContract.cliente?.rut_representante || '',
    '{{CLIENTE_FECHA_ESCRITURA}}': parentContract.cliente?.fecha_escritura || '',
    '{{CLIENTE_NOMBRE_NOTARIO}}': parentContract.cliente?.nombre_notario || '',
    '{{CLIENTE_COMUNA_NOTARIA}}': parentContract.cliente?.comuna_notaria || '',

    // Program data (from parent contract)
    '{{PROGRAMA_NOMBRE}}': parentContract.programa?.nombre || '',
    '{{PROGRAMA_DESCRIPCION}}': parentContract.programa?.descripcion || '',
    '{{PROGRAMA_HORAS}}': parentContract.programa?.horas_totales?.toString() || '',
    '{{PROGRAMA_MODALIDAD}}': parentContract.programa?.modalidad || '',

    // Annex-specific data
    '{{ANEXO_NUMERO}}': annexData.anexo_numero?.toString() || '',
    '{{FECHA_ANEXO}}': formatDate(annexData.anexo_fecha || ''),
    '{{NÚMERO_PARTICIPANTES}}': annexData.numero_participantes?.toString() || '',
    '{{NOMBRE_CICLO}}': annexData.nombre_ciclo || '',
    '{{ANEXO_VALOR_UF}}': formatCurrencyUF(annexData.precio_total_uf || 0),
    '{{ANEXO_VALOR_CLP}}': formatCurrencyCLP(annexData.precio_total_clp || annexData.precio_total_uf || 0),

    // Installments for the annex
    '{{CUOTAS_DETALLE}}': generateCuotasDetalle(annexData.cuotas || []),
    '{{CUOTAS_DETALLADAS}}': annexData.cuotas?.length === 1 ? 'detallada' : 'detalladas',
    '{{CUOTAS_UNIDAD}}': annexData.cuotas?.length === 1 ? 'cuota' : 'cuotas',
    '{{CUOTAS_CANTIDAD}}': (annexData.cuotas?.length || 0).toString(),
  };

  // Replace all placeholders in the template
  Object.entries(replacements).forEach(([placeholder, value]) => {
    contract = contract.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), () => placeholder === '{{CUOTAS_DETALLE}}' ? value : escapeDocumentText(value));
  });

  return contract;
}

// Process conditional blocks
function processConditionalBlocks(contract: string, isUF: boolean, isCLP: boolean): string {
  // Process currency conditionals
  contract = processConditional(contract, 'IF_UF', isUF);
  contract = processConditional(contract, 'IF_CLP', isCLP);

  return contract;
}

// Process individual conditional blocks
function processConditional(text: string, condition: string, show: boolean): string {
  const regex = new RegExp(`{{${condition}}}([\\s\\S]*?){{/${condition}}}`, 'g');

  return text.replace(regex, (match, content) => {
    return show ? content : '';
  });
}
