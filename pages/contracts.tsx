import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabase';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import Head from 'next/head';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import MainLayout from '../components/layout/MainLayout';
import { ArrowLeft, FileText, Plus, Calendar, DollarSign, Users, Eye, Download, Trash2, CheckSquare, Square, Upload, TrendingUp, Edit, FileUp } from 'lucide-react';
import ContractForm from '../components/contracts/ContractForm';
import AnnexForm from '../components/contracts/AnnexForm';
import CashFlowView from '../components/contracts/CashFlowView';
import ContractDetailsModal from '../components/contracts/ContractDetailsModal';
import ContractPDFImporter from '../components/contracts/ContractPDFImporter';
import { ResponsiveFunctionalPageHeader } from '../components/layout/FunctionalPageHeader';

import { getUserPrimaryRole } from '../utils/roleUtils';
interface Programa {
  id: string;
  nombre: string;
  descripcion: string;
  horas_totales: number;
  modalidad: string;
  codigo_servicio: string;
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
}

interface Contrato {
  id: string;
  numero_contrato: string;
  fecha_contrato: string;
  fecha_fin?: string;
  cliente_id: string;
  programa_id: string;
  precio_total_uf: number;
  tipo_moneda?: 'UF' | 'CLP';
  firmado?: boolean;
  estado?: 'pendiente' | 'activo' | 'borrador';
  incluir_en_flujo?: boolean;
  contrato_url?: string;
  is_anexo?: boolean;
  parent_contrato_id?: string;
  anexo_numero?: number;
  anexo_fecha?: string;
  numero_participantes?: number;
  nombre_ciclo?: 'Primer Ciclo' | 'Segundo Ciclo' | 'Tercer Ciclo' | 'Equipo Directivo';
  es_manual?: boolean; // New field for manual contracts
  descripcion_manual?: string; // New field for manual contract description
  clientes: Cliente;
  programas: Programa;
  cuotas?: Cuota[];
  parent_contract?: Contrato; // For displaying parent contract info
}

interface Cuota {
  id: string;
  contrato_id: string;
  numero_cuota: number;
  fecha_vencimiento: string;
  monto_uf: number;
  pagada: boolean;
  created_at: string;
  factura_url?: string;
  factura_pagada?: boolean;
  factura_filename?: string;
  factura_size?: number;
  factura_type?: string;
  factura_uploaded_at?: string;
}

export default function ContractsPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  
  // Data states
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // View states
  const [activeTab, setActiveTab] = useState<'lista' | 'nuevo' | 'editar' | 'flujo' | 'nuevo-anexo' | 'editar-anexo'>('lista');
  const [selectedContrato, setSelectedContrato] = useState<Contrato | null>(null);
  const [editingContrato, setEditingContrato] = useState<Contrato | null>(null);
  const [editingAnexo, setEditingAnexo] = useState<Contrato | null>(null);
  const [deleteModalContrato, setDeleteModalContrato] = useState<Contrato | null>(null);
  const [preSelectedClientId, setPreSelectedClientId] = useState<string | null>(null);
  const [uploadingContrato, setUploadingContrato] = useState<string | null>(null);
  const [showPDFImporter, setShowPDFImporter] = useState(false);
  const [extractedContractData, setExtractedContractData] = useState<any>(null);

  // Listen for PDF import event from contract form
  useEffect(() => {
    const handleOpenPDFImporter = () => {
      setShowPDFImporter(true);
    };
    
    window.addEventListener('openPDFImporterFromForm', handleOpenPDFImporter);
    
    return () => {
      window.removeEventListener('openPDFImporterFromForm', handleOpenPDFImporter);
    };
  }, []);
  
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }
        
        setCurrentUser(session.user);
        
        // Check if user is admin
        const { data: profile } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', session.user.id)
          .single();
        
        const userRole = await getUserPrimaryRole(session.user.id);
        if (!profile || userRole !== 'admin') {
          router.push('/dashboard');
          return;
        }
        
        setIsAdmin(true);
        if (profile.avatar_url) {
          setAvatarUrl(profile.avatar_url);
        }
        
        // Load data
        await Promise.all([
          loadContratos(),
          loadProgramas(),
          loadClientes()
        ]);
        
        // Check if coming from schools page with pre-selected client
        const { cliente_id, school_name } = router.query;
        if (cliente_id && typeof cliente_id === 'string') {
          setActiveTab('nuevo');
          setPreSelectedClientId(cliente_id);
          if (school_name && typeof school_name === 'string') {
            toast.success(`Creando contrato para: ${decodeURIComponent(school_name)}`);
          }
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error in checkSession:', error);
        setLoading(false);
        router.push('/login');
      }
    };
    
    checkSession();
  }, [router]);

  const loadContratos = async () => {
    try {
      const { data, error } = await supabase
        .from('contratos')
        .select(`
          *,
          clientes(*),
          programas(*),
          cuotas(*)
        `)
        .order('fecha_contrato', { ascending: false });

      if (error) throw error;
      setContratos(data || []);
    } catch (error) {
      console.error('Error loading contracts:', error);
    }
  };

  const loadProgramas = async () => {
    try {
      const { data, error } = await supabase
        .from('programas')
        .select('*')
        .order('nombre');

      if (error) throw error;
      setProgramas(data || []);
    } catch (error) {
      console.error('Error loading programs:', error);
    }
  };

  const loadClientes = async () => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*, school_id')
        .order('nombre_legal');

      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  const formatCurrency = (amount: number) => {
    // Only show decimals if the amount has non-zero decimal places
    const hasDecimals = amount % 1 !== 0;
    return `UF ${amount.toLocaleString('es-CL', { 
      minimumFractionDigits: hasDecimals ? 2 : 0, 
      maximumFractionDigits: 2 
    })}`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    // Parse as local date to avoid timezone conversion issues
    const parts = dateString.split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day).toLocaleDateString('es-CL');
    }
    return new Date(dateString).toLocaleDateString('es-CL');
  };

  const handleDeleteContract = async (contrato: Contrato) => {
    try {
      // Delete cuotas first (foreign key constraint)
      const { error: cuotasError } = await supabase
        .from('cuotas')
        .delete()
        .eq('contrato_id', contrato.id);

      if (cuotasError) throw cuotasError;

      // Delete contract
      const { error: contratoError } = await supabase
        .from('contratos')
        .delete()
        .eq('id', contrato.id);

      if (contratoError) throw contratoError;

      // Refresh the contracts list
      await loadContratos();
      setDeleteModalContrato(null);
      
    } catch (error) {
      console.error('Error deleting contract:', error);
      toast.error('Error al eliminar el contrato: ' + (error as Error).message);
    }
  };

  const handleToggleSigned = async (contrato: Contrato) => {
    try {
      const newSignedStatus = !contrato.firmado;
      
      const { error } = await supabase
        .from('contratos')
        .update({ firmado: newSignedStatus })
        .eq('id', contrato.id);

      if (error) throw error;

      // Refresh the contracts list
      await loadContratos();
    } catch (error) {
      console.error('Error updating contract signed status:', error);
      toast.error('Error al actualizar el estado del contrato: ' + (error as Error).message);
    }
  };

  const handleUploadContract = async (contrato: Contrato, file: File) => {
    try {
      setUploadingContrato(contrato.id);
      
      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${contrato.numero_contrato}_${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('contratos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('contratos')
        .getPublicUrl(fileName);

      // Update contract status to active and save file URL
      const { error: updateError } = await supabase
        .from('contratos')
        .update({ 
          estado: 'activo',
          contrato_url: publicUrl
        })
        .eq('id', contrato.id);

      if (updateError) throw updateError;

      // Refresh the contracts list
      await loadContratos();
      
    } catch (error) {
      console.error('Error uploading contract:', error);
      toast.error('Error al subir el contrato: ' + (error as Error).message);
    } finally {
      setUploadingContrato(null);
    }
  };

  const handleToggleCashFlow = async (contrato: Contrato) => {
    try {
      console.log('Toggling cash flow for contract:', contrato.numero_contrato);
      console.log('Current incluir_en_flujo status:', contrato.incluir_en_flujo);
      
      const newCashFlowStatus = !contrato.incluir_en_flujo;
      console.log('New status will be:', newCashFlowStatus);
      
      const { data, error } = await supabase
        .from('contratos')
        .update({ incluir_en_flujo: newCashFlowStatus })
        .eq('id', contrato.id)
        .select();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log('Update successful, updated data:', data);

      // Refresh the contracts list
      await loadContratos();
      
      // Show success message
      toast.success(`Contrato ${newCashFlowStatus ? 'incluido en' : 'removido del'} flujo de caja exitosamente.`);
    } catch (error) {
      console.error('Error updating cash flow status:', error);
      toast.error('Error al actualizar el flujo de caja: ' + (error as Error).message);
    }
  };

  const handleInvoiceUpload = async (cuotaId: string, file: File) => {
    try {
      // Validate file type and size
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!validTypes.includes(file.type)) {
        toast.error('Tipo de archivo no válido. Use PDF, JPG o PNG.');
        return;
      }
      
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        toast.error('El archivo es demasiado grande. Máximo 10MB.');
        return;
      }
      
      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `invoice_${cuotaId}_${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('facturas')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('facturas')
        .getPublicUrl(fileName);

      // Update cuota with invoice URL and metadata
      const { error: updateError } = await supabase
        .from('cuotas')
        .update({ 
          factura_url: publicUrl,
          factura_filename: file.name,
          factura_size: file.size,
          factura_type: file.type,
          factura_uploaded_at: new Date().toISOString()
        })
        .eq('id', cuotaId);

      if (updateError) throw updateError;

      // Show success notification
      toast.success(`Factura subida exitosamente: ${file.name}`);
      
      // Refresh the contracts list to update the modal
      await loadContratos();
      
      // Force refresh the modal if it's open by re-fetching the specific contract
      if (selectedContrato) {
        const { data: refreshedContract, error: refreshError } = await supabase
          .from('contratos')
          .select(`
            *,
            clientes(*),
            programas(*),
            cuotas(*)
          `)
          .eq('id', selectedContrato.id)
          .single();
          
        if (!refreshError && refreshedContract) {
          setSelectedContrato(refreshedContract);
        }
      }
      
    } catch (error) {
      console.error('Error uploading invoice:', error);
      toast.error('Error al subir la factura: ' + (error as Error).message);
    }
  };

  const handleTogglePaymentStatus = async (cuotaId: string, currentStatus: boolean) => {
    try {
      console.log(`Toggling payment status for cuota ${cuotaId}: ${currentStatus} -> ${!currentStatus}`);
      
      const { error } = await supabase
        .from('cuotas')
        .update({ 
          pagada: !currentStatus
        })
        .eq('id', cuotaId);

      if (error) throw error;

      // Show success notification
      toast.success(`Cuota marcada como ${!currentStatus ? 'pagada' : 'pendiente'}`);

      // Refresh the contracts list to update the modal
      await loadContratos();
      
      // Force refresh the modal if it's open by re-fetching the specific contract
      if (selectedContrato) {
        const { data: refreshedContract, error: refreshError } = await supabase
          .from('contratos')
          .select(`
            *,
            clientes(*),
            programas(*),
            cuotas(*)
          `)
          .eq('id', selectedContrato.id)
          .single();
          
        if (!refreshError && refreshedContract) {
          setSelectedContrato(refreshedContract);
        }
      }
      
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast.error('Error al actualizar el estado de pago: ' + (error as Error).message);
    }
  };

  const handleInvoiceDelete = async (cuotaId: string) => {
    try {
      // Get the cuota to find the invoice URL
      const { data: cuota, error: fetchError } = await supabase
        .from('cuotas')
        .select('factura_url')
        .eq('id', cuotaId)
        .single();

      if (fetchError) throw fetchError;
      if (!cuota?.factura_url) {
        toast.error('No se encontró la factura');
        return;
      }

      // Extract the file name from the URL more robustly
      let fileName: string;
      try {
        const url = new URL(cuota.factura_url);
        const pathParts = url.pathname.split('/');
        // Find the index of 'facturas' bucket and get the file name after it
        const bucketIndex = pathParts.indexOf('facturas');
        if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
          fileName = pathParts.slice(bucketIndex + 1).join('/');
        } else {
          // Fallback to the last part of the path
          fileName = pathParts[pathParts.length - 1];
        }
        
        if (!fileName) {
          throw new Error('No file name found in URL');
        }
      } catch (error) {
        console.error('Error parsing invoice URL:', error);
        toast.error('Error al obtener el nombre del archivo');
        return;
      }

      // Delete the file from storage
      const { error: deleteError } = await supabase.storage
        .from('facturas')
        .remove([fileName]);

      if (deleteError) throw deleteError;

      // Update the cuota to remove the invoice URL and metadata
      const { error: updateError } = await supabase
        .from('cuotas')
        .update({ 
          factura_url: null,
          factura_pagada: false,
          factura_filename: null,
          factura_size: null,
          factura_type: null,
          factura_uploaded_at: null
        })
        .eq('id', cuotaId);

      if (updateError) throw updateError;

      // Show success notification
      toast.success('Factura eliminada exitosamente');

      // Refresh the contracts list to update the modal
      await loadContratos();
      
      // Force refresh the modal if it's open by re-fetching the specific contract
      if (selectedContrato) {
        const { data: refreshedContract, error: refreshError } = await supabase
          .from('contratos')
          .select(`
            *,
            clientes(*),
            programas(*),
            cuotas(*)
          `)
          .eq('id', selectedContrato.id)
          .single();
          
        if (!refreshError && refreshedContract) {
          setSelectedContrato(refreshedContract);
        }
      }
      
    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast.error('Error al eliminar la factura: ' + (error as Error).message);
    }
  };

  const prepareContractForPDF = (contrato: Contrato) => {
    return {
      numero_contrato: contrato.numero_contrato,
      fecha_contrato: contrato.fecha_contrato,
      fecha_fin: contrato.fecha_fin,
      precio_total_uf: contrato.precio_total_uf,
      tipo_moneda: contrato.tipo_moneda || 'UF',
      cliente: {
        nombre_legal: contrato.clientes.nombre_legal,
        nombre_fantasia: contrato.clientes.nombre_fantasia,
        rut: contrato.clientes.rut,
        direccion: contrato.clientes.direccion,
        comuna: contrato.clientes.comuna,
        ciudad: contrato.clientes.ciudad,
        nombre_representante: contrato.clientes.nombre_representante,
        rut_representante: contrato.clientes.rut_representante,
        fecha_escritura: contrato.clientes.fecha_escritura,
        nombre_notario: contrato.clientes.nombre_notario,
        comuna_notaria: contrato.clientes.comuna_notaria,
      },
      programa: {
        nombre: contrato.programas.nombre,
        descripcion: contrato.programas.descripcion,
        horas_totales: contrato.programas.horas_totales,
        modalidad: contrato.programas.modalidad,
      },
      cuotas: contrato.cuotas || []
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand_beige flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_primary mx-auto"></div>
          <p className="mt-4 text-brand_primary font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout 
      user={currentUser} 
      currentPage="contracts"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      {(activeTab === 'lista' || activeTab === 'flujo') && (
        <ResponsiveFunctionalPageHeader
          icon={<FileText />}
          title="Contratos"
          subtitle="Gestión de contratos, anexos y flujo de caja"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Buscar por número, cliente..."
          primaryAction={{
            label: "Nuevo Contrato",
            onClick: () => setActiveTab('nuevo'),
            icon: <Plus size={20} />
          }}
        >
          {/* Additional action buttons */}
          <button
            onClick={() => setShowPDFImporter(true)}
            className="inline-flex items-center px-4 py-2 border border-amber-600 text-sm font-medium rounded-md text-amber-600 bg-white hover:bg-amber-50"
            title="Importar contrato desde PDF usando AI"
          >
            <FileUp size={16} className="mr-2" />
            Importar PDF
          </button>
          <button
            onClick={() => setActiveTab('nuevo-anexo')}
            className="inline-flex items-center px-4 py-2 border border-[#0a0a0a] text-sm font-medium rounded-md text-[#0a0a0a] bg-white hover:bg-gray-50"
          >
            <Plus size={16} className="mr-2" />
            Nuevo Anexo
          </button>
          <button
            onClick={() => setActiveTab('flujo')}
            className={`inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md transition-colors ${
              activeTab === 'flujo'
                ? 'bg-brand_accent text-brand_primary border-brand_accent'
                : 'border-brand_accent text-brand_accent bg-white hover:bg-amber-50'
            }`}
          >
            <TrendingUp size={16} className="mr-2" />
            Flujo de Caja
          </button>
        </ResponsiveFunctionalPageHeader>
      )}
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-7xl mx-auto">

            {/* Form Header for nuevo/editar modes */}
            {(activeTab === 'nuevo' || activeTab === 'editar' || activeTab === 'nuevo-anexo' || activeTab === 'editar-anexo') && (
              <div className="mb-8">
                <div className="flex items-center space-x-4 mb-6">
                  <button
                    onClick={() => setActiveTab('lista')}
                    className="inline-flex items-center text-brand_primary hover:text-brand_accent transition-colors"
                  >
                    <ArrowLeft className="mr-2" size={20} />
                    Volver a Contratos
                  </button>
                  <div className="h-6 w-px bg-gray-300"></div>
                  <h1 className="text-3xl font-bold text-brand_primary flex items-center">
                    <FileText className="mr-3" size={32} />
                    {activeTab === 'nuevo' ? 'Crear Nuevo Contrato' : 
                     activeTab === 'nuevo-anexo' ? 'Crear Nuevo Anexo' : 
                     activeTab === 'editar-anexo' ? 'Editar Anexo' : 'Editar Contrato'}
                  </h1>
                </div>
              </div>
            )}

            {/* Content based on active tab */}
            {activeTab === 'lista' && (
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-brand_primary">
                    Contratos Registrados ({contratos.length})
                  </h2>
                </div>

                {contratos.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse bg-white">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left py-4 px-4 font-semibold text-brand_primary">N° Contrato</th>
                          <th className="text-left py-4 px-4 font-semibold text-brand_primary">Cliente</th>
                          <th className="text-left py-4 px-4 font-semibold text-brand_primary">Fecha</th>
                          <th className="text-left py-4 px-4 font-semibold text-brand_primary">Valor Total</th>
                          <th className="text-left py-4 px-4 font-semibold text-brand_primary">Estado</th>
                          <th className="text-left py-4 px-4 font-semibold text-brand_primary"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {contratos
                          .filter(contrato => {
                            if (!searchQuery.trim()) return true;
                            const query = searchQuery.toLowerCase();
                            return (
                              contrato.numero_contrato.toLowerCase().includes(query) ||
                              contrato.clientes.nombre_legal.toLowerCase().includes(query) ||
                              contrato.clientes.nombre_fantasia?.toLowerCase().includes(query) ||
                              contrato.programas.nombre.toLowerCase().includes(query)
                            );
                          })
                          .map((contrato) => (
                          <tr key={contrato.id} className="border-b border-gray-100 hover:bg-brand_beige transition-colors">
                            <td className="py-4 px-4">
                              <button
                                onClick={() => setSelectedContrato(contrato)}
                                className="font-medium text-brand_primary hover:text-brand_accent hover:underline cursor-pointer"
                              >
                                {contrato.numero_contrato}
                                {contrato.is_anexo && (
                                  <span className="ml-2 px-2 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">
                                    ANEXO
                                  </span>
                                )}
                                {contrato.es_manual && (
                                  <span className="ml-2 px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
                                    MANUAL
                                  </span>
                                )}
                                {contrato.estado === 'borrador' && (
                                  <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                                    BORRADOR
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className="py-4 px-4">
                              <div>
                                <div className="font-medium text-gray-900">{contrato.clientes.nombre_legal}</div>
                                <div className="text-sm text-gray-500">
                                  {contrato.es_manual ? (
                                    contrato.descripcion_manual || 'Contrato Manual'
                                  ) : (
                                    contrato.clientes.nombre_fantasia
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="text-sm text-gray-900">
                                {formatDate(contrato.fecha_contrato)}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="font-semibold text-brand_primary">
                                {formatCurrency(contrato.precio_total_uf)}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center space-x-2">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                  contrato.estado === 'activo'
                                    ? 'bg-amber-100 text-amber-800'
                                    : contrato.estado === 'borrador'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {contrato.estado === 'activo' ? 'Activo' : contrato.estado === 'borrador' ? 'Borrador' : 'Pendiente'}
                                </span>
                                {contrato.incluir_en_flujo && (
                                  <span className="px-2 py-1 bg-brand_beige text-brand_primary rounded-full text-xs font-medium">
                                    En Flujo
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => setSelectedContrato(contrato)}
                                  className="p-2 text-brand_primary hover:bg-brand_beige rounded-lg transition-colors"
                                  title="Ver detalles"
                                >
                                  <Eye size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-16 px-6">
                    <FileText className="mx-auto mb-4 text-gray-300" size={64} />
                    <h3 className="text-xl font-medium text-gray-600 mb-2">No hay contratos registrados</h3>
                    <p className="text-gray-500 mb-6">Comienza creando tu primer contrato</p>
                    <button
                      onClick={() => setActiveTab('nuevo')}
                      className="bg-brand_accent text-brand_primary px-6 py-3 rounded-lg font-medium hover:bg-amber-400 transition-colors flex items-center mx-auto"
                    >
                      <Plus className="mr-2" size={20} />
                      Crear Primer Contrato
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'nuevo' && (
              <ContractForm
                programas={programas}
                clientes={clientes}
                preSelectedClientId={preSelectedClientId}
                extractedData={extractedContractData}
                onSuccess={() => {
                  setActiveTab('lista');
                  setPreSelectedClientId(null);
                  setExtractedContractData(null);
                  loadContratos();
                }}
                onCancel={() => {
                  setActiveTab('lista');
                  setPreSelectedClientId(null);
                  setExtractedContractData(null);
                }}
              />
            )}

            {activeTab === 'editar' && editingContrato && (
              <ContractForm
                programas={programas}
                clientes={clientes}
                editingContract={editingContrato}
                onSuccess={() => {
                  setActiveTab('lista');
                  setEditingContrato(null);
                  loadContratos();
                }}
                onCancel={() => {
                  setActiveTab('lista');
                  setEditingContrato(null);
                }}
              />
            )}

            {activeTab === 'nuevo-anexo' && (
              <AnnexForm
                clientes={clientes}
                onSuccess={() => {
                  setActiveTab('lista');
                  loadContratos();
                }}
                onCancel={() => setActiveTab('lista')}
              />
            )}

            {activeTab === 'editar-anexo' && editingAnexo && (
              <AnnexForm
                clientes={clientes}
                editingAnnex={editingAnexo}
                onSuccess={() => {
                  setActiveTab('lista');
                  setEditingAnexo(null);
                  loadContratos();
                }}
                onCancel={() => {
                  setActiveTab('lista');
                  setEditingAnexo(null);
                }}
              />
            )}

            {activeTab === 'flujo' && (
              <CashFlowView contratos={contratos} />
            )}

            {/* Delete Confirmation Modal */}
            {deleteModalContrato && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                  <div className="p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                        <Trash2 className="text-red-600" size={20} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Eliminar Contrato</h3>
                        <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
                      </div>
                    </div>
                    
                    <div className="mb-6">
                      <p className="text-gray-700">
                        ¿Estás seguro de que deseas eliminar el contrato{' '}
                        <span className="font-semibold text-brand_primary">{deleteModalContrato.numero_contrato}</span>?
                      </p>
                      <p className="text-sm text-gray-600 mt-2">
                        Se eliminarán también todas las cuotas asociadas a este contrato.
                      </p>
                    </div>
                    
                    <div className="flex space-x-3 justify-end">
                      <button
                        onClick={() => setDeleteModalContrato(null)}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleDeleteContract(deleteModalContrato)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        Eliminar Contrato
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Contract Details Modal */}
            <ContractDetailsModal
              contrato={selectedContrato as any}
              isOpen={!!selectedContrato}
              onClose={() => setSelectedContrato(null)}
              onEdit={(contrato) => {
                setEditingContrato(contrato);
                setSelectedContrato(null);
                setActiveTab('editar');
              }}
              onDelete={(contrato) => {
                setDeleteModalContrato(contrato);
                setSelectedContrato(null);
              }}
              onToggleCashFlow={handleToggleCashFlow}
              onUploadContract={handleUploadContract}
              onGeneratePDF={(contrato) => window.open(`/contract-print/${contrato.id}`, '_blank')}
              onUploadInvoice={handleInvoiceUpload}
              onTogglePaymentStatus={handleTogglePaymentStatus}
              onDeleteInvoice={handleInvoiceDelete}
            />

            {/* PDF Importer Modal */}
            {showPDFImporter && (
              <ContractPDFImporter
                onExtract={(data) => {
                  setExtractedContractData(data);
                  setShowPDFImporter(false);
                  setActiveTab('nuevo');
                  toast.success('Datos extraídos del PDF. Complete la información faltante.');
                }}
                onCancel={() => setShowPDFImporter(false)}
              />
            )}
          </div>
        </div>
    </MainLayout>
  );
}