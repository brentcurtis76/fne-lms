// Annex template with placeholders
// Replace this with your actual legal annex text

export const ANNEX_TEMPLATE = `

<div style="text-align: center; font-weight: bold; margin-bottom: 20px;">
ANEXO DE CONTRATO<br>
FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN)<br>   
Y<br>
{{CLIENTE_NOMBRE_LEGAL}}<br>
Anexo Número {{ANEXO_NUMERO}}
</div>
 



En Santiago de Chile, a {{FECHA_ANEXO}}, las partes firmantes del contrato original suscrito con fecha {{FECHA_CONTRATO}}, entre {{CLIENTE_NOMBRE_LEGAL}} y FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN), acuerdan el presente Anexo, que se incorpora como parte integrante del contrato {{CONTRATO_NUMERO}}, según las condiciones que siguen: 

1. Ingreso de nuevos destinatarios

Se acuerda la incorporación de {{NÚMERO_PARTICIPANTES}}, líderes del {{NOMBRE_CICLO}} del colegio al programa de asesoría “{{PROGRAMA_NOMBRE}}”. 

2. Valor y forma de pago 

El valor total del programa asciende a {{IF_UF}}{{ANEXO_VALOR_UF}}{{/IF_UF}}{{IF_CLP}}{{ANEXO_VALOR_CLP}}{{/IF_CLP}}.

El pago se realizará en {{CUOTAS_CANTIDAD}} cuotas, detalladas a continuación:

{{CUOTAS_DETALLE}}

El pago de cada cuota se efectuará mediante la emisión de la factura correspondiente por parte de la Fundación Instituto Relacional (Nueva Educación) y su cancelación por {{CLIENTE_NOMBRE_FANTASIA}} dentro de los plazos antes señalados. La mora o retraso en cualquiera de los pagos autorizará a la Fundación Instituto Relacional (Nueva Educación) a suspender los servicios, sin perjuicio de las demás acciones que le correspondan en derecho.

3. Ratificación del contrato original

Todas las demás disposiciones del contrato {{CONTRATO_NUMERO}} de prestación de servicios firmado el {{FECHA_CONTRATO}} permanecen plenamente vigentes y se aplican al presente Anexo, salvo las modificaciones expresamente señaladas en este documento.

4. Firma de conformidad

Las partes firman el presente Anexo en dos ejemplares del mismo tenor y fecha, quedando cada una con un ejemplar para su resguardo.

Por {{CLIENTE_NOMBRE_LEGAL}}:








{{CLIENTE_REPRESENTANTE}}
p.p. {{CLIENTE_NOMBRE_LEGAL}}  

Por FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN):






 
ARNOLDO CISTERNAS CHÁVEZ
p.p Representante Legal FUNDACIÓN NUEVA EDUCACIÓN



`;

// Function to replace placeholders with actual data for annexes
export function generateAnnexFromTemplate(annexData: any): string {
  let contract = ANNEX_TEMPLATE;
  
  // Date formatting
  const formatDate = (dateString: string) => {
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
  
  // Calculate contract duration
  const calculateDuration = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return 'duración a determinar';
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();
    
    // Adjust for negative days
    if (days < 0) {
      months--;
      const lastDayOfPrevMonth = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
      days += lastDayOfPrevMonth;
    }
    
    // Adjust for negative months
    if (months < 0) {
      years--;
      months += 12;
    }
    
    // Convert years to months
    const totalMonths = years * 12 + months;
    
    // Format the duration text
    let durationText = '';
    if (totalMonths > 0 && days > 0) {
      durationText = `${totalMonths} meses y ${days} días`;
    } else if (totalMonths > 0) {
      durationText = `${totalMonths} ${totalMonths === 1 ? 'mes' : 'meses'}`;
    } else if (days > 0) {
      durationText = `${days} ${days === 1 ? 'día' : 'días'}`;
    } else {
      durationText = 'misma fecha';
    }
    
    return durationText;
  };
  
  // Generate installments details
  const generateCuotasDetalle = (cuotas: any[]) => {
    if (!cuotas || cuotas.length === 0) return 'Sin cuotas definidas';
    
    return cuotas.map(cuota => 
      `Cuota N° ${cuota.numero_cuota}: ${formatCurrencyByType(cuota.monto_uf || cuota.monto_clp || 0)} con vencimiento el ${formatDate(cuota.fecha_vencimiento)}`
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
    
    // Client data (from parent contract)
    '{{CLIENTE_NOMBRE_LEGAL}}': parentContract.cliente?.nombre_legal || '',
    '{{CLIENTE_NOMBRE_FANTASIA}}': parentContract.cliente?.nombre_fantasia || '',
    '{{CLIENTE_RUT}}': parentContract.cliente?.rut || '',
    '{{CLIENTE_DIRECCION}}': parentContract.cliente?.direccion || '',
    '{{CLIENTE_COMUNA}}': parentContract.cliente?.comuna || '',
    '{{CLIENTE_CIUDAD}}': parentContract.cliente?.ciudad || '',
    '{{CLIENTE_REPRESENTANTE}}': parentContract.cliente?.nombre_representante || '',
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