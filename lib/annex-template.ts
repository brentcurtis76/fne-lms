// Annex template with placeholders
// Uses the same professional styling as contract template

export const ANNEX_TEMPLATE = `
<div class="contract-document">
  <!-- Header -->
  <div class="contract-header">
    <div class="header-logo">
      <div class="logo-placeholder">
        <span class="logo-text">FUNDACIÓN</span>
        <span class="logo-text-large">NUEVA EDUCACIÓN</span>
      </div>
    </div>
    <div class="header-info">
      <p class="header-rut">RUT: 65.166.503-5</p>
      <p>Carlos Silva Vildósola N° 10448</p>
      <p>La Reina, Santiago</p>
    </div>
  </div>

  <!-- Title -->
  <div class="contract-title">
    <h1>ANEXO DE CONTRATO</h1>
    <span class="contract-number">Anexo N° {{ANEXO_NUMERO}} - Contrato {{CONTRATO_NUMERO}}</span>
  </div>

  <!-- Parties Section -->
  <div class="parties-section">
    <div class="party-box">
      <div class="party-label">Primera Parte</div>
      <div class="party-content">
        <strong>FUNDACIÓN INSTITUTO RELACIONAL</strong><br>
        (NUEVA EDUCACIÓN)<br>
        RUT: 65.166.503-5
      </div>
    </div>
    <div class="party-connector">Y</div>
    <div class="party-box">
      <div class="party-label">Segunda Parte</div>
      <div class="party-content">
        <strong>{{CLIENTE_NOMBRE_LEGAL}}</strong><br>
        {{CLIENTE_NOMBRE_FANTASIA}}<br>
        RUT: {{CLIENTE_RUT}}
      </div>
    </div>
  </div>

  <!-- Contract Date -->
  <div class="contract-date">
    En Santiago de Chile, a <strong>{{FECHA_ANEXO}}</strong>
  </div>

  <!-- Contract Body -->
  <div class="contract-body">
    <!-- Introduction -->
    <div class="clause">
      <div class="clause-content">
        <p>Las partes firmantes del contrato original suscrito con fecha <strong>{{FECHA_CONTRATO}}</strong>, entre <strong>{{CLIENTE_NOMBRE_LEGAL}}</strong> y <strong>FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN)</strong>, acuerdan el presente Anexo, que se incorpora como parte integrante del contrato <strong>{{CONTRATO_NUMERO}}</strong>, según las condiciones que siguen:</p>
      </div>
    </div>

    <!-- Clause 1: New Participants -->
    <div class="clause">
      <div class="clause-header">
        <span class="clause-number">1.</span>
        <span class="clause-title">Ingreso de nuevos destinatarios</span>
      </div>
      <div class="clause-content">
        <p>Se acuerda la incorporación de <strong>{{NÚMERO_PARTICIPANTES}}</strong> líderes del <strong>{{NOMBRE_CICLO}}</strong> del colegio al programa de asesoría "<strong>{{PROGRAMA_NOMBRE}}</strong>".</p>
      </div>
    </div>

    <!-- Clause 2: Value and Payment -->
    <div class="clause">
      <div class="clause-header">
        <span class="clause-number">2.</span>
        <span class="clause-title">Valor y forma de pago</span>
      </div>
      <div class="clause-content">
        <div class="amount-box">
          <span class="amount-label">Valor Total del Anexo</span>
          <span class="amount-value">{{IF_UF}}{{ANEXO_VALOR_UF}}{{/IF_UF}}{{IF_CLP}}{{ANEXO_VALOR_CLP}}{{/IF_CLP}}</span>
        </div>

        <p>El pago se realizará en <strong>{{CUOTAS_CANTIDAD}}</strong> cuotas, detalladas a continuación:</p>

        <div class="payment-schedule">
          <table class="cuotas-table">
            <thead>
              <tr>
                <th>Cuota</th>
                <th>Monto</th>
                <th>Vencimiento</th>
              </tr>
            </thead>
            <tbody>
              {{CUOTAS_TABLE_ROWS}}
            </tbody>
          </table>
        </div>

        <p>El pago de cada cuota se efectuará mediante la emisión de la factura correspondiente por parte de la Fundación Instituto Relacional (Nueva Educación) y su cancelación por <strong>{{CLIENTE_NOMBRE_FANTASIA}}</strong> dentro de los plazos antes señalados. La mora o retraso en cualquiera de los pagos autorizará a la Fundación Instituto Relacional (Nueva Educación) a suspender los servicios, sin perjuicio de las demás acciones que le correspondan en derecho.</p>
      </div>
    </div>

    <!-- Clause 3: Ratification -->
    <div class="clause">
      <div class="clause-header">
        <span class="clause-number">3.</span>
        <span class="clause-title">Ratificación del contrato original</span>
      </div>
      <div class="clause-content">
        <p>Todas las demás disposiciones del contrato <strong>{{CONTRATO_NUMERO}}</strong> de prestación de servicios firmado el <strong>{{FECHA_CONTRATO}}</strong> permanecen plenamente vigentes y se aplican al presente Anexo, salvo las modificaciones expresamente señaladas en este documento.</p>
      </div>
    </div>

    <!-- Clause 4: Signatures -->
    <div class="clause">
      <div class="clause-header">
        <span class="clause-number">4.</span>
        <span class="clause-title">Firma de conformidad</span>
      </div>
      <div class="clause-content">
        <p>Las partes firman el presente Anexo en dos ejemplares del mismo tenor y fecha, quedando cada una con un ejemplar para su resguardo.</p>
      </div>
    </div>
  </div>

  <!-- Signatures Section -->
  <div class="signatures-section">
    <div class="signature-block">
      <div class="signature-line"></div>
      <div class="signature-name">{{CLIENTE_REPRESENTANTE}}</div>
      <div class="signature-role">p.p. Representante Legal</div>
      <div class="signature-entity">{{CLIENTE_NOMBRE_LEGAL}}</div>
    </div>
    <div class="signature-block">
      <div class="signature-line"></div>
      <div class="signature-name">ARNOLDO CISTERNAS CHÁVEZ</div>
      <div class="signature-role">p.p. Representante Legal</div>
      <div class="signature-entity">FUNDACIÓN NUEVA EDUCACIÓN</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="contract-footer">
    <p>Este documento forma parte integral del Contrato {{CONTRATO_NUMERO}}</p>
  </div>
</div>
`;

// Function to replace placeholders with actual data for annexes
export function generateAnnexFromTemplate(annexData: any): string {
  let contract = ANNEX_TEMPLATE;

  // Date formatting
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
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

  // Generate installments table rows (HTML format for proper table display)
  const generateCuotasTableRows = (cuotas: any[]) => {
    if (!cuotas || cuotas.length === 0) {
      return '<tr><td colspan="3" style="text-align: center;">Sin cuotas definidas</td></tr>';
    }

    return cuotas.map(cuota =>
      `<tr>
        <td>Cuota N° ${cuota.numero_cuota}</td>
        <td>${formatCurrencyByType(cuota.monto_uf || cuota.monto_clp || 0)}</td>
        <td>${formatDate(cuota.fecha_vencimiento)}</td>
      </tr>`
    ).join('\n');
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
    '{{CLIENTE_NOMBRE_LEGAL}}': (parentContract.cliente?.nombre_legal || '').toUpperCase(),
    '{{CLIENTE_NOMBRE_FANTASIA}}': (parentContract.cliente?.nombre_fantasia || '').toUpperCase(),
    '{{CLIENTE_RUT}}': parentContract.cliente?.rut || '',
    '{{CLIENTE_DIRECCION}}': parentContract.cliente?.direccion || '',
    '{{CLIENTE_COMUNA}}': parentContract.cliente?.comuna || '',
    '{{CLIENTE_CIUDAD}}': parentContract.cliente?.ciudad || '',
    '{{CLIENTE_REPRESENTANTE}}': (parentContract.cliente?.nombre_representante || '').toUpperCase(),
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

    // Installments for the annex (as HTML table rows)
    '{{CUOTAS_TABLE_ROWS}}': generateCuotasTableRows(annexData.cuotas || []),
    '{{CUOTAS_CANTIDAD}}': (annexData.cuotas?.length || 0).toString(),
  };

  // Replace all placeholders in the template
  Object.entries(replacements).forEach(([placeholder, value]) => {
    contract = contract.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
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
