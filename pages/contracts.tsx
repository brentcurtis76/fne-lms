import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabase';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import Head from 'next/head';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import MainLayout from '../components/layout/MainLayout';
import { ArrowLeft, FileText, Plus, Calendar, DollarSign, Users, Eye, Download, Trash2, CheckSquare, Square, Upload, TrendingUp, Edit, FileUp, ExternalLink } from 'lucide-react';
import ContractForm from '../components/contracts/ContractForm';
import AnnexForm from '../components/contracts/AnnexForm';
import CashFlowView from '../components/contracts/CashFlowView';
import ContractDetailsModal from '../components/contracts/ContractDetailsModal';
import ContractPDFImporter from '../components/contracts/ContractPDFImporter';
import { ResponsiveFunctionalPageHeader } from '../components/layout/FunctionalPageHeader';

import { getUserPrimaryRole } from '../utils/roleUtils';
import { contractMatchesSearch } from '../lib/utils/contract-search';
import { resolveContractPdfTarget } from '../lib/utils/contract-pdf-target';
import { isFirmaPendiente } from '../lib/utils/contract-status';

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
  // 'vigente' is the DB column default; rows created before estado was set
  // explicitly on insert carry it, so the type must represent it.
  estado?: 'pendiente' | 'activo' | 'borrador' | 'vigente';
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
  licitacion_id?: string | null; // Phase 5: link to licitacion
  horas_contratadas?: number; // Hour tracking Phase 3
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
  const [showFirmaPendiente, setShowFirmaPendiente] = useState(false);
  
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
  // Phase 5: licitacion integration
  const [activeLicitacionId, setActiveLicitacionId] = useState<string | null>(null);
  const [activeLicitacionData, setActiveLicitacionData] = useState<{
    cliente_id: string | null;
    programa_id: string;
    precio_total_uf?: number | null;
    tipo_moneda?: 'UF' | 'CLP';
    fecha_adjudicacion?: string | null;
    condiciones_pago?: string | null;
    monto_minimo?: number;
    monto_maximo?: number;
  } | null>(null);

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
        
        // Check if coming from licitacion with a specific contract to view
        const { cliente_id, school_name, tab, licitacion_id, contrato_id } = router.query;
        if (contrato_id && typeof contrato_id === 'string') {
          const { data: targetContrato } = await supabase
            .from('contratos')
            .select(`*, clientes(*), programas(*), cuotas(*)`)
            .eq('id', contrato_id)
            .single();
          if (targetContrato) {
            setSelectedContrato(targetContrato);
          }
        }
        if (cliente_id && typeof cliente_id === 'string') {
          setActiveTab('nuevo');
          setPreSelectedClientId(cliente_id);
          if (school_name && typeof school_name === 'string') {
            toast.success(`Creando contrato para: ${decodeURIComponent(school_name)}`);
          }
        }

        // Phase 5: Check if coming from a licitacion with pre-populated data
        if (tab === 'nuevo' && licitacion_id && typeof licitacion_id === 'string') {
          setActiveTab('nuevo');
          setActiveLicitacionId(licitacion_id);
          // Fetch licitacion data to pre-populate the form
          try {
            const licRes = await fetch(`/api/licitaciones/${licitacion_id}`);
            if (licRes.ok) {
              const licJson = await licRes.json();
              const lic = licJson.data?.licitacion;
              if (lic) {
                setActiveLicitacionData({
                  cliente_id: lic.cliente_id,
                  programa_id: lic.programa_id,
                  precio_total_uf: lic.monto_adjudicado_uf ?? null,
                  tipo_moneda: lic.tipo_moneda ?? 'UF',
                  fecha_adjudicacion: lic.fecha_adjudicacion ?? null,
                  condiciones_pago: lic.condiciones_pago ?? null,
                  monto_minimo: lic.monto_minimo,
                  monto_maximo: lic.monto_maximo,
                });
                toast.success('Datos de la licitacion cargados. Complete los campos del contrato.');
              }
            }
          } catch {
            toast.error('No se pudo cargar datos de la licitacion');
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

  const loadContratos = async (): Promise<Contrato[]> => {
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
      const rows = data || [];
      setContratos(rows);
      return rows;
    } catch (error) {
      console.error('Error loading contracts:', error);
      toast.error('Error al actualizar la lista de contratos: ' + (error as Error).message);
      return [];
    }
  };

  // Reload the list and, if the details modal is showing the given contract,
  // refresh it in place from the freshly loaded rows (no extra query). The
  // functional update means a modal the user closed or switched to another
  // contract while the request was in flight is never resurrected or clobbered.
  const refreshContratos = async (contratoId?: string) => {
    const rows = await loadContratos();
    if (!contratoId) return;
    const refreshed = rows.find((c) => c.id === contratoId);
    if (refreshed) {
      setSelectedContrato((prev) => (prev && prev.id === contratoId ? refreshed : prev));
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

  // Confirm the signed document was received without uploading a new file —
  // for imported contracts whose document is already on file, and for
  // contracts activated before signature tracking used the firmado flag.
  const handleMarkSigned = async (contrato: Contrato) => {
    try {
      const { error } = await supabase
        .from('contratos')
        .update({ firmado: true })
        .eq('id', contrato.id);

      if (error) throw error;

      toast.success('Contrato marcado como firmado.');
      await refreshContratos(contrato.id);
    } catch (error) {
      console.error('Error marking contract as signed:', error);
      toast.error('Error al marcar el contrato como firmado: ' + (error as Error).message);
    }
  };

  const handleUploadContract = async (contrato: Contrato, file: File) => {
    try {
      setUploadingContrato(contrato.id);
      
      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${contrato.numero_contrato}_${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('contracts')
        .getPublicUrl(fileName);

      // Uploading the signed document confirms the signature. It also
      // activates the contract (into the cash flow) when it isn't active yet;
      // a late upload to an already-active contract must NOT touch estado or
      // the flujo flag — the user may have deliberately opted out of the cash
      // flow after activating without document.
      const activating = contrato.estado !== 'activo';
      const { error: updateError } = await supabase
        .from('contratos')
        .update({
          firmado: true,
          contrato_url: publicUrl,
          ...(activating ? { estado: 'activo', incluir_en_flujo: true } : {})
        })
        .eq('id', contrato.id);

      if (updateError) throw updateError;

      await refreshContratos(contrato.id);

    } catch (error) {
      console.error('Error uploading contract:', error);
      toast.error('Error al subir el contrato: ' + (error as Error).message);
    } finally {
      setUploadingContrato(null);
    }
  };

  // Activate a contract whose signed document hasn't arrived yet. firmado
  // stays false, so the contract reads as "firma pendiente" until the signed
  // doc is uploaded (or marked as received) later. Returns whether the DB
  // update succeeded so the modal keeps its confirmation open on failure.
  const handleActivateWithoutDocument = async (contrato: Contrato): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('contratos')
        .update({
          estado: 'activo',
          incluir_en_flujo: true
        })
        .eq('id', contrato.id);

      if (error) throw error;

      // Toast before the refresh: the activation itself succeeded, and a
      // refresh failure raises its own error toast from loadContratos.
      toast.success('Contrato activado. Recuerda subir el documento firmado cuando el cliente lo envíe.');
      await refreshContratos(contrato.id);
      return true;
    } catch (error) {
      console.error('Error activating contract without document:', error);
      toast.error('Error al activar el contrato: ' + (error as Error).message);
      return false;
    }
  };

  const handleToggleCashFlow = async (contrato: Contrato) => {
    try {
      const newCashFlowStatus = !contrato.incluir_en_flujo;

      const { error } = await supabase
        .from('contratos')
        .update({ incluir_en_flujo: newCashFlowStatus })
        .eq('id', contrato.id)
        .select();

      if (error) {
        throw error;
      }

      // Refresh list AND the open modal so the toggle reflects the new state.
      await refreshContratos(contrato.id);

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

      // Refresh the list and the open modal
      await refreshContratos(selectedContrato?.id);

    } catch (error) {
      console.error('Error uploading invoice:', error);
      toast.error('Error al subir la factura: ' + (error as Error).message);
    }
  };

  const handleTogglePaymentStatus = async (cuotaId: string, currentStatus: boolean) => {
    try {
      
      const { error } = await supabase
        .from('cuotas')
        .update({ 
          pagada: !currentStatus
        })
        .eq('id', cuotaId);

      if (error) throw error;

      // Show success notification
      toast.success(`Cuota marcada como ${!currentStatus ? 'pagada' : 'pendiente'}`);

      // Refresh the list and the open modal
      await refreshContratos(selectedContrato?.id);

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

      // Refresh the list and the open modal
      await refreshContratos(selectedContrato?.id);

    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast.error('Error al eliminar la factura: ' + (error as Error).message);
    }
  };

  // Active contracts still waiting for the signed document (shared predicate
  // from lib/utils/contract-status — derived from firmado, not contrato_url).
  const firmaPendienteCount = contratos.filter(isFirmaPendiente).length;

  // Rows shown in the list, filtered by the search box. Null-safe so manual
  // contracts (programa_id = null, programas = null) don't blank the table.
  const filteredContratos = contratos.filter(
    (contrato) =>
      contractMatchesSearch(contrato, searchQuery) &&
      (!showFirmaPendiente || isFirmaPendiente(contrato)),
  );

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
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-brand_primary">
                    Contratos Registrados ({contratos.length})
                  </h2>
                  {(firmaPendienteCount > 0 || showFirmaPendiente) && (
                    <button
                      onClick={() => setShowFirmaPendiente(!showFirmaPendiente)}
                      data-testid="firma-pendiente-filter"
                      aria-pressed={showFirmaPendiente}
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        showFirmaPendiente
                          ? 'bg-orange-600 text-white hover:bg-orange-700'
                          : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                      }`}
                      title="Mostrar solo contratos activos con firma sin confirmar"
                    >
                      Firma pendiente ({firmaPendienteCount})
                    </button>
                  )}
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
                        {filteredContratos.length > 0 ? (
                          filteredContratos.map((contrato) => (
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
                                {isFirmaPendiente(contrato) && (
                                  <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium">
                                    FIRMA PENDIENTE
                                  </span>
                                )}
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
                                {/* Phase 5: Ver Licitacion link */}
                                {contrato.licitacion_id && (
                                  <Link
                                    href={`/licitaciones/${contrato.licitacion_id}`}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Ver Licitacion"
                                  >
                                    <ExternalLink size={16} />
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="text-center py-12 px-4 text-gray-500">
                              {showFirmaPendiente ? (
                                <>
                                  No hay contratos activos con firma pendiente
                                  {searchQuery ? <> que coincidan con &quot;{searchQuery}&quot;</> : null}
                                  . Desactiva el filtro &quot;Firma pendiente&quot; para ver todos los contratos.
                                </>
                              ) : (
                                <>
                                  No se encontraron contratos para &quot;{searchQuery}&quot;. Prueba con otro número de contrato, cliente o programa.
                                </>
                              )}
                            </td>
                          </tr>
                        )}
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
                licitacionId={activeLicitacionId || undefined}
                licitacionData={activeLicitacionData || undefined}
                onSuccess={async (contratoId?: string) => {
                  // Phase 5: if created from a licitacion, call generate-contract API to link back
                  if (activeLicitacionId && contratoId) {
                    try {
                      const linkRes = await fetch(
                        `/api/licitaciones/${activeLicitacionId}/generate-contract`,
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ contrato_id: contratoId }),
                        }
                      );
                      if (!linkRes.ok) {
                        const err = await linkRes.json();
                        toast.error(`Contrato creado pero error al vincular con licitacion: ${err.error || 'Error desconocido'}. Contacte al administrador.`);
                      } else {
                        toast.success('Contrato generado y vinculado a la licitacion exitosamente');
                      }
                    } catch {
                      toast.error('Contrato creado pero no se pudo vincular con la licitacion. Contacte al administrador.');
                    }
                  }
                  setActiveTab('lista');
                  setPreSelectedClientId(null);
                  setExtractedContractData(null);
                  setActiveLicitacionId(null);
                  setActiveLicitacionData(null);
                  loadContratos();
                }}
                onCancel={() => {
                  setActiveTab('lista');
                  setPreSelectedClientId(null);
                  setExtractedContractData(null);
                  setActiveLicitacionId(null);
                  setActiveLicitacionData(null);
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
              onActivateWithoutDocument={handleActivateWithoutDocument}
              onMarkSigned={handleMarkSigned}
              onGeneratePDF={(contrato) => {
                const target = resolveContractPdfTarget(contrato);
                if (target.kind === 'original') {
                  // Imported / manually-uploaded contract: serve the original document.
                  window.open(target.url, '_blank');
                } else if (target.kind === 'missing') {
                  toast.error('Este contrato fue importado y no tiene el documento original cargado. Use "Subir contrato" para adjuntarlo.');
                } else {
                  // Program-based contracts and all annexes render from the template.
                  window.open(`/contract-print/${contrato.id}`, '_blank');
                }
              }}
              onUploadInvoice={handleInvoiceUpload}
              onTogglePaymentStatus={handleTogglePaymentStatus}
              onDeleteInvoice={handleInvoiceDelete}
              isAdmin={isAdmin}
            />

            {/* PDF Importer Modal */}
            {showPDFImporter && (
              <ContractPDFImporter
                onExtract={async (data, sourceFile) => {
                  // Persist the uploaded source PDF so the contract can later be
                  // downloaded as its original document (reuses handleUploadContract's
                  // bucket + public-URL pattern). Failure here is non-fatal.
                  let dataWithUrl: any = data;
                  if (sourceFile) {
                    try {
                      const fileExt = sourceFile.name.split('.').pop();
                      const fileName = `${data.contract?.numero_contrato || 'import'}_${Date.now()}.${fileExt}`;
                      const { error: uploadError } = await supabase.storage
                        .from('contracts')
                        .upload(fileName, sourceFile);
                      if (uploadError) throw uploadError;
                      const { data: { publicUrl } } = supabase.storage
                        .from('contracts')
                        .getPublicUrl(fileName);
                      dataWithUrl = { ...data, contrato_url: publicUrl };
                    } catch (uploadErr) {
                      console.error('Error uploading source PDF:', uploadErr);
                      toast('No se pudo guardar el PDF original; podrá adjuntarlo luego con "Subir contrato".', { icon: '⚠️' });
                    }
                  }
                  setExtractedContractData(dataWithUrl);
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