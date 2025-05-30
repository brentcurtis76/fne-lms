import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Save, FileText, Calendar, DollarSign, Download, Users } from 'lucide-react';
import jsPDF from 'jspdf';
import { toast } from 'react-hot-toast';
import { generateAnnexFromTemplate } from '../../lib/annex-template';

interface Programa {
  id: string;
  nombre: string;
  descripcion: string;
  horas_totales: number;
  modalidad: string;
}

interface Cliente {
  id: string;
  nombre_legal: string;
  nombre_fantasia: string;
  rut: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  nombre_representante: string;
  rut_representante?: string;
  fecha_escritura?: string;
  nombre_notario?: string;
  comuna_notaria?: string;
}

interface Contrato {
  id: string;
  numero_contrato: string;
  fecha_contrato: string;
  cliente_id: string;
  programa_id: string;
  precio_total_uf: number;
  tipo_moneda?: 'UF' | 'CLP';
  clientes: Cliente;
  programas: Programa;
}

interface CuotaForm {
  numero_cuota: number;
  fecha_vencimiento: string;
  monto: number;
}

interface AnnexFormProps {
  clientes: Cliente[];
  editingAnnex?: any; // Annex being edited
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AnnexForm({ clientes, editingAnnex, onSuccess, onCancel }: AnnexFormProps) {
  // Form states
  const [loading, setLoading] = useState(false);
  const [loadingParent, setLoadingParent] = useState(false);
  const [step, setStep] = useState<'cliente' | 'contrato' | 'anexo' | 'cuotas'>('cliente');
  
  // Client selection
  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [clienteContratos, setClienteContratos] = useState<Contrato[]>([]);
  
  // Contract selection
  const [selectedContratoId, setSelectedContratoId] = useState('');
  const [selectedContrato, setSelectedContrato] = useState<Contrato | null>(null);
  
  // Annex form
  const [annexForm, setAnnexForm] = useState({
    anexo_fecha: new Date().toISOString().split('T')[0],
    numero_participantes: 1,
    nombre_ciclo: 'Primer Ciclo' as 'Primer Ciclo' | 'Segundo Ciclo' | 'Tercer Ciclo' | 'Equipo Directivo',
    precio_total_uf: 0,
    tipo_moneda: 'UF' as 'UF' | 'CLP',
  });
  
  // Installments form
  const [cuotas, setCuotas] = useState<CuotaForm[]>([
    { numero_cuota: 1, fecha_vencimiento: '', monto: 0 }
  ]);

  // Populate form when editing an annex
  useEffect(() => {
    if (editingAnnex) {
      // Load parent contract data first
      loadParentContract();
    }
  }, [editingAnnex]);

  const loadParentContract = async () => {
    if (!editingAnnex?.parent_contrato_id) return;
    
    setLoadingParent(true);
    try {
      const { data, error } = await supabase
        .from('contratos')
        .select(`
          *,
          clientes(*),
          programas(*)
        `)
        .eq('id', editingAnnex.parent_contrato_id)
        .single();

      if (error) throw error;

      // Set parent contract as selected
      setSelectedContrato(data);
      setSelectedClienteId(data.cliente_id);
      setSelectedContratoId(data.id);
      
      // Populate annex form
      setAnnexForm({
        anexo_fecha: editingAnnex.anexo_fecha || new Date().toISOString().split('T')[0],
        numero_participantes: editingAnnex.numero_participantes || 1,
        nombre_ciclo: editingAnnex.nombre_ciclo || 'Primer Ciclo',
        precio_total_uf: editingAnnex.precio_total_uf || 0,
        tipo_moneda: editingAnnex.tipo_moneda || 'UF',
      });
      
      // Populate installments
      if (editingAnnex.cuotas && editingAnnex.cuotas.length > 0) {
        const cuotasData = editingAnnex.cuotas.map((cuota: any) => ({
          numero_cuota: cuota.numero_cuota,
          fecha_vencimiento: cuota.fecha_vencimiento,
          monto: cuota.monto_uf || 0
        }));
        setCuotas(cuotasData);
      }
      
      // Skip to the annex details step when editing
      setStep('anexo');
      
    } catch (error) {
      console.error('Error loading parent contract:', error);
      toast.error('Error al cargar el contrato padre');
    } finally {
      setLoadingParent(false);
    }
  };

  // Load contracts when client is selected
  useEffect(() => {
    if (selectedClienteId) {
      loadClienteContratos();
    }
  }, [selectedClienteId]);

  const loadClienteContratos = async () => {
    try {
      const { data, error } = await supabase
        .from('contratos')
        .select(`
          *,
          clientes(*),
          programas(*)
        `)
        .eq('cliente_id', selectedClienteId)
        .eq('is_anexo', false) // Only show main contracts, not annexes
        .order('fecha_contrato', { ascending: false });

      if (error) throw error;
      setClienteContratos(data || []);
    } catch (error) {
      console.error('Error loading contracts:', error);
      toast.error('Error al cargar contratos del cliente');
    }
  };

  const handleClienteSelect = (clienteId: string) => {
    setSelectedClienteId(clienteId);
    setSelectedContratoId('');
    setSelectedContrato(null);
  };

  const handleContratoSelect = (contratoId: string) => {
    setSelectedContratoId(contratoId);
    const contrato = clienteContratos.find(c => c.id === contratoId);
    setSelectedContrato(contrato || null);
    
    // Initialize price based on parent contract
    if (contrato) {
      setAnnexForm(prev => ({
        ...prev,
        tipo_moneda: contrato.tipo_moneda || 'UF'
      }));
    }
  };

  const addCuota = () => {
    setCuotas([...cuotas, {
      numero_cuota: cuotas.length + 1,
      fecha_vencimiento: '',
      monto: 0
    }]);
  };

  const removeCuota = (index: number) => {
    if (cuotas.length > 1) {
      setCuotas(cuotas.filter((_, i) => i !== index));
      // Update cuota numbers
      const updatedCuotas = cuotas.filter((_, i) => i !== index).map((cuota, idx) => ({
        ...cuota,
        numero_cuota: idx + 1
      }));
      setCuotas(updatedCuotas);
    }
  };

  const updateCuota = (index: number, field: keyof CuotaForm, value: string | number) => {
    const updatedCuotas = [...cuotas];
    updatedCuotas[index] = { ...updatedCuotas[index], [field]: value };
    setCuotas(updatedCuotas);
  };

  const getNextAnexoNumber = async (parentContratoId: string): Promise<number> => {
    try {
      const { data, error } = await supabase
        .from('contratos')
        .select('anexo_numero')
        .eq('parent_contrato_id', parentContratoId)
        .eq('is_anexo', true)
        .order('anexo_numero', { ascending: false })
        .limit(1);

      if (error) throw error;
      
      return (data && data.length > 0) ? (data[0].anexo_numero || 0) + 1 : 1;
    } catch (error) {
      console.error('Error getting next annex number:', error);
      return 1;
    }
  };

  const generateAnexoNumeroContrato = (parentNumero: string, anexoNumero: number): string => {
    return `${parentNumero}A${anexoNumero}`;
  };

  const handleSaveAnnex = async () => {
    setLoading(true);
    try {
      // For editing mode, we need the parent contract info
      if (!editingAnnex && !selectedContrato) {
        throw new Error('No se ha seleccionado un contrato padre');
      }

      // Validation
      if (!annexForm.anexo_fecha) {
        toast.error('La fecha del anexo es obligatoria');
        return;
      }

      if (annexForm.numero_participantes < 1) {
        toast.error('Debe haber al menos 1 participante');
        return;
      }

      if (annexForm.precio_total_uf <= 0) {
        toast.error('El precio total debe ser mayor a 0');
        return;
      }

      const validCuotas = cuotas.filter(cuota => 
        cuota.fecha_vencimiento && cuota.monto > 0
      );

      if (validCuotas.length === 0) {
        toast.error('Debe agregar al menos una cuota válida');
        return;
      }

      const totalCuotas = validCuotas.reduce((sum, cuota) => sum + cuota.monto, 0);
      if (Math.abs(totalCuotas - annexForm.precio_total_uf) > 0.01) {
        toast.error('La suma de las cuotas debe ser igual al precio total');
        return;
      }

      if (editingAnnex) {
        // EDITING MODE
        
        // Update annex contract
        const { error: annexError } = await supabase
          .from('contratos')
          .update({
            anexo_fecha: annexForm.anexo_fecha,
            numero_participantes: annexForm.numero_participantes,
            nombre_ciclo: annexForm.nombre_ciclo,
            precio_total_uf: annexForm.precio_total_uf,
            tipo_moneda: annexForm.tipo_moneda,
          })
          .eq('id', editingAnnex.id);

        if (annexError) throw annexError;

        // Delete existing installments and create new ones
        const { error: deleteError } = await supabase
          .from('cuotas')
          .delete()
          .eq('contrato_id', editingAnnex.id);
          
        if (deleteError) throw deleteError;

        // Create new installments
        const cuotasData = validCuotas.map(cuota => ({
          contrato_id: editingAnnex.id,
          numero_cuota: cuota.numero_cuota,
          fecha_vencimiento: cuota.fecha_vencimiento,
          monto_uf: cuota.monto,
          pagada: false
        }));

        const { error: cuotasError } = await supabase
          .from('cuotas')
          .insert(cuotasData);

        if (cuotasError) throw cuotasError;

        toast.success('Anexo actualizado exitosamente');
        
      } else {
        // CREATE MODE
        
        // Get next annex number
        const anexoNumero = await getNextAnexoNumber(selectedContrato.id);
        const numeroContrato = generateAnexoNumeroContrato(selectedContrato.numero_contrato, anexoNumero);

        // Create annex contract
        const { data: newAnnex, error: annexError } = await supabase
          .from('contratos')
          .insert([{
            numero_contrato: numeroContrato,
            fecha_contrato: annexForm.anexo_fecha,
            cliente_id: selectedContrato.cliente_id,
            programa_id: selectedContrato.programa_id,
            precio_total_uf: annexForm.precio_total_uf,
            tipo_moneda: annexForm.tipo_moneda,
            is_anexo: true,
            parent_contrato_id: selectedContrato.id,
            anexo_numero: anexoNumero,
            anexo_fecha: annexForm.anexo_fecha,
            numero_participantes: annexForm.numero_participantes,
            nombre_ciclo: annexForm.nombre_ciclo,
            estado: 'pendiente',
            incluir_en_flujo: true
          }])
          .select()
          .single();

        if (annexError) throw annexError;

        // Create installments
        const cuotasData = validCuotas.map(cuota => ({
          contrato_id: newAnnex.id,
          numero_cuota: cuota.numero_cuota,
          fecha_vencimiento: cuota.fecha_vencimiento,
          monto_uf: cuota.monto,
          pagada: false
        }));

        const { error: cuotasError } = await supabase
          .from('cuotas')
          .insert(cuotasData);

        if (cuotasError) throw cuotasError;

        toast.success('Anexo creado exitosamente');
      }
      
      onSuccess();
      
    } catch (error) {
      console.error('Error saving annex:', error);
      toast.error('Error al guardar el anexo: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const generatePreviewPDF = async () => {
    if (!selectedContrato) return;
    
    try {
      // Get next annex number for preview
      const anexoNumero = await getNextAnexoNumber(selectedContrato.id);
      
      // Prepare data for template
      const annexData = {
        ...annexForm,
        anexo_numero: anexoNumero,
        cuotas: cuotas.filter(c => c.fecha_vencimiento && c.monto > 0),
        parentContract: {
          ...selectedContrato,
          cliente: selectedContrato.clientes,
          programa: selectedContrato.programas
        }
      };

      const contractHTML = generateAnnexFromTemplate(annexData);
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // Clean and format the HTML for better PDF rendering
      const cleanHTML = contractHTML
        .replace(/1\. Ingreso de nuevos destinatarios/g, '<h3 style="font-weight: bold; margin: 20px 0 10px 0;">1. Ingreso de nuevos destinatarios</h3>')
        .replace(/2\. Valor y forma de pago/g, '<h3 style="font-weight: bold; margin: 20px 0 10px 0;">2. Valor y forma de pago</h3>')
        .replace(/3\. Ratificación del contrato original/g, '<h3 style="font-weight: bold; margin: 20px 0 10px 0;">3. Ratificación del contrato original</h3>')
        .replace(/4\. Firma de conformidad/g, '<h3 style="font-weight: bold; margin: 20px 0 10px 0;">4. Firma de conformidad</h3>')
        .replace(/\n/g, '<br>');
      
      // Create a temporary element to render the HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = cleanHTML;
      tempDiv.style.width = '800px';
      tempDiv.style.fontFamily = 'Arial, sans-serif';
      tempDiv.style.fontSize = '12px';
      tempDiv.style.lineHeight = '1.6';
      tempDiv.style.padding = '20px';
      tempDiv.style.color = '#000';
      tempDiv.style.backgroundColor = '#fff';
      
      // Style all paragraphs
      const elements = tempDiv.querySelectorAll('*');
      elements.forEach(el => {
        const htmlEl = el as HTMLElement;
        if (htmlEl.tagName === 'P') {
          htmlEl.style.textAlign = 'justify';
          htmlEl.style.marginBottom = '15px';
          htmlEl.style.lineHeight = '1.6';
        }
        if (htmlEl.tagName === 'H1' || htmlEl.tagName === 'H2' || htmlEl.tagName === 'H3' || htmlEl.tagName === 'H4') {
          htmlEl.style.fontWeight = 'bold';
          htmlEl.style.margin = '15px 0 10px 0';
        }
      });
      
      // Add to DOM temporarily for rendering
      document.body.appendChild(tempDiv);
      
      pdf.html(tempDiv, {
        callback: function (pdf) {
          // Remove temporary element
          document.body.removeChild(tempDiv);
          pdf.save(`anexo-${selectedContrato.numero_contrato}A${anexoNumero}-preview.pdf`);
        },
        x: 10,
        y: 10,
        width: 180,
        windowWidth: 800,
        html2canvas: {
          scale: 1.0,
          useCORS: true,
          letterRendering: true
        }
      });
      
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error('Error al generar la vista previa');
    }
  };

  const nextStep = () => {
    if (step === 'cliente' && !selectedClienteId) {
      toast.error('Seleccione un cliente');
      return;
    }
    if (step === 'contrato' && !selectedContratoId) {
      toast.error('Seleccione un contrato');
      return;
    }
    
    const steps: typeof step[] = ['cliente', 'contrato', 'anexo', 'cuotas'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const steps: typeof step[] = ['cliente', 'contrato', 'anexo', 'cuotas'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  const cycleOptions = [
    'Primer Ciclo',
    'Segundo Ciclo', 
    'Tercer Ciclo',
    'Equipo Directivo'
  ] as const;

  return (
    <div className="bg-white rounded-lg shadow-md">
      {/* Header with steps */}
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-xl font-semibold text-brand_blue mb-4">
          {editingAnnex ? 'Editar Anexo' : 'Crear Nuevo Anexo'}
        </h2>
        
        {/* Step indicator */}
        <div className="flex items-center space-x-4">
          {[
            { key: 'cliente', label: 'Cliente', icon: Users },
            { key: 'contrato', label: 'Contrato', icon: FileText },
            { key: 'anexo', label: 'Anexo', icon: Calendar },
            { key: 'cuotas', label: 'Cuotas', icon: DollarSign }
          ].map(({ key, label, icon: Icon }, index) => {
            const currentStepIndex = ['cliente', 'contrato', 'anexo', 'cuotas'].indexOf(step);
            const isCompleted = editingAnnex ? 
              (key === 'cliente' || key === 'contrato' || currentStepIndex > index) :
              currentStepIndex > index;
            const isActive = step === key;
            const isDisabled = editingAnnex && (key === 'cliente' || key === 'contrato');
            
            return (
            <div key={key} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                isActive ? 'bg-brand_blue text-white border-brand_blue' :
                isCompleted ? 'bg-green-500 text-white border-green-500' :
                isDisabled ? 'bg-gray-400 text-white border-gray-400' :
                'bg-gray-200 text-gray-500 border-gray-300'
              }`}>
                <Icon size={16} />
              </div>
              <span className={`ml-2 text-sm font-medium ${
                isActive ? 'text-brand_blue' : 
                isCompleted ? 'text-green-600' :
                isDisabled ? 'text-gray-400' :
                'text-gray-500'
              }`}>
                {label}
              </span>
              {index < 3 && <div className="ml-4 w-8 h-px bg-gray-300"></div>}
            </div>
            );
          })}
        </div>
      </div>

      <div className="p-6">
        {/* Loading state when editing */}
        {editingAnnex && loadingParent && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
              <p className="mt-4 text-brand_blue font-medium">Cargando datos del anexo...</p>
            </div>
          </div>
        )}

        {/* Step 1: Client Selection */}
        {step === 'cliente' && !loadingParent && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-brand_blue">Seleccionar Cliente</h3>
            <div className="grid grid-cols-1 gap-4 max-h-96 overflow-y-auto">
              {clientes.map(cliente => (
                <div
                  key={cliente.id}
                  onClick={() => handleClienteSelect(cliente.id)}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedClienteId === cliente.id 
                      ? 'border-brand_blue bg-blue-50' 
                      : 'border-gray-200 hover:border-brand_blue hover:bg-blue-50'
                  }`}
                >
                  <div className="font-semibold text-brand_blue">{cliente.nombre_legal}</div>
                  <div className="text-sm text-gray-600">{cliente.nombre_fantasia}</div>
                  <div className="text-sm text-gray-500">RUT: {cliente.rut}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Contract Selection */}
        {step === 'contrato' && !loadingParent && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-brand_blue">
              Seleccionar Contrato de {clientes.find(c => c.id === selectedClienteId)?.nombre_legal}
            </h3>
            <div className="grid grid-cols-1 gap-4 max-h-96 overflow-y-auto">
              {clienteContratos.map(contrato => (
                <div
                  key={contrato.id}
                  onClick={() => handleContratoSelect(contrato.id)}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedContratoId === contrato.id 
                      ? 'border-brand_blue bg-blue-50' 
                      : 'border-gray-200 hover:border-brand_blue hover:bg-blue-50'
                  }`}
                >
                  <div className="font-semibold text-brand_blue">{contrato.numero_contrato}</div>
                  <div className="text-sm text-gray-600">{contrato.programas.nombre}</div>
                  <div className="text-sm text-gray-500">
                    Fecha: {new Date(contrato.fecha_contrato).toLocaleDateString('es-CL')}
                  </div>
                  <div className="text-sm text-gray-500">
                    Valor: {contrato.tipo_moneda === 'CLP' ? '$' : 'UF '}{contrato.precio_total_uf.toLocaleString('es-CL')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Annex Details */}
        {step === 'anexo' && selectedContrato && !loadingParent && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-brand_blue">
              Detalles del Anexo para {selectedContrato.numero_contrato}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha del Anexo *
                </label>
                <input
                  type="date"
                  value={annexForm.anexo_fecha}
                  onChange={(e) => setAnnexForm({ ...annexForm, anexo_fecha: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Número de Participantes *
                </label>
                <input
                  type="number"
                  min="1"
                  value={annexForm.numero_participantes}
                  onChange={(e) => setAnnexForm({ ...annexForm, numero_participantes: parseInt(e.target.value) || 1 })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Ciclo *
                </label>
                <select
                  value={annexForm.nombre_ciclo}
                  onChange={(e) => setAnnexForm({ ...annexForm, nombre_ciclo: e.target.value as typeof annexForm.nombre_ciclo })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                >
                  {cycleOptions.map(cycle => (
                    <option key={cycle} value={cycle}>{cycle}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Moneda *
                </label>
                <select
                  value={annexForm.tipo_moneda}
                  onChange={(e) => setAnnexForm({ ...annexForm, tipo_moneda: e.target.value as 'UF' | 'CLP' })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                >
                  <option value="UF">UF (Unidad de Fomento)</option>
                  <option value="CLP">CLP (Pesos Chilenos)</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Precio Total ({annexForm.tipo_moneda}) *
                </label>
                <input
                  type="number"
                  step={annexForm.tipo_moneda === 'UF' ? '0.01' : '1'}
                  min="0"
                  value={annexForm.precio_total_uf}
                  onChange={(e) => setAnnexForm({ ...annexForm, precio_total_uf: parseFloat(e.target.value) || 0 })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Installments */}
        {step === 'cuotas' && !loadingParent && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-brand_blue">Configurar Cuotas</h3>
              <button
                type="button"
                onClick={addCuota}
                className="flex items-center px-4 py-2 bg-brand_blue text-white rounded-lg hover:bg-brand_blue/90 transition-colors"
              >
                <Plus size={16} className="mr-1" />
                Agregar Cuota
              </button>
            </div>

            <div className="space-y-4">
              {cuotas.map((cuota, index) => (
                <div key={index} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-brand_blue">Cuota {cuota.numero_cuota}</h4>
                    {cuotas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCuota(index)}
                        className="text-red-600 hover:text-red-800 transition-colors"
                        title="Eliminar cuota"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Fecha de Vencimiento *
                      </label>
                      <input
                        type="date"
                        value={cuota.fecha_vencimiento}
                        onChange={(e) => updateCuota(index, 'fecha_vencimiento', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Monto ({annexForm.tipo_moneda}) *
                      </label>
                      <input
                        type="number"
                        step={annexForm.tipo_moneda === 'UF' ? '0.01' : '1'}
                        min="0"
                        value={cuota.monto}
                        onChange={(e) => updateCuota(index, 'monto', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600">
                <strong>Total del Anexo:</strong> {annexForm.tipo_moneda} {annexForm.precio_total_uf.toLocaleString('es-CL', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-sm text-gray-600">
                <strong>Suma de Cuotas:</strong> {annexForm.tipo_moneda} {cuotas.reduce((sum, cuota) => sum + cuota.monto, 0).toLocaleString('es-CL', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!loadingParent && (
        <div className="flex justify-between items-center pt-6 border-t border-gray-200">
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            {step !== 'cliente' && (
              <button
                type="button"
                onClick={prevStep}
                className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Anterior
              </button>
            )}
          </div>
          
          <div className="flex space-x-3">
            {step === 'cuotas' && (
              <button
                type="button"
                onClick={generatePreviewPDF}
                className="flex items-center px-6 py-2 bg-brand_yellow text-brand_blue rounded-lg hover:bg-brand_yellow/90 transition-colors"
              >
                <Download size={16} className="mr-2" />
                Vista Previa
              </button>
            )}
            
            {step === 'cuotas' ? (
              <button
                type="button"
                onClick={handleSaveAnnex}
                disabled={loading}
                className="flex items-center px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save size={16} className="mr-2" />
                    {editingAnnex ? 'Actualizar Anexo' : 'Crear Anexo'}
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={nextStep}
                className="px-6 py-2 bg-brand_blue text-white rounded-lg hover:bg-brand_blue/90 transition-colors"
              >
                Siguiente
              </button>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}