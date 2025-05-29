import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Save, FileText, Calendar, DollarSign, Download } from 'lucide-react';
import jsPDF from 'jspdf';

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

interface CuotaForm {
  numero_cuota: number;
  fecha_vencimiento: string;
  monto: number; // Keep as monto in form, but save as monto_uf to database
}

interface ContractFormProps {
  programas: Programa[];
  clientes: Cliente[];
  editingContract?: any; // Contract being edited
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ContractForm({ programas, clientes, editingContract, onSuccess, onCancel }: ContractFormProps) {
  // Form states
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'cliente' | 'contrato' | 'cuotas'>('cliente');
  
  // Client form
  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [clienteForm, setClienteForm] = useState({
    nombre_legal: '',
    nombre_fantasia: '',
    rut: '',
    direccion: '',
    comuna: '',
    ciudad: '',
    nombre_representante: '',
    rut_representante: '',
    fecha_escritura: '',
    nombre_notario: '',
    comuna_notaria: ''
  });
  
  // Contract form
  const [contractForm, setContractForm] = useState({
    numero_contrato: '',
    fecha_contrato: new Date().toISOString().split('T')[0],
    fecha_fin: '',
    programa_id: '',
    precio_total_uf: 0,
    tipo_moneda: 'UF' as 'UF' | 'CLP'
  });
  
  // Installments form
  const [cuotas, setCuotas] = useState<CuotaForm[]>([
    { numero_cuota: 1, fecha_vencimiento: '', monto: 0 }
  ]);

  // Populate form when editing
  useEffect(() => {
    if (editingContract) {
      // Populate client form
      setClienteForm({
        nombre_legal: editingContract.clientes.nombre_legal || '',
        nombre_fantasia: editingContract.clientes.nombre_fantasia || '',
        rut: editingContract.clientes.rut || '',
        direccion: editingContract.clientes.direccion || '',
        comuna: editingContract.clientes.comuna || '',
        ciudad: editingContract.clientes.ciudad || '',
        nombre_representante: editingContract.clientes.nombre_representante || '',
        rut_representante: editingContract.clientes.rut_representante || '',
        fecha_escritura: editingContract.clientes.fecha_escritura || '',
        nombre_notario: editingContract.clientes.nombre_notario || '',
        comuna_notaria: editingContract.clientes.comuna_notaria || ''
      });
      
      // Populate contract form
      setContractForm({
        numero_contrato: editingContract.numero_contrato || '',
        fecha_contrato: editingContract.fecha_contrato || '',
        fecha_fin: editingContract.fecha_fin || '',
        programa_id: editingContract.programa_id || '',
        precio_total_uf: editingContract.precio_total_uf || 0,
        tipo_moneda: editingContract.tipo_moneda || 'UF'
      });
      
      // Set selected client
      setSelectedClienteId(editingContract.cliente_id || '');
      
      // Populate installments
      if (editingContract.cuotas && editingContract.cuotas.length > 0) {
        const cuotasData = editingContract.cuotas.map((cuota: any) => ({
          numero_cuota: cuota.numero_cuota,
          fecha_vencimiento: cuota.fecha_vencimiento,
          monto: cuota.monto_uf || 0
        }));
        setCuotas(cuotasData);
      }
    }
  }, [editingContract]);

  // Generate contract number automatically
  useEffect(() => {
    if (!editingContract) { // Only generate for new contracts
      const generateContractNumber = () => {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      setContractForm(prev => ({
        ...prev,
        numero_contrato: `FNE-${year}-${month}-${random}`
      }));
    };
    
    generateContractNumber();
    }
  }, [editingContract]);

  // Handle client selection
  const handleClienteSelection = (clienteId: string) => {
    const cliente = clientes.find(c => c.id === clienteId);
    if (cliente) {
      setClienteForm({
        nombre_legal: cliente.nombre_legal,
        nombre_fantasia: cliente.nombre_fantasia,
        rut: cliente.rut,
        direccion: cliente.direccion,
        comuna: cliente.comuna || '',
        ciudad: cliente.ciudad || '',
        nombre_representante: cliente.nombre_representante,
        rut_representante: cliente.rut_representante || '',
        fecha_escritura: cliente.fecha_escritura || '',
        nombre_notario: cliente.nombre_notario || '',
        comuna_notaria: cliente.comuna_notaria || ''
      });
    }
    setSelectedClienteId(clienteId);
  };

  // Calculate installments automatically
  const calculateCuotas = () => {
    const totalAmount = contractForm.precio_total_uf;
    const numCuotas = cuotas.length;
    
    if (totalAmount > 0 && numCuotas > 0) {
      const amountPerCuota = totalAmount / numCuotas;
      const updatedCuotas = cuotas.map((cuota, index) => ({
        ...cuota,
        monto: parseFloat(amountPerCuota.toFixed(2))
      }));
      setCuotas(updatedCuotas);
    }
  };

  // Add new installment
  const addCuota = () => {
    if (cuotas.length < 12) {
      setCuotas([...cuotas, {
        numero_cuota: cuotas.length + 1,
        fecha_vencimiento: '',
        monto: 0
      }]);
    }
  };

  // Remove installment
  const removeCuota = (index: number) => {
    if (cuotas.length > 1) {
      const updatedCuotas = cuotas
        .filter((_, i) => i !== index)
        .map((cuota, i) => ({ ...cuota, numero_cuota: i + 1 }));
      setCuotas(updatedCuotas);
    }
  };

  // Update installment
  const updateCuota = (index: number, field: keyof CuotaForm, value: string | number) => {
    const updatedCuotas = [...cuotas];
    updatedCuotas[index] = { ...updatedCuotas[index], [field]: value };
    setCuotas(updatedCuotas);
  };

  // Save contract
  const handleSaveContract = async () => {
    setLoading(true);
    try {
      let clienteId = selectedClienteId;
      
      if (editingContract) {
        // EDITING MODE
        
        // Update client data
        const { error: clienteError } = await supabase
          .from('clientes')
          .update(clienteForm)
          .eq('id', editingContract.cliente_id);
          
        if (clienteError) throw clienteError;
        clienteId = editingContract.cliente_id;
        
        // Update contract
        const { error: contratoError } = await supabase
          .from('contratos')
          .update({
            numero_contrato: contractForm.numero_contrato,
            fecha_contrato: contractForm.fecha_contrato,
            fecha_fin: contractForm.fecha_fin,
            programa_id: contractForm.programa_id,
            precio_total_uf: contractForm.precio_total_uf,
            tipo_moneda: contractForm.tipo_moneda
          })
          .eq('id', editingContract.id);

        if (contratoError) throw contratoError;

        // Delete existing installments and create new ones
        const { error: deleteError } = await supabase
          .from('cuotas')
          .delete()
          .eq('contrato_id', editingContract.id);
          
        if (deleteError) throw deleteError;

        // Create new installments
        const cuotasData = cuotas.map(cuota => ({
          contrato_id: editingContract.id,
          numero_cuota: cuota.numero_cuota,
          fecha_vencimiento: cuota.fecha_vencimiento,
          monto_uf: cuota.monto,
          pagada: false
        }));

        const { error: cuotasError } = await supabase
          .from('cuotas')
          .insert(cuotasData);

        if (cuotasError) throw cuotasError;
        
      } else {
        // CREATE MODE
        
        // First, save or update client
        if (!selectedClienteId) {
          // Check if client with this RUT already exists
          const { data: existingCliente, error: checkError } = await supabase
            .from('clientes')
            .select('*')
            .eq('rut', clienteForm.rut)
            .single();
            
          if (checkError && checkError.code !== 'PGRST116') {
            // PGRST116 means no rows found, which is expected for new clients
            throw checkError;
          }
          
          if (existingCliente) {
            // Client already exists - show warning
            const confirmMessage = `⚠️ Ya existe un cliente con el RUT ${clienteForm.rut}:\n\n` +
              `Nombre: ${existingCliente.nombre_legal}\n` +
              `Nombre Fantasía: ${existingCliente.nombre_fantasia}\n` +
              `Ciudad: ${existingCliente.ciudad}\n` +
              `Representante: ${existingCliente.nombre_representante}\n\n` +
              `¿Deseas usar este cliente existente para el contrato?\n\n` +
              `• SÍ: Usará el cliente existente\n` +
              `• NO: Verifica el RUT y corrige los datos`;
            
            if (confirm(confirmMessage)) {
              // User confirmed to use existing client
              clienteId = existingCliente.id;
            } else {
              // User canceled - stop the creation process
              alert('Creación de contrato cancelada. Por favor verifica el RUT del cliente.');
              setLoading(false);
              return;
            }
          } else {
            // Create new client
            const { data: newCliente, error: clienteError } = await supabase
              .from('clientes')
              .insert([clienteForm])
              .select()
              .single();
              
            if (clienteError) throw clienteError;
            clienteId = newCliente.id;
          }
        }

        // Check if contract number already exists
        const { data: existingContract } = await supabase
          .from('contratos')
          .select('id')
          .eq('numero_contrato', contractForm.numero_contrato)
          .single();

        if (existingContract) {
          throw new Error(`El número de contrato "${contractForm.numero_contrato}" ya existe. Por favor, use un número diferente.`);
        }

        // Validate clienteId before saving contract
        if (!clienteId) {
          throw new Error('Error: No se pudo determinar el ID del cliente. Por favor, seleccione o cree un cliente válido.');
        }

        console.log('Creating contract with clienteId:', clienteId); // Debug log

        // Save contract
        const { data: newContrato, error: contratoError } = await supabase
          .from('contratos')
          .insert([{
            numero_contrato: contractForm.numero_contrato,
            fecha_contrato: contractForm.fecha_contrato,
            fecha_fin: contractForm.fecha_fin,
            cliente_id: clienteId,
            programa_id: contractForm.programa_id,
            precio_total_uf: contractForm.precio_total_uf,
            tipo_moneda: contractForm.tipo_moneda
          }])
          .select()
          .single();

        if (contratoError) {
          console.error('Contract insertion error:', contratoError);
          if (contratoError.message.includes('contratos_cliente_id_fkey')) {
            throw new Error(`Error: El cliente seleccionado no existe en la base de datos. Por favor, cree un nuevo cliente o seleccione uno existente.`);
          }
          throw contratoError;
        }

        // Save installments
        const cuotasData = cuotas.map(cuota => ({
          contrato_id: newContrato.id,
          numero_cuota: cuota.numero_cuota,
          fecha_vencimiento: cuota.fecha_vencimiento,
          monto_uf: cuota.monto,
          pagada: false
        }));

        const { error: cuotasError } = await supabase
          .from('cuotas')
          .insert(cuotasData);

        if (cuotasError) throw cuotasError;
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving contract:', error);
      alert('Error al guardar el contrato: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Format currency for display
  const formatCurrency = (amount: number) => {
    return `UF ${amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CL');
  };

  // Generate PDF
  const generateContractPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    let yPos = 20;
    
    // Helper function to add text with automatic wrapping
    const addText = (text: string, x: number, fontSize: number = 10, maxWidth: number = pageWidth - 40) => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, x, yPos);
      yPos += lines.length * (fontSize * 0.4) + 5;
      
      // Check if we need a new page
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
    };
    
    // Center title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    const title = 'CONTRATO DE PRESTACIÓN DE SERVICIOS';
    const titleWidth = doc.getTextWidth(title);
    doc.text(title, (pageWidth - titleWidth) / 2, yPos);
    yPos += 15;
    
    // Contract details
    doc.setFont('helvetica', 'normal');
    addText(`En Santiago de Chile, a ${formatDate(contractForm.fecha_contrato)}, entre FUNDACIÓN NUEVA EDUCACIÓN, RUT N° 65.195.207-5, Organización Técnica de Capacitación OTEC, con domicilio en Avda. Nueva Providencia N° 1881, oficina 2005, Providencia, Santiago, representada por don CRISTIAN RETAMAL VARGAS, cédula nacional de identidad N° 9.554.423-1, ambos en adelante "EL PRESTADOR" y`, 20, 10);
    
    addText(`${clienteForm.nombre_legal}, RUT N° ${clienteForm.rut}, con domicilio en ${clienteForm.direccion}, ${clienteForm.comuna}, ${clienteForm.ciudad}, representado(a) por ${clienteForm.nombre_representante}${clienteForm.rut_representante ? `, RUT N° ${clienteForm.rut_representante}` : ''}${clienteForm.fecha_escritura && clienteForm.nombre_notario ? `, según escritura pública de fecha ${clienteForm.fecha_escritura}, ante notario ${clienteForm.nombre_notario}${clienteForm.comuna_notaria ? `, ${clienteForm.comuna_notaria}` : ''}` : ''}, en adelante "EL CLIENTE", han convenido el siguiente contrato de prestación de servicios:`, 20, 10);
    
    yPos += 5;
    
    // Get selected program
    const selectedPrograma = programas.find(p => p.id === contractForm.programa_id);
    
    // Clauses
    const clauses = [
      {
        title: 'PRIMERO: OBJETO DEL CONTRATO',
        content: `El presente contrato tiene por objeto la prestación de servicios de capacitación correspondiente al programa "${selectedPrograma?.nombre || ''}", el cual se ejecutará en modalidad ${selectedPrograma?.modalidad || ''}, con una duración total de ${selectedPrograma?.horas_totales || 0} horas académicas.`
      },
      {
        title: 'SEGUNDO: DESCRIPCIÓN DEL SERVICIO',
        content: `${selectedPrograma?.descripcion || ''}`
      },
      {
        title: 'TERCERO: VALOR DEL CONTRATO',
        content: `El valor total del presente contrato asciende a ${formatCurrency(contractForm.precio_total_uf)} (${contractForm.precio_total_uf.toLocaleString('es-CL')} Unidades de Fomento), valor que será cancelado según el plan de pagos establecido en la cláusula siguiente.`
      },
      {
        title: 'CUARTO: FORMA DE PAGO',
        content: cuotas && cuotas.length > 0 
          ? `El pago se efectuará en ${cuotas.length} cuotas, según el siguiente detalle:\n\n${cuotas.map(cuota => 
              `Cuota N° ${cuota.numero_cuota}: ${formatCurrency(cuota.monto)} con vencimiento el ${formatDate(cuota.fecha_vencimiento)}`
            ).join('\n')}\n\nLos pagos deberán efectuarse mediante transferencia bancaria a la cuenta corriente que oportunamente informará EL PRESTADOR.`
          : 'El pago se efectuará según condiciones a convenir entre las partes.'
      },
      {
        title: 'QUINTO: LUGAR DE EJECUCIÓN',
        content: `Los servicios se ejecutarán en las dependencias de EL CLIENTE, ubicadas en ${clienteForm.direccion}, ${clienteForm.comuna}, ${clienteForm.ciudad}, y/o en modalidad virtual según corresponda.`
      },
      {
        title: 'SEXTO: PLAZO',
        content: `El presente contrato tendrá una vigencia desde la fecha de su suscripción hasta la completa ejecución de los servicios contratados, lo que se estima ocurrirá dentro de los próximos 12 meses.`
      },
      {
        title: 'SÉPTIMO: OBLIGACIONES DEL PRESTADOR',
        content: `EL PRESTADOR se obliga a: a) Ejecutar los servicios objeto del presente contrato con la diligencia y profesionalismo requeridos; b) Proporcionar el personal docente y técnico calificado; c) Entregar los materiales didácticos necesarios; d) Cumplir con la programación acordada; e) Emitir los certificados correspondientes una vez finalizada la capacitación.`
      },
      {
        title: 'OCTAVO: OBLIGACIONES DEL CLIENTE',
        content: `EL CLIENTE se obliga a: a) Pagar oportunamente las sumas convenidas; b) Proporcionar las facilidades necesarias para la ejecución de los servicios; c) Designar un coordinador o responsable del programa; d) Comunicar oportunamente cualquier modificación que pueda afectar la ejecución del servicio.`
      },
      {
        title: 'NOVENO: TÉRMINO DEL CONTRATO',
        content: `El presente contrato terminará: a) Por cumplimiento íntegro de las obligaciones de ambas partes; b) Por mutuo acuerdo de las partes; c) Por incumplimiento grave de alguna de las partes; d) Por caso fortuito o fuerza mayor que impida la ejecución de los servicios.`
      },
      {
        title: 'DÉCIMO: MODIFICACIONES',
        content: `Cualquier modificación al presente contrato deberá constar por escrito y ser suscrita por ambas partes.`
      },
      {
        title: 'UNDÉCIMO: DOMICILIO',
        content: `Para todos los efectos legales derivados del presente contrato, las partes fijan domicilio en la ciudad de Santiago, sometiéndose a la competencia de sus tribunales ordinarios de justicia.`
      },
      {
        title: 'DUODÉCIMO: LEGISLACIÓN APLICABLE',
        content: `El presente contrato se rige por la legislación chilena vigente.`
      }
    ];
    
    clauses.forEach(clause => {
      doc.setFont('helvetica', 'bold');
      addText(clause.title, 20, 11);
      doc.setFont('helvetica', 'normal');
      addText(clause.content, 20, 10);
      yPos += 3;
    });
    
    // Signatures
    yPos += 20;
    if (yPos > 220) {
      doc.addPage();
      yPos = 40;
    }
    
    doc.setFont('helvetica', 'normal');
    addText('En comprobante, las partes firman el presente contrato en dos ejemplares de igual tenor y valor.', 20, 10);
    
    yPos += 40;
    
    // Signature lines
    doc.line(30, yPos, 90, yPos);
    doc.line(120, yPos, 180, yPos);
    
    yPos += 5;
    doc.setFontSize(9);
    doc.text('CRISTIAN RETAMAL VARGAS', 35, yPos);
    doc.text(`${clienteForm.nombre_representante}`, 125, yPos);
    
    yPos += 5;
    doc.text('Fundación Nueva Educación', 35, yPos);
    doc.text(`${clienteForm.nombre_legal}`, 125, yPos);
    
    return doc;
  };

  // Validation
  const isStepValid = () => {
    switch (step) {
      case 'cliente':
        return clienteForm.nombre_legal && clienteForm.nombre_fantasia && 
               clienteForm.rut && clienteForm.direccion && clienteForm.comuna && 
               clienteForm.ciudad && clienteForm.nombre_representante;
      case 'contrato':
        return contractForm.numero_contrato && contractForm.fecha_contrato && 
               contractForm.fecha_fin && contractForm.programa_id && contractForm.precio_total_uf > 0;
      case 'cuotas':
        return cuotas.every(c => c.fecha_vencimiento && c.monto > 0) &&
               Math.abs(cuotas.reduce((sum, c) => sum + c.monto, 0) - contractForm.precio_total_uf) <= 0.01;
      default:
        return false;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md">
      {/* Progress Steps */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center space-x-4">
          {['cliente', 'contrato', 'cuotas'].map((stepName, index) => {
            const isActive = step === stepName;
            const isCompleted = ['cliente', 'contrato', 'cuotas'].indexOf(step) > index;
            
            return (
              <div key={stepName} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  isActive ? 'bg-brand_blue text-white' :
                  isCompleted ? 'bg-brand_yellow text-brand_blue' : 'bg-gray-200 text-gray-500'
                }`}>
                  {index + 1}
                </div>
                <span className={`ml-2 text-sm font-medium ${
                  isActive ? 'text-brand_blue' :
                  isCompleted ? 'text-brand_yellow' : 'text-gray-500'
                }`}>
                  {stepName === 'cliente' && 'Cliente'}
                  {stepName === 'contrato' && 'Contrato'}
                  {stepName === 'cuotas' && 'Cuotas'}
                </span>
                {index < 2 && <div className="w-8 h-px bg-gray-300 mx-4"></div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-6">
        {/* Step 1: Client Information */}
        {step === 'cliente' && (
          <div className="space-y-6">
            <div className="flex items-center space-x-2 mb-4">
              <FileText className="text-brand_blue" size={20} />
              <h3 className="text-lg font-semibold text-brand_blue">Información del Cliente</h3>
            </div>

            {/* Existing Client Selection */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-brand_blue mb-2">
                Seleccionar Cliente Existente (Opcional)
              </label>
              <select
                value={selectedClienteId}
                onChange={(e) => handleClienteSelection(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              >
                <option value="">-- Crear nuevo cliente --</option>
                {clientes.map(cliente => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre_legal} ({cliente.rut})
                  </option>
                ))}
              </select>
            </div>

            {/* Client Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre Legal *
                </label>
                <input
                  type="text"
                  value={clienteForm.nombre_legal}
                  onChange={(e) => setClienteForm({ ...clienteForm, nombre_legal: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  placeholder="Nombre legal de la empresa"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre de Fantasía *
                </label>
                <input
                  type="text"
                  value={clienteForm.nombre_fantasia}
                  onChange={(e) => setClienteForm({ ...clienteForm, nombre_fantasia: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  placeholder="Nombre comercial"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  RUT *
                </label>
                <input
                  type="text"
                  value={clienteForm.rut}
                  onChange={(e) => setClienteForm({ ...clienteForm, rut: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  placeholder="12.345.678-9"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dirección *
                </label>
                <input
                  type="text"
                  value={clienteForm.direccion}
                  onChange={(e) => setClienteForm({ ...clienteForm, direccion: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  placeholder="Calle y número"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comuna *
                </label>
                <input
                  type="text"
                  value={clienteForm.comuna}
                  onChange={(e) => setClienteForm({ ...clienteForm, comuna: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  placeholder="Comuna"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ciudad *
                </label>
                <input
                  type="text"
                  value={clienteForm.ciudad}
                  onChange={(e) => setClienteForm({ ...clienteForm, ciudad: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  placeholder="Ciudad"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Representante Legal *
                </label>
                <input
                  type="text"
                  value={clienteForm.nombre_representante}
                  onChange={(e) => setClienteForm({ ...clienteForm, nombre_representante: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  placeholder="Nombre del representante"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  RUT Representante
                </label>
                <input
                  type="text"
                  value={clienteForm.rut_representante}
                  onChange={(e) => setClienteForm({ ...clienteForm, rut_representante: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  placeholder="12.345.678-9"
                />
              </div>
            </div>

            {/* Additional Legal Information */}
            <div className="border-t pt-6">
              <h4 className="text-md font-semibold text-brand_blue mb-4">Información Legal Adicional</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha Escritura Pública
                  </label>
                  <input
                    type="date"
                    value={clienteForm.fecha_escritura}
                    onChange={(e) => setClienteForm({ ...clienteForm, fecha_escritura: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notario Público
                  </label>
                  <input
                    type="text"
                    value={clienteForm.nombre_notario}
                    onChange={(e) => setClienteForm({ ...clienteForm, nombre_notario: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                    placeholder="Nombre del notario"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Comuna Notaría
                  </label>
                  <input
                    type="text"
                    value={clienteForm.comuna_notaria}
                    onChange={(e) => setClienteForm({ ...clienteForm, comuna_notaria: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                    placeholder="Santiago, Providencia, etc."
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Contract Information */}
        {step === 'contrato' && (
          <div className="space-y-6">
            <div className="flex items-center space-x-2 mb-4">
              <Calendar className="text-brand_blue" size={20} />
              <h3 className="text-lg font-semibold text-brand_blue">Información del Contrato</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Número de Contrato *
                </label>
                <input
                  type="text"
                  value={contractForm.numero_contrato}
                  onChange={(e) => setContractForm({ ...contractForm, numero_contrato: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  placeholder="FNE-2025-01-001"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha del Contrato *
                </label>
                <input
                  type="date"
                  value={contractForm.fecha_contrato}
                  onChange={(e) => setContractForm({ ...contractForm, fecha_contrato: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha de Finalización *
                </label>
                <input
                  type="date"
                  value={contractForm.fecha_fin}
                  onChange={(e) => setContractForm({ ...contractForm, fecha_fin: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  min={contractForm.fecha_contrato}
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Programa Contratado *
                </label>
                <select
                  value={contractForm.programa_id}
                  onChange={(e) => setContractForm({ ...contractForm, programa_id: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                >
                  <option value="">-- Seleccionar programa --</option>
                  {programas.map(programa => (
                    <option key={programa.id} value={programa.id}>
                      {programa.nombre} ({programa.horas_totales}h - {programa.modalidad})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Moneda
                </label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="tipo_moneda"
                      value="UF"
                      checked={contractForm.tipo_moneda === 'UF'}
                      onChange={(e) => setContractForm({ ...contractForm, tipo_moneda: e.target.value as 'UF' | 'CLP' })}
                      className="mr-2"
                    />
                    UF (Unidades de Fomento)
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="tipo_moneda"
                      value="CLP"
                      checked={contractForm.tipo_moneda === 'CLP'}
                      onChange={(e) => setContractForm({ ...contractForm, tipo_moneda: e.target.value as 'UF' | 'CLP' })}
                      className="mr-2"
                    />
                    Pesos Chilenos (CLP)
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Precio Total ({contractForm.tipo_moneda}) *
                </label>
                <input
                  type="number"
                  step={contractForm.tipo_moneda === 'UF' ? '0.01' : '1'}
                  min="0"
                  value={contractForm.precio_total_uf}
                  onChange={(e) => setContractForm({ ...contractForm, precio_total_uf: parseFloat(e.target.value) || 0 })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Installments */}
        {step === 'cuotas' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <DollarSign className="text-brand_blue" size={20} />
                <h3 className="text-lg font-semibold text-brand_blue">Plan de Pagos</h3>
              </div>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={calculateCuotas}
                  className="px-4 py-2 bg-brand_yellow text-brand_blue rounded-lg hover:bg-brand_yellow/90 transition-colors text-sm font-medium"
                >
                  Calcular Automático
                </button>
                <button
                  type="button"
                  onClick={addCuota}
                  disabled={cuotas.length >= 12}
                  className="flex items-center px-4 py-2 bg-brand_blue text-white rounded-lg hover:bg-brand_blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  <Plus size={16} className="mr-1" />
                  Agregar Cuota
                </button>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-2">
                <strong>Total del Contrato:</strong> {contractForm.tipo_moneda} {contractForm.precio_total_uf.toLocaleString('es-CL', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-sm text-gray-600">
                <strong>Total de Cuotas:</strong> {contractForm.tipo_moneda} {cuotas.reduce((sum, c) => sum + c.monto, 0).toLocaleString('es-CL', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="space-y-4">
              {cuotas.map((cuota, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center p-4 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-brand_blue">Cuota {cuota.numero_cuota}</span>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Fecha Vencimiento
                    </label>
                    <input
                      type="date"
                      value={cuota.fecha_vencimiento}
                      onChange={(e) => updateCuota(index, 'fecha_vencimiento', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_blue focus:border-transparent text-sm"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Monto ({contractForm.tipo_moneda})
                    </label>
                    <input
                      type="number"
                      step={contractForm.tipo_moneda === 'UF' ? '0.01' : '1'}
                      min="0"
                      value={cuota.monto}
                      onChange={(e) => updateCuota(index, 'monto', parseFloat(e.target.value) || 0)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_blue focus:border-transparent text-sm"
                    />
                  </div>
                  
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeCuota(index)}
                      disabled={cuotas.length <= 1}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Eliminar cuota"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {Math.abs(cuotas.reduce((sum, c) => sum + c.monto, 0) - contractForm.precio_total_uf) > 0.01 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 text-sm">
                  ⚠️ La suma de las cuotas no coincide con el total del contrato. 
                  Diferencia: {contractForm.tipo_moneda} {(contractForm.precio_total_uf - cuotas.reduce((sum, c) => sum + c.monto, 0)).toLocaleString('es-CL', { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center pt-6 border-t border-gray-200">
          <div className="flex space-x-2">
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
                onClick={() => {
                  if (step === 'contrato') setStep('cliente');
                  if (step === 'cuotas') setStep('contrato');
                }}
                className="px-6 py-2 border border-brand_blue text-brand_blue rounded-lg hover:bg-brand_blue hover:text-white transition-colors"
              >
                Anterior
              </button>
            )}
          </div>
          
          <div>
            {step !== 'cuotas' ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 'cliente') setStep('contrato');
                  if (step === 'contrato') setStep('cuotas');
                }}
                disabled={!isStepValid()}
                className="px-6 py-2 bg-brand_blue text-white rounded-lg hover:bg-brand_blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            ) : (
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    const pdf = generateContractPDF();
                    pdf.save(`Contrato_${contractForm.numero_contrato}_${clienteForm.nombre_fantasia.replace(/\s+/g, '_')}.pdf`);
                  }}
                  disabled={!isStepValid()}
                  className="flex items-center px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  <Download size={16} className="mr-2" />
                  Generar PDF
                </button>
                <button
                  type="button"
                  onClick={handleSaveContract}
                  disabled={!isStepValid() || loading}
                  className="flex items-center px-6 py-2 bg-brand_yellow text-brand_blue rounded-lg hover:bg-brand_yellow/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand_blue mr-2"></div>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save size={16} className="mr-2" />
                      {editingContract ? 'Actualizar Contrato' : 'Guardar Contrato'}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}