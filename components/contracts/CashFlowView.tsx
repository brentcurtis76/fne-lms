import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useState, useEffect } from 'react';
import { Calendar, DollarSign, TrendingUp, AlertCircle, CheckCircle, Upload, Check, X, Filter } from 'lucide-react';
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
  factura_url?: string;
  factura_pagada?: boolean;
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
  const supabase = useSupabaseClient();
  const [cashFlow, setCashFlow] = useState<CashFlowItem[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<'3m' | '6m' | '12m'>('6m');
  const [viewType, setViewType] = useState<'monthly' | 'detailed'>('monthly');
  const [currencyDisplay, setCurrencyDisplay] = useState<'UF' | 'CLP' | 'BOTH'>('BOTH');
  const [loading, setLoading] = useState(false);
  const [currentUFValue, setCurrentUFValue] = useState<number>(0);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'due_unpaid' | 'due_paid'>('all');
  const [uploadingInvoice, setUploadingInvoice] = useState<string | null>(null);
  const [showAllOverdue, setShowAllOverdue] = useState(false);

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
    if (!dateString) return '';
    // Parse date string manually to avoid timezone conversion issues
    const parts = dateString.split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // months are 0-indexed
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day).toLocaleDateString('es-CL');
    }
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

  // Calculate ALL contract totals (not limited by time period)
  const getAllContractsTotals = () => {
    // Include all contracts with incluir_en_flujo = true
    const includedContratos = contratos.filter(contrato => contrato.incluir_en_flujo);
    
    let totalUF = 0;
    let totalCLP = 0;
    let paidUF = 0;
    let paidCLP = 0;
    let pendingUF = 0;
    let pendingCLP = 0;
    
    console.log('🔍 Calculating ALL contract totals...');
    console.log(`📊 Found ${includedContratos.length} contracts with incluir_en_flujo = true`);
    
    includedContratos.forEach(contrato => {
      console.log(`📋 Contract ${contrato.numero_contrato}:`);
      console.log(`   - Total value: ${contrato.precio_total_uf} (tipo_moneda: ${contrato.tipo_moneda})`);
      
      // Detect if contract is in CLP or UF
      const isClpContract = contrato.tipo_moneda === 'CLP' || 
                          (!contrato.tipo_moneda && contrato.precio_total_uf > 1000);
      
      if (isClpContract) {
        // Contract is in CLP
        totalCLP += contrato.precio_total_uf;
        // Convert to UF for UF total
        totalUF += contrato.precio_total_uf / currentUFValue;
        console.log(`   - Added ${contrato.precio_total_uf} CLP (${(contrato.precio_total_uf / currentUFValue).toFixed(2)} UF)`);
      } else {
        // Contract is in UF
        totalUF += contrato.precio_total_uf;
        // Convert to CLP for CLP total
        totalCLP += contrato.precio_total_uf * currentUFValue;
        console.log(`   - Added ${contrato.precio_total_uf} UF (${(contrato.precio_total_uf * currentUFValue).toLocaleString()} CLP)`);
      }
      
      // Calculate paid vs pending from cuotas
      if (contrato.cuotas) {
        contrato.cuotas.forEach(cuota => {
          const cuotaIsClp = contrato.tipo_moneda === 'CLP' || 
                            (!contrato.tipo_moneda && cuota.monto_uf > 1000);
          
          if (cuota.pagada) {
            if (cuotaIsClp) {
              paidCLP += cuota.monto_uf;
              paidUF += cuota.monto_uf / currentUFValue;
            } else {
              paidUF += cuota.monto_uf;
              paidCLP += cuota.monto_uf * currentUFValue;
            }
          } else {
            if (cuotaIsClp) {
              pendingCLP += cuota.monto_uf;
              pendingUF += cuota.monto_uf / currentUFValue;
            } else {
              pendingUF += cuota.monto_uf;
              pendingCLP += cuota.monto_uf * currentUFValue;
            }
          }
        });
      }
    });
    
    console.log(`💰 TOTAL CALCULATIONS:`);
    console.log(`   - Total UF: ${totalUF.toFixed(2)}`);
    console.log(`   - Total CLP: ${totalCLP.toLocaleString()}`);
    console.log(`   - Paid UF: ${paidUF.toFixed(2)}`);
    console.log(`   - Paid CLP: ${paidCLP.toLocaleString()}`);
    console.log(`   - Pending UF: ${pendingUF.toFixed(2)}`);
    console.log(`   - Pending CLP: ${pendingCLP.toLocaleString()}`);
    
    return {
      total: { uf: totalUF, clp: totalCLP },
      paid: { uf: paidUF, clp: paidCLP },
      pending: { uf: pendingUF, clp: pendingCLP },
      contractCount: includedContratos.length
    };
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

  // Handle invoice upload
  const handleInvoiceUpload = async (cuotaId: string, file: File) => {
    try {
      setUploadingInvoice(cuotaId);
      
      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `cuota_${cuotaId}_${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('facturas')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('facturas')
        .getPublicUrl(fileName);

      // Update cuota with invoice URL
      const { error: updateError } = await supabase
        .from('cuotas')
        .update({ 
          factura_url: publicUrl
        })
        .eq('id', cuotaId);

      if (updateError) throw updateError;

      // Refresh cash flow data
      await loadUFValueAndGenerateCashFlow();
      
    } catch (error) {
      console.error('Error uploading invoice:', error);
      alert('Error al subir la factura: ' + (error as Error).message);
    } finally {
      setUploadingInvoice(null);
    }
  };

  // Handle payment status toggle
  const handlePaymentStatusToggle = async (cuotaId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('cuotas')
        .update({ 
          factura_pagada: !currentStatus
        })
        .eq('id', cuotaId);

      if (error) throw error;

      // Refresh cash flow data
      await loadUFValueAndGenerateCashFlow();
      
    } catch (error) {
      console.error('Error updating payment status:', error);
      alert('Error al actualizar el estado de pago: ' + (error as Error).message);
    }
  };

  // Filter cuotas based on payment filter
  const filterCuotas = (cuotas: any[]) => {
    if (paymentFilter === 'all') return cuotas;
    
    const today = new Date();
    return cuotas.filter(({ cuota }) => {
      const dueDate = new Date(cuota.fecha_vencimiento);
      const isDue = dueDate <= today;
      
      if (paymentFilter === 'due_unpaid') {
        return isDue && !cuota.factura_pagada;
      } else if (paymentFilter === 'due_paid') {
        return isDue && cuota.factura_pagada;
      }
      return true;
    });
  };

  return (
    <div className="space-y-6">
      {/* UF Value Indicator */}
      <div className="bg-brand_beige border border-brand_accent rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-brand_primary">Valor UF Actual</h4>
            <p className="text-sm text-gray-700">Utilizado para proyecciones y conversiones</p>
          </div>
          <div className="text-right">
            {loading ? (
              <div className="animate-pulse bg-amber-200 h-6 w-24 rounded"></div>
            ) : (
              <p className="text-xl font-bold text-brand_primary">
                {UFService.formatCurrency(currentUFValue, 'CLP')}
              </p>
            )}
            <p className="text-xs text-brand_accent">Actualizado automáticamente</p>
          </div>
        </div>
      </div>
      {/* Controls */}
      <div className="space-y-4">
        {/* Period Selection */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex space-x-2">
            {(['3m', '6m', '12m'] as const).map(period => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedPeriod === period
                    ? 'bg-brand_primary text-white'
                    : 'bg-white text-brand_primary border border-brand_accent hover:bg-gray-800 hover:text-white'
                }`}
              >
                {period === '3m' && '3 Meses'}
                {period === '6m' && '6 Meses'}
                {period === '12m' && '12 Meses'}
              </button>
            ))}
          </div>

          {/* Currency Display Toggle */}
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrencyDisplay('UF')}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                currencyDisplay === 'UF'
                  ? 'bg-brand_beige text-brand_primary border border-brand_accent'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              UF
            </button>
            <button
              onClick={() => setCurrencyDisplay('CLP')}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                currencyDisplay === 'CLP'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              CLP
            </button>
            <button
              onClick={() => setCurrencyDisplay('BOTH')}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                currencyDisplay === 'BOTH'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
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
                  ? 'bg-brand_yellow text-brand_primary'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Vista Mensual
            </button>
            <button
              onClick={() => setViewType('detailed')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewType === 'detailed'
                  ? 'bg-brand_yellow text-brand_primary'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Vista Detallada
            </button>
          </div>
        </div>

        {/* Payment Filter (only show in detailed view) */}
        {viewType === 'detailed' && (
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-2">
                <Filter className="text-gray-600" size={16} />
                <span className="text-sm font-medium text-gray-700">Filtrar por estado:</span>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPaymentFilter('all')}
                  className={`px-3 py-1 text-sm rounded-lg font-medium transition-colors ${
                    paymentFilter === 'all'
                      ? 'bg-brand_primary text-white'
                      : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Todas
                </button>
                <button
                  onClick={() => setPaymentFilter('due_unpaid')}
                  className={`px-3 py-1 text-sm rounded-lg font-medium transition-colors ${
                    paymentFilter === 'due_unpaid'
                      ? 'bg-red-100 text-red-800 border border-red-300'
                      : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Vencidas sin pagar
                </button>
                <button
                  onClick={() => setPaymentFilter('due_paid')}
                  className={`px-3 py-1 text-sm rounded-lg font-medium transition-colors ${
                    paymentFilter === 'due_paid'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Vencidas pagadas
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards - ALL CONTRACTS TOTALS */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Resumen de Todos los Contratos</h3>
          <span className="text-sm text-gray-500">({getAllContractsTotals().contractCount} contratos incluidos en flujo)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-brand_beige border border-brand_accent rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-brand_primary">Total de Contratos</p>
                <p className="text-2xl font-bold text-brand_primary">{formatCurrency(getAllContractsTotals().total.uf, 'UF', getAllContractsTotals().total.clp)}</p>
                <p className="text-xs text-brand_accent mt-1">Valor total de todos los contratos</p>
              </div>
              <TrendingUp className="text-brand_accent" size={24} />
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-600">Total Pagado</p>
                <p className="text-2xl font-bold text-amber-900">{formatCurrency(getAllContractsTotals().paid.uf, 'UF', getAllContractsTotals().paid.clp)}</p>
                <p className="text-xs text-amber-600 mt-1">Cuotas ya pagadas</p>
              </div>
              <CheckCircle className="text-brand_accent" size={24} />
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-600">Total Pendiente</p>
                <p className="text-2xl font-bold text-yellow-900">{formatCurrency(getAllContractsTotals().pending.uf, 'UF', getAllContractsTotals().pending.clp)}</p>
                <p className="text-xs text-yellow-600 mt-1">Cuotas por cobrar</p>
              </div>
              <Calendar className="text-yellow-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Period-based Summary Cards */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Flujo de Caja - Próximos {selectedPeriod === '3m' ? '3' : selectedPeriod === '6m' ? '6' : '12'} Meses</h3>
          <span className="text-sm text-gray-500">Solo cuotas vencen en el período seleccionado</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-brand_beige border border-brand_accent rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-brand_primary">Proyectado ({selectedPeriod === '3m' ? '3' : selectedPeriod === '6m' ? '6' : '12'} meses)</p>
                <p className="text-2xl font-bold text-brand_primary">{formatCurrency(getTotalProjected().uf, 'UF', getTotalProjected().clp)}</p>
                <p className="text-xs text-brand_accent mt-1">Cuotas que vencen en período</p>
              </div>
              <TrendingUp className="text-brand_accent" size={24} />
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-600">Pagado (período)</p>
                <p className="text-2xl font-bold text-amber-900">{formatCurrency(getTotalPaid().uf, 'UF', getTotalPaid().clp)}</p>
                <p className="text-xs text-amber-600 mt-1">Cuotas pagadas en período</p>
              </div>
              <CheckCircle className="text-brand_accent" size={24} />
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-600">Pendiente (período)</p>
                <p className="text-2xl font-bold text-yellow-900">{formatCurrency(getTotalPending().uf, 'UF', getTotalPending().clp)}</p>
                <p className="text-xs text-yellow-600 mt-1">Cuotas pendientes en período</p>
              </div>
              <Calendar className="text-yellow-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Overdue Cuotas Card */}
      <div className="grid grid-cols-1 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-600">Cuotas Vencidas</p>
              <p className="text-2xl font-bold text-red-900">{overdueCuotas.length}</p>
              <p className="text-xs text-red-600 mt-1">Cuotas que ya pasaron su fecha límite</p>
            </div>
            <AlertCircle className="text-red-600" size={24} />
          </div>
        </div>
      </div>

      {/* Overdue Alerts */}
      {overdueCuotas.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <AlertCircle className="text-red-600" size={20} />
              <h3 className="font-semibold text-red-800">Cuotas Vencidas ({overdueCuotas.length})</h3>
            </div>
            {overdueCuotas.length > 5 && (
              <button
                onClick={() => setShowAllOverdue(!showAllOverdue)}
                className="flex items-center space-x-1 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors text-sm font-medium"
              >
                <span>{showAllOverdue ? 'Ver menos' : 'Ver todas'}</span>
                <svg 
                  className={`w-4 h-4 transition-transform ${showAllOverdue ? 'rotate-180' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
          <div className="space-y-2">
            {(showAllOverdue ? overdueCuotas : overdueCuotas.slice(0, 5)).map(({ contrato, cuota }, index) => (
              <div key={`${contrato.id}-${cuota.id}`} className="flex items-center justify-between bg-white p-3 rounded border">
                <div>
                  <p className="font-medium text-gray-900">{contrato.clientes.nombre_legal}</p>
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
            {!showAllOverdue && overdueCuotas.length > 5 && (
              <div className="bg-gray-50 border border-gray-200 rounded p-3 text-center">
                <p className="text-sm text-gray-600">
                  ... y {overdueCuotas.length - 5} cuotas vencidas más
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Haz clic en &quot;Ver todas&quot; arriba para mostrar todas las cuotas vencidas
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cash Flow Table/Timeline */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-brand_primary">
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
                    <h4 className="text-lg font-semibold text-brand_primary">
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
                      <p className="text-sm font-medium text-amber-600">Pagado</p>
                      <p className="text-lg font-semibold text-amber-900">
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
              <table className="w-full border-collapse min-w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-2 md:px-4 font-semibold text-brand_primary whitespace-nowrap">Fecha</th>
                    <th className="text-left py-3 px-2 md:px-4 font-semibold text-brand_primary">Cliente</th>
                    <th className="text-left py-3 px-2 md:px-4 font-semibold text-brand_primary whitespace-nowrap">Contrato</th>
                    <th className="text-left py-3 px-2 md:px-4 font-semibold text-brand_primary whitespace-nowrap">Cuota</th>
                    <th className="text-left py-3 px-2 md:px-4 font-semibold text-brand_primary">Monto</th>
                    <th className="text-left py-3 px-2 md:px-4 font-semibold text-brand_primary">Estado</th>
                    <th className="text-left py-3 px-2 md:px-4 font-semibold text-brand_primary">Factura</th>
                    <th className="text-left py-3 px-2 md:px-4 font-semibold text-brand_primary">Pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {cashFlow.map(monthItem => 
                    filterCuotas(monthItem.cuotas)
                      .sort((a, b) => a.cuota.fecha_vencimiento.localeCompare(b.cuota.fecha_vencimiento))
                      .map(({ contrato, cuota, monto_clp }, index) => (
                        <tr key={`${contrato.id}-${cuota.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-2 md:px-4 whitespace-nowrap text-sm">{formatDate(cuota.fecha_vencimiento)}</td>
                          <td className="py-3 px-2 md:px-4">
                            <div>
                              <div className="font-medium text-sm">{contrato.clientes.nombre_legal}</div>
                              <div className="text-xs text-gray-500">{contrato.clientes.nombre_fantasia}</div>
                            </div>
                          </td>
                          <td className="py-3 px-2 md:px-4 whitespace-nowrap text-sm">{contrato.numero_contrato}</td>
                          <td className="py-3 px-2 md:px-4 whitespace-nowrap text-sm">Cuota {cuota.numero_cuota}</td>
                          <td className="py-3 px-2 md:px-4 font-medium text-sm">{formatCurrency(cuota.monto_uf, contrato.tipo_moneda, monto_clp)}</td>
                          <td className="py-3 px-2 md:px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                              cuota.pagada
                                ? 'bg-amber-100 text-amber-800'
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
                          <td className="py-3 px-2 md:px-4">
                            <div className="flex items-center justify-center">
                              {cuota.factura_url ? (
                                <a
                                  href={cuota.factura_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-brand_primary hover:text-gray-700 underline text-xs"
                                >
                                  Ver
                                </a>
                              ) : (
                                <label className="cursor-pointer">
                                  <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        handleInvoiceUpload(cuota.id, file);
                                      }
                                    }}
                                    className="hidden"
                                  />
                                  <div className="flex items-center justify-center w-8 h-8 bg-brand_beige hover:bg-amber-50 rounded-lg transition-colors">
                                    {uploadingInvoice === cuota.id ? (
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand_primary"></div>
                                    ) : (
                                      <Upload className="text-brand_primary" size={16} />
                                    )}
                                  </div>
                                </label>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-2 md:px-4">
                            <div className="flex items-center justify-center">
                              <button
                                onClick={() => handlePaymentStatusToggle(cuota.id, cuota.factura_pagada || false)}
                                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                                  cuota.factura_pagada
                                    ? 'bg-amber-100 hover:bg-amber-200 text-brand_accent'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-400'
                                }`}
                              >
                                <Check size={16} />
                              </button>
                            </div>
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