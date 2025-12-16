import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useState, useEffect } from 'react';

import { Plus, Trash2, Save, FileText, Calendar, DollarSign, Download, Building, Upload } from 'lucide-react';
import jsPDF from 'jspdf';
import { toast } from 'react-hot-toast';
import { generateContractFromTemplate } from '@/lib/contract-template';

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
  nombre_encargado_proyecto?: string;
  telefono_encargado_proyecto?: string;
  email_encargado_proyecto?: string;
  nombre_contacto_administrativo?: string;
  telefono_contacto_administrativo?: string;
  email_contacto_administrativo?: string;
  school_id?: number | null; // Changed to number to match schools table
}

interface School {
  id: number; // Changed from string to number
  name: string;
  code?: string | null;
  address?: string | null;
  region?: string | null;
  has_generations: boolean;
  cliente_id?: string | null;
}

interface CuotaForm {
  numero_cuota: number;
  fecha_vencimiento: string;
  monto: number; // Keep as monto in form, but save as monto_uf to database
}

interface ClienteFormState {
  nombre_legal: string;
  nombre_fantasia: string;
  rut: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  nombre_representante: string;
  rut_representante: string;
  fecha_escritura: string;
  nombre_notario: string;
  comuna_notaria: string;
  nombre_encargado_proyecto: string;
  telefono_encargado_proyecto: string;
  email_encargado_proyecto: string;
  nombre_contacto_administrativo: string;
  telefono_contacto_administrativo: string;
  email_contacto_administrativo: string;
  telefono?: string;
}

interface ContractFormState {
  numero_contrato: string;
  fecha_contrato: string;
  fecha_fin: string;
  programa_id: string;
  precio_total_uf: number;
  tipo_moneda: 'UF' | 'CLP';
  descripcion_manual?: string;
  cliente_id?: string;
}

interface ContractFormProps {
  programas: Programa[];
  clientes: Cliente[];
  editingContract?: any; // Contract being edited
  preSelectedClientId?: string;
  extractedData?: any; // Data extracted from PDF
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ContractForm({ programas, clientes, editingContract, preSelectedClientId, extractedData, onSuccess, onCancel }: ContractFormProps) {
  const supabase = useSupabaseClient();
  // Form states
  const [loading, setLoading] = useState(false);
  const [savingAsDraft, setSavingAsDraft] = useState(false);
  const [step, setStep] = useState<'cliente' | 'contrato' | 'cuotas'>('cliente');
  const [esManual, setEsManual] = useState(false); // New state for manual contracts
  
  // Client form
  const [selectedClienteId, setSelectedClienteId] = useState(preSelectedClientId || '');
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | ''>('');
  const [showNewSchoolForm, setShowNewSchoolForm] = useState(false);
  const [newSchoolForm, setNewSchoolForm] = useState({
    name: '',
    code: '',
    address: '',
    region: '',
    has_generations: true
  });
  const [clienteForm, setClienteForm] = useState<ClienteFormState>({
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
    comuna_notaria: '',
    nombre_encargado_proyecto: '',
    telefono_encargado_proyecto: '',
    email_encargado_proyecto: '',
    nombre_contacto_administrativo: '',
    telefono_contacto_administrativo: '',
    email_contacto_administrativo: '',
    telefono: ''
  });
  
  // Contract form
  const [contractForm, setContractForm] = useState<ContractFormState>({
    numero_contrato: '',
    fecha_contrato: new Date().toISOString().split('T')[0],
    fecha_fin: '',
    programa_id: '',
    precio_total_uf: 0,
    tipo_moneda: 'UF',
    descripcion_manual: '',
    cliente_id: ''
  });
  
  // Installments form
  const [cuotas, setCuotas] = useState<CuotaForm[]>([
    { numero_cuota: 1, fecha_vencimiento: '', monto: 0 }
  ]);

  // Fetch schools on component mount
  useEffect(() => {
    fetchSchools();
  }, []);

  const fetchSchools = async () => {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setSchools(data || []);
    } catch (error) {
      console.error('Error fetching schools:', error);
    }
  };

  // Handle pre-selected client
  useEffect(() => {
    if (preSelectedClientId && clientes.length > 0) {
      const selectedClient = clientes.find(c => c.id === preSelectedClientId);
      if (selectedClient) {
        setSelectedClienteId(preSelectedClientId);
        setSelectedSchoolId(selectedClient.school_id || '');
        setClienteForm({
          nombre_legal: selectedClient.nombre_legal || '',
          nombre_fantasia: selectedClient.nombre_fantasia || '',
          rut: selectedClient.rut || '',
          direccion: selectedClient.direccion || '',
          comuna: selectedClient.comuna || '',
          ciudad: selectedClient.ciudad || '',
          nombre_representante: selectedClient.nombre_representante || '',
          rut_representante: selectedClient.rut_representante || '',
          fecha_escritura: selectedClient.fecha_escritura || '',
          nombre_notario: selectedClient.nombre_notario || '',
          comuna_notaria: selectedClient.comuna_notaria || '',
          nombre_encargado_proyecto: selectedClient.nombre_encargado_proyecto || '',
          telefono_encargado_proyecto: selectedClient.telefono_encargado_proyecto || '',
          email_encargado_proyecto: selectedClient.email_encargado_proyecto || '',
          nombre_contacto_administrativo: selectedClient.nombre_contacto_administrativo || '',
          telefono_contacto_administrativo: selectedClient.telefono_contacto_administrativo || '',
          email_contacto_administrativo: selectedClient.email_contacto_administrativo || ''
        });
      }
    }
  }, [preSelectedClientId, clientes]);

  // Populate form with extracted PDF data
  useEffect(() => {
    if (extractedData) {
      // Set form to manual mode since we're importing a PDF
      setEsManual(true);
      
      // Populate contract form
      setContractForm({
        numero_contrato: extractedData.contract?.numero_contrato || '',
        fecha_contrato: extractedData.contract?.fecha_contrato || new Date().toISOString().split('T')[0],
        fecha_fin: extractedData.contract?.fecha_fin || '',
        programa_id: '', // Will be selected manually or kept empty for manual contracts
        precio_total_uf: extractedData.financial?.precio_total || 0,
        tipo_moneda: extractedData.financial?.moneda || 'UF',
        descripcion_manual: `Contrato importado desde PDF - ${extractedData.contract?.numero_contrato || 'Sin número'}`
      });
      
      // Populate client form
      // Use defaults for required fields
      const today = new Date().toISOString().split('T')[0];
      setClienteForm({
        nombre_legal: extractedData.client?.nombre_legal || '',
        nombre_fantasia: extractedData.client?.nombre_fantasia || extractedData.client?.nombre_legal || '',
        rut: extractedData.client?.rut || '',
        direccion: extractedData.client?.direccion || '',
        comuna: extractedData.client?.comuna || '',
        ciudad: extractedData.client?.ciudad || '',
        nombre_representante: extractedData.client?.nombre_representante || '',
        rut_representante: extractedData.client?.rut_representante || '11.111.111-1',
        fecha_escritura: extractedData.client?.fecha_escritura || today,
        nombre_notario: extractedData.client?.nombre_notario || 'Notario Público',
        comuna_notaria: extractedData.client?.comuna_notaria || '',
        nombre_encargado_proyecto: '',
        telefono_encargado_proyecto: '',
        email_encargado_proyecto: '',
        nombre_contacto_administrativo: extractedData.client?.nombre_contacto || '',
        telefono_contacto_administrativo: '',
        email_contacto_administrativo: extractedData.client?.email_contacto || ''
      });
      
      // Populate payment schedule if available
      if (extractedData.payment_schedule && extractedData.payment_schedule.length > 0) {
        setCuotas(extractedData.payment_schedule.map((payment: any) => ({
          numero_cuota: payment.numero_cuota,
          fecha_vencimiento: payment.fecha_vencimiento,
          monto: payment.monto
        })));
      }
      
      // Check if client exists by RUT
      if (extractedData.client?.rut) {
        const existingClient = clientes.find(c => c.rut === extractedData.client.rut);
        if (existingClient) {
          setSelectedClienteId(existingClient.id);
          // Update form with existing client data
          setClienteForm({
            nombre_legal: existingClient.nombre_legal || '',
            nombre_fantasia: existingClient.nombre_fantasia || '',
            rut: existingClient.rut || '',
            direccion: existingClient.direccion || '',
            comuna: existingClient.comuna || '',
            ciudad: existingClient.ciudad || '',
            nombre_representante: existingClient.nombre_representante || '',
            rut_representante: existingClient.rut_representante || '',
            fecha_escritura: existingClient.fecha_escritura || '',
            nombre_notario: existingClient.nombre_notario || '',
            comuna_notaria: existingClient.comuna_notaria || '',
            nombre_encargado_proyecto: existingClient.nombre_encargado_proyecto || '',
            telefono_encargado_proyecto: existingClient.telefono_encargado_proyecto || '',
            email_encargado_proyecto: existingClient.email_encargado_proyecto || '',
            nombre_contacto_administrativo: existingClient.nombre_contacto_administrativo || '',
            telefono_contacto_administrativo: existingClient.telefono_contacto_administrativo || '',
            email_contacto_administrativo: existingClient.email_contacto_administrativo || ''
          });
        }
      }
    }
  }, [extractedData, clientes]);

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
        comuna_notaria: editingContract.clientes.comuna_notaria || '',
        nombre_encargado_proyecto: editingContract.clientes.nombre_encargado_proyecto || '',
        telefono_encargado_proyecto: editingContract.clientes.telefono_encargado_proyecto || '',
        email_encargado_proyecto: editingContract.clientes.email_encargado_proyecto || '',
        nombre_contacto_administrativo: editingContract.clientes.nombre_contacto_administrativo || '',
        telefono_contacto_administrativo: editingContract.clientes.telefono_contacto_administrativo || '',
        email_contacto_administrativo: editingContract.clientes.email_contacto_administrativo || ''
      });
      
      // Populate contract form
      setContractForm({
        numero_contrato: editingContract.numero_contrato || '',
        fecha_contrato: editingContract.fecha_contrato || '',
        fecha_fin: editingContract.fecha_fin || '',
        programa_id: editingContract.programa_id || '',
        precio_total_uf: editingContract.precio_total_uf || 0,
        tipo_moneda: editingContract.tipo_moneda || 'UF',
        descripcion_manual: editingContract.descripcion_manual || '',
        cliente_id: editingContract.cliente_id || ''
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
      setSelectedSchoolId(cliente.school_id || '');
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
        comuna_notaria: cliente.comuna_notaria || '',
        nombre_encargado_proyecto: cliente.nombre_encargado_proyecto || '',
        telefono_encargado_proyecto: cliente.telefono_encargado_proyecto || '',
        email_encargado_proyecto: cliente.email_encargado_proyecto || '',
        nombre_contacto_administrativo: cliente.nombre_contacto_administrativo || '',
        telefono_contacto_administrativo: cliente.telefono_contacto_administrativo || '',
        email_contacto_administrativo: cliente.email_contacto_administrativo || ''
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

  // Create new school
  const handleCreateSchool = async () => {
    if (!newSchoolForm.name.trim()) {
      toast.error('El nombre de la escuela es requerido');
      return;
    }

    try {
      setLoading(true);
      
      // Get the current user's token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No authenticated session');
      }

      const response = await fetch('/api/admin/schools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(newSchoolForm)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error creating school');
      }

      const newSchool = await response.json();
      
      // Update schools list
      await fetchSchools();
      
      // Select the newly created school
      setSelectedSchoolId(newSchool.id);
      
      // Pre-fill client form with school data
      setClienteForm(prev => ({
        ...prev,
        nombre_fantasia: newSchool.name,
        direccion: newSchool.address || prev.direccion,
        ciudad: newSchool.region || prev.ciudad
      }));
      
      setShowNewSchoolForm(false);
      setNewSchoolForm({
        name: '',
        code: '',
        address: '',
        region: '',
        has_generations: true
      });
      
      toast.success('Escuela creada exitosamente');
    } catch (error) {
      console.error('Error creating school:', error);
      toast.error('Error al crear la escuela: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Save contract as draft
  const handleSaveAsDraft = async () => {
    try {
      setSavingAsDraft(true);
      
      // Validate minimum required fields for draft
      if (!contractForm.numero_contrato) {
        alert('Por favor ingrese un número de contrato antes de guardar como borrador.');
        setSavingAsDraft(false);
        return;
      }
      
      // Get or create clienteId
      let clienteId = selectedClienteId || contractForm.cliente_id;
      
      if (!clienteId && (clienteForm.rut || clienteForm.nombre_legal)) {
        // Create minimal client if we have some data
        const clientData: any = {};
        if (clienteForm.rut) clientData.rut = clienteForm.rut;
        if (clienteForm.nombre_legal) clientData.nombre_legal = clienteForm.nombre_legal || 'Cliente Pendiente';
        if (clienteForm.direccion) clientData.direccion = clienteForm.direccion;
        if (clienteForm.comuna) clientData.comuna = clienteForm.comuna;
        if (clienteForm.ciudad) clientData.ciudad = clienteForm.ciudad;
        if (clienteForm.telefono) clientData.telefono = clienteForm.telefono;
        if (clienteForm.email_encargado_proyecto) clientData.email_encargado_proyecto = clienteForm.email_encargado_proyecto;
        if (clienteForm.email_contacto_administrativo) clientData.email_contacto_administrativo = clienteForm.email_contacto_administrativo;
        
        // Check if client exists
        if (clienteForm.rut) {
          const { data: existingCliente } = await supabase
            .from('clientes')
            .select('id')
            .eq('rut', clienteForm.rut)
            .single();
            
          if (existingCliente) {
            clienteId = existingCliente.id;
          }
        }
        
        if (!clienteId && Object.keys(clientData).length > 0) {
          const { data: newCliente, error: clienteError } = await supabase
            .from('clientes')
            .insert([clientData])
            .select()
            .single();
            
          if (clienteError) {
            console.error('Error creating client for draft:', clienteError);
          } else {
            clienteId = newCliente.id;
          }
        }
      }
      
      // Prepare contract data (allow incomplete data for draft)
      const contractData: any = {
        numero_contrato: contractForm.numero_contrato,
        estado: 'borrador',
        es_manual: esManual
      };
      
      // Add optional fields if they exist
      if (contractForm.fecha_contrato) contractData.fecha_contrato = contractForm.fecha_contrato;
      if (contractForm.fecha_fin) contractData.fecha_fin = contractForm.fecha_fin;
      if (clienteId) contractData.cliente_id = clienteId;
      if (!esManual && contractForm.programa_id) contractData.programa_id = contractForm.programa_id;
      if (contractForm.precio_total_uf) contractData.precio_total_uf = contractForm.precio_total_uf;
      if (contractForm.tipo_moneda) contractData.tipo_moneda = contractForm.tipo_moneda;
      if (esManual && contractForm.descripcion_manual) contractData.descripcion_manual = contractForm.descripcion_manual;
      
      let contractId;
      
      // Check if we're updating an existing draft or contract
      if (editingContract) {
        // Update existing contract to draft status
        const { data: updatedContract, error } = await supabase
          .from('contratos')
          .update(contractData)
          .eq('id', editingContract.id)
          .select()
          .single();
          
        if (error) throw error;
        contractId = updatedContract.id;
      } else {
        // Check if a draft already exists with this number
        const { data: existingDraft } = await supabase
          .from('contratos')
          .select('id')
          .eq('numero_contrato', contractForm.numero_contrato)
          .eq('estado', 'borrador')
          .single();
          
        if (existingDraft) {
          // Update existing draft
          const { data: updatedContract, error } = await supabase
            .from('contratos')
            .update(contractData)
            .eq('id', existingDraft.id)
            .select()
            .single();
            
          if (error) throw error;
          contractId = updatedContract.id;
        } else {
          // Create new draft
          const { data: newContract, error } = await supabase
            .from('contratos')
            .insert([contractData])
            .select()
            .single();
            
          if (error) {
            if (error.message.includes('duplicate key')) {
              throw new Error('Ya existe un contrato con este número. Por favor use un número diferente.');
            }
            throw error;
          }
          contractId = newContract.id;
        }
      }
      
      // Save payment schedule if exists
      if (cuotas.length > 0 && contractId) {
        // Delete existing cuotas for this contract
        await supabase
          .from('cuotas')
          .delete()
          .eq('contrato_id', contractId);
          
        // Insert new cuotas
        const cuotasData = cuotas.map(c => ({
          contrato_id: contractId,
          numero_cuota: c.numero_cuota,
          fecha_vencimiento: c.fecha_vencimiento,
          monto_uf: c.monto,
          pagada: false
        }));
        
        const { error: cuotasError } = await supabase
          .from('cuotas')
          .insert(cuotasData);
          
        if (cuotasError) {
          console.error('Error saving payment schedule:', cuotasError);
        }
      }
      
      alert('✅ Contrato guardado como borrador. Puede continuar editándolo más tarde desde la lista de contratos.');
      onSuccess();
    } catch (error: any) {
      console.error('Error saving draft:', error);
      alert(error.message || 'Error al guardar el borrador. Por favor intente nuevamente.');
    } finally {
      setSavingAsDraft(false);
    }
  };

  // Save contract
  const handleSaveContract = async () => {
    setLoading(true);
    try {
      let clienteId = selectedClienteId;
      
      if (editingContract) {
        // EDITING MODE
        
        // Update client data with school_id
        const clientUpdateData = {
          ...clienteForm,
          school_id: selectedSchoolId || null
        };
        
        const { error: clienteError } = await supabase
          .from('clientes')
          .update(clientUpdateData)
          .eq('id', editingContract.cliente_id);
          
        if (clienteError) throw clienteError;
        clienteId = editingContract.cliente_id;
        
        // Update school link if changed
        if (selectedSchoolId) {
          const { error: schoolUpdateError } = await supabase
            .from('schools')
            .update({ cliente_id: editingContract.cliente_id })
            .eq('id', selectedSchoolId);
            
          if (schoolUpdateError) {
            console.error('Error updating school link:', schoolUpdateError);
          }
        }
        
        // Update contract
        const { error: contratoError } = await supabase
          .from('contratos')
          .update({
            numero_contrato: contractForm.numero_contrato,
            fecha_contrato: contractForm.fecha_contrato,
            fecha_fin: contractForm.fecha_fin,
            programa_id: esManual ? null : contractForm.programa_id,
            precio_total_uf: contractForm.precio_total_uf,
            tipo_moneda: contractForm.tipo_moneda,
            es_manual: esManual,
            descripcion_manual: esManual ? contractForm.descripcion_manual : null
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
          // Prepare client data with school_id if selected
          // Provide default values for required fields
          const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
          const clientData = {
            ...clienteForm,
            school_id: selectedSchoolId || null,
            // Required fields with defaults
            nombre_fantasia: clienteForm.nombre_fantasia || clienteForm.nombre_legal, // Use legal name if no fantasy name
            rut_representante: clienteForm.rut_representante || '11.111.111-1', // Default RUT if not provided
            fecha_escritura: clienteForm.fecha_escritura || today, // Use today's date if not provided
            nombre_notario: clienteForm.nombre_notario || 'Notario Público', // Default notary name
            // Optional fields can be null
            comuna_notaria: clienteForm.comuna_notaria || null,
            nombre_encargado_proyecto: clienteForm.nombre_encargado_proyecto || null,
            telefono_encargado_proyecto: clienteForm.telefono_encargado_proyecto || null,
            email_encargado_proyecto: clienteForm.email_encargado_proyecto || null,
            nombre_contacto_administrativo: clienteForm.nombre_contacto_administrativo || null,
            telefono_contacto_administrativo: clienteForm.telefono_contacto_administrativo || null,
            email_contacto_administrativo: clienteForm.email_contacto_administrativo || null
          };
          
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
              toast.error('Creación de contrato cancelada. Por favor verifica el RUT del cliente.');
              setLoading(false);
              return;
            }
          } else {
            // Create new client
            const { data: newCliente, error: clienteError } = await supabase
              .from('clientes')
              .insert([clientData])
              .select()
              .single();
              
            if (clienteError) throw clienteError;
            clienteId = newCliente.id;
            
            // If a school was selected, update the school with the client reference
            if (selectedSchoolId && newCliente.id) {
              const { error: schoolUpdateError } = await supabase
                .from('schools')
                .update({ cliente_id: newCliente.id })
                .eq('id', selectedSchoolId);
                
              if (schoolUpdateError) {
                console.error('Error linking school to client:', schoolUpdateError);
                // Non-critical error, continue with contract creation
              }
            }
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

        // Save contract (ensure empty date strings become null)
        const { data: newContrato, error: contratoError } = await supabase
          .from('contratos')
          .insert([{
            numero_contrato: contractForm.numero_contrato,
            fecha_contrato: contractForm.fecha_contrato || null,
            fecha_fin: contractForm.fecha_fin || null,
            cliente_id: clienteId,
            programa_id: esManual ? null : contractForm.programa_id, // NULL for manual contracts
            precio_total_uf: contractForm.precio_total_uf,
            tipo_moneda: contractForm.tipo_moneda,
            es_manual: esManual,
            descripcion_manual: esManual ? contractForm.descripcion_manual : null
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
          fecha_vencimiento: cuota.fecha_vencimiento || null,
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
      toast.error('Error al guardar el contrato: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Format currency for display
  const formatCurrency = (amount: number) => {
    return `UF ${amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Format date for display - parse manually to avoid timezone issues
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

  // Generate PDF using contract-template.ts
  const generateContractPDF = () => {
    // Get selected program
    const selectedPrograma = programas.find(p => p.id === contractForm.programa_id);

    // Build contract data object for the template
    const contractData = {
      fecha_contrato: contractForm.fecha_contrato,
      fecha_fin: contractForm.fecha_fin,
      numero_contrato: contractForm.numero_contrato,
      precio_total_uf: contractForm.precio_total_uf,
      precio_total_clp: contractForm.tipo_moneda === 'CLP' ? contractForm.precio_total_uf : 0,
      tipo_moneda: contractForm.tipo_moneda,
      cliente: {
        nombre_legal: clienteForm.nombre_legal,
        nombre_fantasia: clienteForm.nombre_fantasia,
        rut: clienteForm.rut,
        direccion: clienteForm.direccion,
        comuna: clienteForm.comuna,
        ciudad: clienteForm.ciudad,
        nombre_representante: clienteForm.nombre_representante,
        rut_representante: clienteForm.rut_representante,
        fecha_escritura: clienteForm.fecha_escritura,
        nombre_notario: clienteForm.nombre_notario,
        comuna_notaria: clienteForm.comuna_notaria
      },
      programa: {
        nombre: selectedPrograma?.nombre || contractForm.descripcion_manual || '',
        descripcion: selectedPrograma?.descripcion || '',
        horas_totales: selectedPrograma?.horas_totales || 0,
        modalidad: selectedPrograma?.modalidad || ''
      },
      cuotas: cuotas.map(c => ({
        numero_cuota: c.numero_cuota,
        fecha_vencimiento: c.fecha_vencimiento,
        monto_uf: contractForm.tipo_moneda === 'UF' ? c.monto : 0,
        monto_clp: contractForm.tipo_moneda === 'CLP' ? c.monto : 0
      }))
    };

    // Generate HTML from template
    const htmlContent = generateContractFromTemplate(contractData);

    // Create PDF from HTML using jsPDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    let yPos = 20;

    // Helper function to add text with automatic wrapping and page breaks
    const addText = (text: string, x: number, fontSize: number = 10, maxWidth: number = pageWidth - 40, isBold: boolean = false) => {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(text, maxWidth);

      for (const line of lines) {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(line, x, yPos);
        yPos += fontSize * 0.4 + 2;
      }
      yPos += 3;
    };

    // Parse HTML and convert to PDF
    // Strip HTML tags and process the content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    // Process the title block (centered)
    const titleDiv = tempDiv.querySelector('div[style*="text-align: center"]');
    if (titleDiv) {
      const titleLines = titleDiv.innerHTML.split('<br>').map(line =>
        line.replace(/<[^>]*>/g, '').trim()
      ).filter(line => line);

      doc.setFont('helvetica', 'bold');
      titleLines.forEach((line, index) => {
        doc.setFontSize(index === 0 ? 14 : 11);
        doc.text(line, pageWidth / 2, yPos, { align: 'center' });
        yPos += index === 0 ? 6 : 5;
      });
      yPos += 10;
    }

    // Get the rest of the text content
    const fullText = tempDiv.textContent || tempDiv.innerText || '';

    // Define clause titles to look for
    const clauseTitles = [
      'PRIMERO:', 'SEGUNDO:', 'TERCERO:', 'CUARTO:', 'QUINTO:', 'SEXTO:',
      'SÉPTIMO:', 'OCTAVO:', 'NOVENO:', 'DÉCIMO:', 'DÉCIMO PRIMERO:',
      'DÉCIMO SEGUNDO:', 'DÉCIMO TERCERO:', 'DÉCIMO CUARTO:', 'DÉCIMO QUINTO:', 'DÉCIMO SEXTO:'
    ];

    // Split the text by clause titles while keeping the titles
    const clausePattern = /(PRIMERO:|SEGUNDO:|TERCERO:|CUARTO:|QUINTO:|SEXTO:|SÉPTIMO:|OCTAVO:|NOVENO:|DÉCIMO PRIMERO:|DÉCIMO SEGUNDO:|DÉCIMO TERCERO:|DÉCIMO CUARTO:|DÉCIMO QUINTO:|DÉCIMO SEXTO:|DÉCIMO:)/g;

    // Find the opening paragraph (before PRIMERO:)
    const firstClauseIndex = fullText.indexOf('PRIMERO:');
    if (firstClauseIndex > 0) {
      // Get text before first clause (skip title block content)
      let openingText = fullText.substring(0, firstClauseIndex).trim();

      // Remove title block content
      const titlePatterns = [
        /CONTRATO DE PRESTACIÓN DE SERVICIOS[^]*?Contrato [^\n]+/,
        /^[\s\n]*CONTRATO DE PRESTACIÓN DE SERVICIOS/,
        /FUNDACIÓN INSTITUTO RELACIONAL \(NUEVA EDUCACIÓN\)\s*Y\s*/
      ];
      for (const pattern of titlePatterns) {
        openingText = openingText.replace(pattern, '').trim();
      }

      // Find "En Santiago de Chile" paragraph
      const santiagoIndex = openingText.indexOf('En Santiago de Chile');
      if (santiagoIndex >= 0) {
        const openingParagraph = openingText.substring(santiagoIndex).trim();
        if (openingParagraph) {
          addText(openingParagraph, 20, 10);
          yPos += 5;
        }
      }
    }

    // Split the rest of the text by clauses
    const parts = fullText.substring(firstClauseIndex).split(clausePattern).filter(p => p.trim());

    // Process clauses in pairs (title, content)
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();

      // Check if this part is a clause title
      if (clauseTitles.includes(part)) {
        // Get the content after the clause marker
        let nextPart = parts[i + 1] || '';

        // Clean up the content: normalize whitespace while preserving paragraph structure
        // Replace tabs with spaces, normalize multiple spaces
        nextPart = nextPart.replace(/\t/g, ' ').replace(/  +/g, ' ');

        // Split by double newlines (paragraph breaks) to preserve structure
        const paragraphs = nextPart.split(/\n\s*\n/).map(p => p.trim()).filter(p => p);

        // The first paragraph should be the subtitle (if it exists)
        let subtitle = '';
        let contentParagraphs: string[] = [];

        if (paragraphs.length > 0) {
          const firstPara = paragraphs[0];

          // A subtitle is SHORT and reads like a title, not a sentence
          // Content paragraphs are LONG or start with typical sentence patterns
          const isShort = firstPara.length <= 80;
          const startsLikeSentence =
            firstPara.startsWith('La ') ||
            firstPara.startsWith('Las ') ||
            firstPara.startsWith('El ') ||
            firstPara.startsWith('Los ') ||
            firstPara.startsWith('Para ') ||
            firstPara.startsWith('Si ') ||
            firstPara.startsWith('Cada ') ||
            firstPara.startsWith('Cualquier ') ||
            firstPara.startsWith('Este ') ||
            firstPara.startsWith('Ambas ') ||
            /^\d+\.?\s/.test(firstPara); // Starts with a number (like "1. ...")

          // If it starts with FUNDACIÓN and is a full sentence (has verb patterns), it's content
          const startsWithFundacion = firstPara.startsWith('FUNDACIÓN ');
          const hasSentencePattern = startsWithFundacion && (
            firstPara.includes(' garantiza ') ||
            firstPara.includes(' declara ') ||
            firstPara.includes(' será ') ||
            firstPara.includes(' expresamente ') ||
            firstPara.length > 70
          );

          // It's a subtitle if: short AND doesn't look like a sentence AND not a FUNDACIÓN sentence
          const isSubtitle = isShort && !startsLikeSentence && !hasSentencePattern;

          if (isSubtitle) {
            // First paragraph is subtitle
            subtitle = firstPara.replace(/\n/g, ' ').trim();
            contentParagraphs = paragraphs.slice(1);
          } else {
            // No subtitle, all content
            contentParagraphs = paragraphs;
          }
        }

        yPos += 5;

        // Build the title
        const fullTitle = subtitle ? `${part} ${subtitle}` : part;

        // Calculate how much space the title will need
        doc.setFontSize(11);
        const titleLines = doc.splitTextToSize(fullTitle, pageWidth - 40);
        const titleHeight = titleLines.length * (11 * 0.4 + 2) + 3;

        // Estimate minimum content height (at least 3-4 lines of first paragraph)
        const minContentHeight = 25;

        // If title + minimum content won't fit on this page, start a new page
        if (yPos + titleHeight + minContentHeight > 270) {
          doc.addPage();
          yPos = 20;
        }

        // Now print the title
        addText(fullTitle, 20, 11, pageWidth - 40, true);

        // Print content paragraphs
        for (const para of contentParagraphs) {
          // Check if this paragraph contains cuotas (payment schedule)
          if (para.includes('Cuota N°')) {
            // Split by "Cuota N°" to get each cuota on its own line
            const cuotaPattern = /(Cuota N°\s*\d+:[^C]*?)(?=Cuota N°|$)/g;
            const cuotaMatches = para.match(cuotaPattern);

            if (cuotaMatches && cuotaMatches.length > 0) {
              // Print text before the first cuota
              const firstCuotaIndex = para.indexOf('Cuota N°');
              if (firstCuotaIndex > 0) {
                const textBefore = para.substring(0, firstCuotaIndex).replace(/\n/g, ' ').replace(/  +/g, ' ').trim();
                if (textBefore) {
                  addText(textBefore, 20, 10);
                }
              }

              // Print each cuota on its own line
              for (const cuota of cuotaMatches) {
                const cleanCuota = cuota.replace(/\n/g, ' ').replace(/  +/g, ' ').trim();
                if (cleanCuota) {
                  addText(cleanCuota, 20, 10);
                }
              }
            } else {
              // Fallback: just print the paragraph
              const cleanPara = para.replace(/\n/g, ' ').replace(/  +/g, ' ').trim();
              if (cleanPara) {
                addText(cleanPara, 20, 10);
              }
            }
          } else if (/\d+\.\s/.test(para)) {
            // Paragraph contains numbered items (1. 2. 3. etc.) - split them onto separate lines
            // Use a different approach: split on the pattern that marks the START of each numbered item
            // Look for numbers at the beginning or after whitespace: "1. ", "2. ", etc.

            // First, find all positions where numbered items start
            const itemStarts: number[] = [];
            const itemStartPattern = /(?:^|\s)(\d+)\.\s/g;
            let match;
            while ((match = itemStartPattern.exec(para)) !== null) {
              // Check if this looks like a list item number (1-20) vs a date/amount
              const num = parseInt(match[1]);
              if (num >= 1 && num <= 20) {
                itemStarts.push(match.index === 0 ? 0 : match.index + 1); // +1 to skip the leading space
              }
            }

            if (itemStarts.length > 1) {
              // Print text before the first numbered item (if any)
              if (itemStarts[0] > 0) {
                const textBefore = para.substring(0, itemStarts[0]).replace(/\n/g, ' ').replace(/  +/g, ' ').trim();
                if (textBefore) {
                  addText(textBefore, 20, 10);
                }
              }

              // Extract and print each numbered item
              for (let idx = 0; idx < itemStarts.length; idx++) {
                const start = itemStarts[idx];
                const end = idx < itemStarts.length - 1 ? itemStarts[idx + 1] : para.length;
                const item = para.substring(start, end).replace(/\n/g, ' ').replace(/  +/g, ' ').trim();
                if (item) {
                  addText(item, 20, 10);
                }
              }
            } else {
              // Only one or no numbered items, print normally
              const cleanPara = para.replace(/\n/g, ' ').replace(/  +/g, ' ').trim();
              if (cleanPara) {
                addText(cleanPara, 20, 10);
              }
            }
          } else if (/[a-d]\.\s/.test(para) && para.includes('a.') && para.includes('b.')) {
            // Paragraph contains lettered items (a. b. c. d.) - split them onto separate lines
            // Use a more specific pattern that looks for "a. ", "b. ", "c. ", "d. " followed by content
            const letteredPattern = /([a-d]\.\s+.*?)(?=\s+[a-d]\.\s|$)/g;
            const letteredMatches = para.match(letteredPattern);

            if (letteredMatches && letteredMatches.length > 1) {
              // Print text before the first lettered item (if any)
              const firstLetterIndex = para.search(/[a-d]\.\s/);
              if (firstLetterIndex > 0) {
                const textBefore = para.substring(0, firstLetterIndex).replace(/\n/g, ' ').replace(/  +/g, ' ').trim();
                if (textBefore) {
                  addText(textBefore, 20, 10);
                }
              }

              // Print each lettered item on its own line
              for (const item of letteredMatches) {
                const cleanItem = item.replace(/\n/g, ' ').replace(/  +/g, ' ').trim();
                if (cleanItem) {
                  addText(cleanItem, 20, 10);
                }
              }
            } else {
              // Only one or no lettered items, print normally
              const cleanPara = para.replace(/\n/g, ' ').replace(/  +/g, ' ').trim();
              if (cleanPara) {
                addText(cleanPara, 20, 10);
              }
            }
          } else {
            // Regular paragraph: replace single newlines with spaces
            const cleanPara = para.replace(/\n/g, ' ').replace(/  +/g, ' ').trim();
            if (cleanPara) {
              addText(cleanPara, 20, 10);
            }
          }
        }

        i++; // Skip the next part since we processed it
      }
    }

    // Add signatures
    yPos += 30;
    if (yPos > 220) {
      doc.addPage();
      yPos = 60;
    }

    // Signature lines
    doc.line(30, yPos, 90, yPos);
    doc.line(120, yPos, 180, yPos);

    yPos += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text((clienteForm.nombre_representante || '').toUpperCase(), 60, yPos, { align: 'center' });
    doc.text('ARNOLDO CISTERNAS CHÁVEZ', 150, yPos, { align: 'center' });

    yPos += 4;
    doc.text(`p.p. ${(clienteForm.nombre_legal || '').toUpperCase()}`, 60, yPos, { align: 'center' });
    doc.text('p.p. FUNDACIÓN NUEVA EDUCACIÓN', 150, yPos, { align: 'center' });

    return doc;
  };

  // Validation
  const isStepValid = () => {
    switch (step) {
      case 'cliente':
        // For manual contracts, require less information
        if (esManual) {
          return clienteForm.nombre_legal && clienteForm.rut && 
                 clienteForm.nombre_contacto_administrativo && clienteForm.email_contacto_administrativo;
        }
        return clienteForm.nombre_legal && clienteForm.nombre_fantasia && 
               clienteForm.rut && clienteForm.direccion && clienteForm.comuna && 
               clienteForm.ciudad && clienteForm.nombre_representante;
      case 'contrato':
        // For manual contracts, validate description instead of program
        if (esManual) {
          return contractForm.numero_contrato && contractForm.fecha_contrato && 
                 contractForm.fecha_fin && contractForm.descripcion_manual && contractForm.precio_total_uf > 0;
        }
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
      {/* Show notification if data was imported from PDF */}
      {extractedData && (
        <div className="bg-purple-50 border-b border-purple-200 px-6 py-3">
          <div className="flex items-center">
            <FileText className="text-purple-600 mr-3" size={20} />
            <div className="flex-1">
              <p className="text-purple-900 font-medium">Datos importados desde PDF</p>
              <p className="text-purple-700 text-sm">
                Los campos han sido pre-llenados con la información extraída. Por favor, revise y complete los campos faltantes.
              </p>
            </div>
            {extractedData.overall_confidence && (
              <div className="ml-4">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  extractedData.overall_confidence >= 0.8 ? 'bg-green-100 text-green-800' :
                  extractedData.overall_confidence >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  Confianza: {Math.round(extractedData.overall_confidence * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      
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

            {/* Manual Contract Toggle and PDF Import Options */}
            <div className="space-y-3">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={esManual}
                    onChange={(e) => setEsManual(e.target.checked)}
                    className="mr-3 h-4 w-4 text-brand_blue focus:ring-brand_blue border-gray-300 rounded"
                  />
                  <div>
                    <span className="font-medium text-gray-900">Contrato Manual (Subir PDF existente)</span>
                    <p className="text-sm text-gray-600 mt-1">
                      Marque esta opción para contratos creados fuera del sistema. Solo se solicitará información operativa.
                    </p>
                  </div>
                </label>
              </div>
              
              {/* AI PDF Import Button */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-purple-900">¿Tiene un PDF de contrato?</p>
                    <p className="text-sm text-purple-700 mt-1">
                      Use AI para extraer automáticamente la información del contrato
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      // Trigger PDF import modal from parent
                      window.dispatchEvent(new CustomEvent('openPDFImporterFromForm'));
                    }}
                    className="inline-flex items-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors"
                  >
                    <Upload className="mr-2" size={16} />
                    Importar con AI
                  </button>
                </div>
              </div>
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

            {/* School Selection */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  <Building className="inline mr-2" size={16} />
                  Escuela Asociada
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewSchoolForm(!showNewSchoolForm)}
                  className="text-sm text-brand_blue hover:text-brand_blue/80 font-medium"
                >
                  {showNewSchoolForm ? 'Cancelar' : '+ Nueva Escuela'}
                </button>
              </div>
              
              {!showNewSchoolForm ? (
                <select
                  value={selectedSchoolId}
                  onChange={(e) => {
                    const schoolId = e.target.value ? parseInt(e.target.value) : '';
                    setSelectedSchoolId(schoolId);
                    
                    // If a school is selected, update client form with school data
                    if (schoolId && typeof schoolId === 'number') {
                      const school = schools.find(s => s.id === schoolId);
                      if (school && !selectedClienteId) {
                        setClienteForm(prev => ({
                          ...prev,
                          nombre_fantasia: school.name,
                          direccion: school.address || prev.direccion,
                          ciudad: school.region || prev.ciudad
                        }));
                      }
                    }
                  }}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                >
                  <option value="">-- Sin escuela asociada --</option>
                  {schools.filter(school => !school.cliente_id || school.cliente_id === selectedClienteId).map(school => (
                    <option key={school.id} value={school.id}>
                      {school.name} {school.code ? `(${school.code})` : ''}
                      {school.cliente_id && school.cliente_id !== selectedClienteId ? ' (Vinculada a otro cliente)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-3">
                  <div>
                    <input
                      type="text"
                      value={newSchoolForm.name}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, name: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                      placeholder="Nombre de la escuela *"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newSchoolForm.code}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, code: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                      placeholder="Código"
                    />
                    <input
                      type="text"
                      value={newSchoolForm.region}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, region: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                      placeholder="Región"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={newSchoolForm.address}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, address: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                      placeholder="Dirección"
                    />
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="has_generations"
                      checked={newSchoolForm.has_generations}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, has_generations: e.target.checked })}
                      className="mr-2 h-4 w-4 text-brand_blue focus:ring-brand_blue border-gray-300 rounded"
                    />
                    <label htmlFor="has_generations" className="text-sm text-gray-700">
                      Esta escuela maneja generaciones
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateSchool}
                    disabled={loading || !newSchoolForm.name.trim()}
                    className="w-full px-4 py-2 bg-brand_blue text-white rounded-lg hover:bg-brand_blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Creando...' : 'Crear Escuela'}
                  </button>
                </div>
              )}
              
              {selectedSchoolId && (
                <p className="text-xs text-gray-500 mt-2">
                  La escuela y el cliente quedarán vinculados automáticamente
                </p>
              )}
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

            {/* Additional Legal Information - Hide for manual contracts */}
            {!esManual && (
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
            )}

            {/* Project Manager Information - Hide for manual contracts */}
            {!esManual && (
            <div className="border-t pt-6">
              <h4 className="text-md font-semibold text-brand_blue mb-4">Encargado del Proyecto</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre del Encargado
                  </label>
                  <input
                    type="text"
                    value={clienteForm.nombre_encargado_proyecto}
                    onChange={(e) => setClienteForm({ ...clienteForm, nombre_encargado_proyecto: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                    placeholder="Nombre completo"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={clienteForm.telefono_encargado_proyecto}
                    onChange={(e) => setClienteForm({ ...clienteForm, telefono_encargado_proyecto: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                    placeholder="+56 9 1234 5678"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={clienteForm.email_encargado_proyecto}
                    onChange={(e) => setClienteForm({ ...clienteForm, email_encargado_proyecto: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                    placeholder="encargado@colegio.cl"
                  />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-sm text-gray-600">
                  Esta información es necesaria para la gestión de facturación y seguimiento del proyecto.
                </p>
              </div>
            </div>
            )}

            {/* Administrative Contact Information - ALWAYS SHOW for invoicing */}
            <div className="border-t pt-6">
              <h4 className="text-md font-semibold text-brand_blue mb-4">Contacto Administrativo {esManual && '(Requerido para facturación)'}</h4>
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <span className="text-yellow-400 text-lg">📧</span>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-800">
                      <strong>Importante:</strong> Esta es la persona que recibirá todas las facturas y documentos administrativos del contrato.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre del Contacto Administrativo
                  </label>
                  <input
                    type="text"
                    value={clienteForm.nombre_contacto_administrativo}
                    onChange={(e) => setClienteForm({ ...clienteForm, nombre_contacto_administrativo: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                    placeholder="Nombre completo"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Teléfono de Facturación
                  </label>
                  <input
                    type="tel"
                    value={clienteForm.telefono_contacto_administrativo}
                    onChange={(e) => setClienteForm({ ...clienteForm, telefono_contacto_administrativo: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                    placeholder="+56 2 2345 6789"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email de Facturación
                  </label>
                  <input
                    type="email"
                    value={clienteForm.email_contacto_administrativo}
                    onChange={(e) => setClienteForm({ ...clienteForm, email_contacto_administrativo: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                    placeholder="administracion@colegio.cl"
                  />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-sm text-gray-600">
                  <strong>Nota:</strong> Las facturas y documentos administrativos se enviarán a este contacto por email.
                </p>
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

            {/* Show notice for manual contracts */}
            {esManual && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800">
                  📄 <strong>Contrato Manual</strong> - Solo ingrese información necesaria para gestión operativa y pagos.
                </p>
              </div>
            )}

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
              
              {/* For manual contracts, show description field instead of program selection */}
              {esManual ? (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descripción del Contrato *
                  </label>
                  <textarea
                    value={contractForm.descripcion_manual}
                    onChange={(e) => setContractForm({ ...contractForm, descripcion_manual: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                    placeholder="Ej: Asesoría personalizada Q1 2025, Programa piloto región sur, Capacitación especial..."
                    rows={3}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Breve descripción del servicio o programa que cubre este contrato
                  </p>
                </div>
              ) : (
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
              )}

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

            {/* PDF Upload Notice for Manual Contracts */}
            {esManual && (
              <div className="mt-6 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50">
                <Upload size={32} className="mx-auto mb-3 text-gray-400" />
                <p className="font-medium text-gray-900 mb-2">El PDF del contrato se subirá después de guardar</p>
                <p className="text-sm text-gray-600">Una vez guardada la información, podrá cargar el PDF desde el listado de contratos</p>
              </div>
            )}
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
                {/* Save as Draft button */}
                <button
                  type="button"
                  onClick={handleSaveAsDraft}
                  disabled={savingAsDraft}
                  className="flex items-center px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  title="Guardar progreso sin finalizar el contrato"
                >
                  {savingAsDraft ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Guardando borrador...
                    </>
                  ) : (
                    <>
                      <Save size={16} className="mr-2" />
                      Guardar Borrador
                    </>
                  )}
                </button>
                {/* Only show PDF generation for standard contracts */}
                {!esManual && (
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
                )}
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
