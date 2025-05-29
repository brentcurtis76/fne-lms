import { useState, useEffect } from 'react';
import { Calendar, DollarSign, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import UFService from '../../lib/uf-service';

interface Cuota {
  id: string;
  contrato_id: string;
  numero_cuota: number;
  fecha_vencimiento: string;
  monto_uf: number;
  pagada: boolean;
  created_at: string;
  monto_clp?: number;
}

interface Contrato {
  id: string;
  numero_contrato: string;
  fecha_contrato: string;
  cliente_id: string;
  programa_id: string;
  precio_total_uf: number;
  tipo_moneda?: 'UF' | 'CLP';
  incluir_en_flujo?: boolean;
  clientes: {
    nombre_legal: string;
    nombre_fantasia: string;
    rut: string;
  };
  programas: {
    nombre: string;
  };
  cuotas?: Cuota[];
}

interface CashFlowItem {
  fecha: string;
  cuotas: Array<{
    contrato: Contrato;
    cuota: Cuota;
    monto_clp?: number;
  }>;
  total_mes: number;
  total_pagado: number;
  total_pendiente: number;
  total_mes_clp?: number;
  total_pagado_clp?: number;
  total_pendiente_clp?: number;
}

interface CashFlowViewProps {
  contratos: Contrato[];
}

export default function CashFlowView({ contratos }: CashFlowViewProps) {
  const [cashFlow, setCashFlow] = useState<CashFlowItem[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<'3m' | '6m' | '12m'>('6m');
  const [viewType, setViewType] = useState<'monthly' | 'detailed'>('monthly');
  const [currencyDisplay, setCurrencyDisplay] = useState<'UF' | 'CLP' | 'BOTH'>('BOTH');
  const [loading, setLoading] = useState(false);
  const [currentUFValue, setCurrentUFValue] = useState<number>(0);

  useEffect(() => {
    loadUFValueAndGenerateCashFlow();
  }, [contratos, selectedPeriod]);

  const loadUFValueAndGenerateCashFlow = async () => {
    setLoading(true);
    try {
      const ufValue = await UFService.getCurrentUF();
      setCurrentUFValue(ufValue.valor);
      await generateCashFlow(ufValue.valor);
    } catch (error) {
      console.error('Error loading UF value:', error);
      // Use fallback UF value
      setCurrentUFValue(37500);
      await generateCashFlow(37500);
    }
    setLoading(false);
  };

  const generateCashFlow = async (ufValueCLP: number) => {
    const now = new Date();
    const months = selectedPeriod === '3m' ? 3 : selectedPeriod === '6m' ? 6 : 12;
    
    // Create array of months for the selected period
    const monthsArray: string[] = [];
    for (let i = 0; i < months; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      monthsArray.push(date.toISOString().substring(0, 7)); // YYYY-MM format
    }

    // Group cuotas by month
    const flowByMonth: { [key: string]: CashFlowItem } = {};
    
    monthsArray.forEach(month => {
      flowByMonth[month] = {
        fecha: month,
        cuotas: [],
        total_mes: 0,
        total_pagado: 0,
        total_pendiente: 0,
        total_mes_clp: 0,
        total_pagado_clp: 0,
        total_pendiente_clp: 0
      };
    });

    // Process only contracts that are included in cash flow
    const includedContratos = contratos.filter(contrato => contrato.incluir_en_flujo);
    
    for (const contrato of includedContratos) {
      if (contrato.cuotas) {
        for (const cuota of contrato.cuotas) {
          const cuotaMonth = cuota.fecha_vencimiento.substring(0, 7);
          
          if (flowByMonth[cuotaMonth]) {
            // Calculate CLP amount based on contract currency type
            let montoCLP: number;
            
            // Detect currency type: if tipo_moneda is not set, infer from amount size
            // UF amounts are typically < 1,000, CLP amounts are > 100,000
            const isClpContract = contrato.tipo_moneda === 'CLP' || 
                                (!contrato.tipo_moneda && cuota.monto_uf > 1000);
            
            console.log(`Contract ${contrato.numero_contrato}: cuota ${cuota.numero_cuota} = ${cuota.monto_uf}, tipo_moneda = ${contrato.tipo_moneda}, detected as CLP = ${isClpContract}`);
            
            if (isClpContract) {
              // Contract is in CLP, cuota.monto_uf is actually in CLP
              montoCLP = cuota.monto_uf;
            } else {
              // Contract is in UF, convert to CLP using projected UF value for due date
              try {
                const projectedUF = await UFService.getProjectedUF(cuota.fecha_vencimiento);
                montoCLP = cuota.monto_uf * projectedUF.valor;
              } catch (error) {
                console.warn('Using current UF value for projection:', error);
                montoCLP = cuota.monto_uf * ufValueCLP;
              }
            }
            
            flowByMonth[cuotaMonth].cuotas.push({
              contrato,
              cuota,
              monto_clp: montoCLP
            });
            
            // Add to UF total: if it's CLP, convert to UF; if it's UF, use as-is
            const montoUF = isClpContract ? cuota.monto_uf / ufValueCLP : cuota.monto_uf;
            
            console.log(`Adding to totals: ${cuota.monto_uf} (original) → ${montoUF} UF, ${montoCLP} CLP`);
            
            flowByMonth[cuotaMonth].total_mes += montoUF;
            flowByMonth[cuotaMonth].total_mes_clp! += montoCLP;
            
            if (cuota.pagada) {
              flowByMonth[cuotaMonth].total_pagado += montoUF;
              flowByMonth[cuotaMonth].total_pagado_clp! += montoCLP;
            } else {
              flowByMonth[cuotaMonth].total_pendiente += montoUF;
              flowByMonth[cuotaMonth].total_pendiente_clp! += montoCLP;
            }
          }
        }
      }
    }

    // Convert to array and sort by date
    const flowArray = Object.values(flowByMonth).sort((a, b) => 
      a.fecha.localeCompare(b.fecha)
    );

    setCashFlow(flowArray);
  };

  const formatCurrency = (amount: number, originalCurrency?: 'UF' | 'CLP', amountCLP?: number) => {
    // Detect if the original amount was in CLP based on size
    const isOriginalClp = originalCurrency === 'CLP' || (!originalCurrency && amount > 1000);
    
    if (currencyDisplay === 'UF') {
      if (isOriginalClp) {
        // Convert CLP to UF for display
        const ufAmount = amount / currentUFValue;
        return UFService.formatCurrency(ufAmount, 'UF');
      } else {
        return UFService.formatCurrency(amount, 'UF');
      }
    } else if (currencyDisplay === 'CLP') {
      if (isOriginalClp) {
        return UFService.formatCurrency(amount, 'CLP');
      } else {
        const clpAmount = amountCLP || (amount * currentUFValue);
        return UFService.formatCurrency(clpAmount, 'CLP');
      }
    } else {
      // BOTH - show both currencies
      if (isOriginalClp) {
        const ufAmount = amount / currentUFValue;
        return `${UFService.formatCurrency(ufAmount, 'UF')} (${UFService.formatCurrency(amount, 'CLP')})`;
      } else {
        const clpAmount = amountCLP || (amount * currentUFValue);
        return `${UFService.formatCurrency(amount, 'UF')} (${UFService.formatCurrency(clpAmount, 'CLP')})`;
      }
    }
  };

  const formatMonth = (monthStr: string) => {
    const date = new Date(monthStr + '-01');
    return date.toLocaleDateString('es-CL', { year: 'numeric', month: 'long' });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CL');
  };

  const getTotalProjected = () => {
    const ufTotal = cashFlow.reduce((sum, item) => sum + item.total_mes, 0);
    const clpTotal = cashFlow.reduce((sum, item) => sum + (item.total_mes_clp || 0), 0);
    return { uf: ufTotal, clp: clpTotal };
  };

  const getTotalPaid = () => {
    const ufTotal = cashFlow.reduce((sum, item) => sum + item.total_pagado, 0);
    const clpTotal = cashFlow.reduce((sum, item) => sum + (item.total_pagado_clp || 0), 0);
    return { uf: ufTotal, clp: clpTotal };
  };

  const getTotalPending = () => {
    const ufTotal = cashFlow.reduce((sum, item) => sum + item.total_pendiente, 0);
    const clpTotal = cashFlow.reduce((sum, item) => sum + (item.total_pendiente_clp || 0), 0);
    return { uf: ufTotal, clp: clpTotal };
  };

  const getOverdueCuotas = () => {
    const today = new Date().toISOString().split('T')[0];
    const overdue: Array<{ contrato: Contrato; cuota: Cuota }> = [];
    
    contratos.forEach(contrato => {
      if (contrato.cuotas) {
        contrato.cuotas.forEach(cuota => {
          if (!cuota.pagada && cuota.fecha_vencimiento < today) {
            overdue.push({ contrato, cuota });
          }
        });
      }
    });
    
    return overdue;
  };

  const overdueCuotas = getOverdueCuotas();

  return (
    <div className="space-y-6">
      {/* UF Value Indicator */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-blue-900">Valor UF Actual</h4>
            <p className="text-sm text-blue-700">Utilizado para proyecciones y conversiones</p>
          </div>
          <div className="text-right">
            {loading ? (
              <div className="animate-pulse bg-blue-200 h-6 w-24 rounded"></div>
            ) : (
              <p className="text-xl font-bold text-blue-900">
                {UFService.formatCurrency(currentUFValue, 'CLP')}
              </p>
            )}
            <p className="text-xs text-blue-600">Actualizado automáticamente</p>
          </div>
        </div>
      </div>
      {/* Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div className="flex items-center space-x-4">
          <div className="flex space-x-2">
            {(['3m', '6m', '12m'] as const).map(period => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedPeriod === period
                    ? 'bg-brand_blue text-white'
                    : 'bg-white text-brand_blue border border-brand_blue hover:bg-brand_blue hover:text-white'
                }`}
              >
                {period === '3m' && '3 Meses'}
                {period === '6m' && '6 Meses'}
                {period === '12m' && '12 Meses'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
          {/* Currency Display Toggle */}
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrencyDisplay('UF')}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                currencyDisplay === 'UF'
                  ? 'bg-blue-100 text-blue-800 border border-blue-300'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              UF
            </button>
            <button
              onClick={() => setCurrencyDisplay('CLP')}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                currencyDisplay === 'CLP'
                  ? 'bg-green-100 text-green-800 border border-green-300'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              CLP
            </button>
            <button
              onClick={() => setCurrencyDisplay('BOTH')}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                currencyDisplay === 'BOTH'
                  ? 'bg-purple-100 text-purple-800 border border-purple-300'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Ambos
            </button>
          </div>

          {/* View Type Toggle */}
          <div className="flex space-x-2">
            <button
              onClick={() => setViewType('monthly')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewType === 'monthly'
                  ? 'bg-brand_yellow text-brand_blue'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Vista Mensual
            </button>
            <button
              onClick={() => setViewType('detailed')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewType === 'detailed'
                  ? 'bg-brand_yellow text-brand_blue'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Vista Detallada
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600">Total Proyectado</p>
              <p className="text-2xl font-bold text-blue-900">{formatCurrency(getTotalProjected().uf, 'UF', getTotalProjected().clp)}</p>
            </div>
            <TrendingUp className="text-blue-600" size={24} />
          </div>
        </div>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600">Total Pagado</p>
              <p className="text-2xl font-bold text-green-900">{formatCurrency(getTotalPaid().uf, 'UF', getTotalPaid().clp)}</p>
            </div>
            <CheckCircle className="text-green-600" size={24} />
          </div>
        </div>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-yellow-600">Total Pendiente</p>
              <p className="text-2xl font-bold text-yellow-900">{formatCurrency(getTotalPending().uf, 'UF', getTotalPending().clp)}</p>
            </div>
            <Calendar className="text-yellow-600" size={24} />
          </div>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-600">Cuotas Vencidas</p>
              <p className="text-2xl font-bold text-red-900">{overdueCuotas.length}</p>
            </div>
            <AlertCircle className="text-red-600" size={24} />
          </div>
        </div>
      </div>

      {/* Overdue Alerts */}
      {overdueCuotas.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-3">
            <AlertCircle className="text-red-600" size={20} />
            <h3 className="font-semibold text-red-800">Cuotas Vencidas ({overdueCuotas.length})</h3>
          </div>
          <div className="space-y-2">
            {overdueCuotas.slice(0, 5).map(({ contrato, cuota }, index) => (
              <div key={index} className="flex items-center justify-between bg-white p-3 rounded border">
                <div>
                  <p className="font-medium text-gray-900">{contrato.clientes.nombre_fantasia}</p>
                  <p className="text-sm text-gray-600">
                    Contrato {contrato.numero_contrato} - Cuota {cuota.numero_cuota}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-red-600">{formatCurrency(cuota.monto_uf, contrato.tipo_moneda, cuota.monto_clp)}</p>
                  <p className="text-sm text-red-500">Vence: {formatDate(cuota.fecha_vencimiento)}</p>
                </div>
              </div>
            ))}
            {overdueCuotas.length > 5 && (
              <p className="text-sm text-gray-600 text-center">
                ... y {overdueCuotas.length - 5} más
              </p>
            )}
          </div>
        </div>
      )}

      {/* Cash Flow Table/Timeline */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-brand_blue">
            Proyección de Flujo de Caja - {viewType === 'monthly' ? 'Mensual' : 'Detallada'}
          </h3>
        </div>
        
        <div className="p-6">
          {viewType === 'monthly' ? (
            /* Monthly View */
            <div className="space-y-4">
              {cashFlow.map((item, index) => (
                <div key={item.fecha} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-brand_blue">
                      {formatMonth(item.fecha)}
                    </h4>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">
                        {formatCurrency(item.total_mes, 'UF', item.total_mes_clp)}
                      </p>
                      <p className="text-sm text-gray-600">
                        {item.cuotas.length} cuotas programadas
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-sm font-medium text-green-600">Pagado</p>
                      <p className="text-lg font-semibold text-green-900">
                        {formatCurrency(item.total_pagado, 'UF', item.total_pagado_clp)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-yellow-600">Pendiente</p>
                      <p className="text-lg font-semibold text-yellow-900">
                        {formatCurrency(item.total_pendiente, 'UF', item.total_pendiente_clp)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-600">% Cobrado</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {item.total_mes > 0 ? ((item.total_pagado / item.total_mes) * 100).toFixed(1) : '0'}%
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Detailed View */
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-brand_blue">Fecha</th>
                    <th className="text-left py-3 px-4 font-semibold text-brand_blue">Cliente</th>
                    <th className="text-left py-3 px-4 font-semibold text-brand_blue">Contrato</th>
                    <th className="text-left py-3 px-4 font-semibold text-brand_blue">Cuota</th>
                    <th className="text-left py-3 px-4 font-semibold text-brand_blue">Monto</th>
                    <th className="text-left py-3 px-4 font-semibold text-brand_blue">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cashFlow.map(monthItem => 
                    monthItem.cuotas
                      .sort((a, b) => a.cuota.fecha_vencimiento.localeCompare(b.cuota.fecha_vencimiento))
                      .map(({ contrato, cuota, monto_clp }, index) => (
                        <tr key={`${contrato.id}-${cuota.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">{formatDate(cuota.fecha_vencimiento)}</td>
                          <td className="py-3 px-4">
                            <div>
                              <div className="font-medium">{contrato.clientes.nombre_fantasia}</div>
                              <div className="text-sm text-gray-500">{contrato.clientes.rut}</div>
                            </div>
                          </td>
                          <td className="py-3 px-4">{contrato.numero_contrato}</td>
                          <td className="py-3 px-4">Cuota {cuota.numero_cuota}</td>
                          <td className="py-3 px-4 font-medium">{formatCurrency(cuota.monto_uf, contrato.tipo_moneda, monto_clp)}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              cuota.pagada 
                                ? 'bg-green-100 text-green-800' 
                                : new Date(cuota.fecha_vencimiento) < new Date()
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {cuota.pagada 
                                ? 'Pagada' 
                                : new Date(cuota.fecha_vencimiento) < new Date()
                                ? 'Vencida'
                                : 'Pendiente'
                              }
                            </span>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}