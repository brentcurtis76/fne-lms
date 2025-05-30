import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import Head from 'next/head';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import Header from '../components/layout/Header';
import { ArrowLeft, FileText, Plus, Calendar, DollarSign, Users, Eye, Download, Trash2, CheckSquare, Square, Upload, TrendingUp, Edit } from 'lucide-react';
import ContractForm from '../components/contracts/ContractForm';
import AnnexForm from '../components/contracts/AnnexForm';
import CashFlowView from '../components/contracts/CashFlowView';
import ContractDetailsModal from '../components/contracts/ContractDetailsModal';

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
  estado?: 'pendiente' | 'activo';
  incluir_en_flujo?: boolean;
  contrato_url?: string;
  is_anexo?: boolean;
  parent_contrato_id?: string;
  anexo_numero?: number;
  anexo_fecha?: string;
  numero_participantes?: number;
  nombre_ciclo?: 'Primer Ciclo' | 'Segundo Ciclo' | 'Tercer Ciclo' | 'Equipo Directivo';
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
}

export default function ContractsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  
  // Data states
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  
  // View states
  const [activeTab, setActiveTab] = useState<'lista' | 'nuevo' | 'editar' | 'flujo' | 'nuevo-anexo' | 'editar-anexo'>('lista');
  const [selectedContrato, setSelectedContrato] = useState<Contrato | null>(null);
  const [editingContrato, setEditingContrato] = useState<Contrato | null>(null);
  const [editingAnexo, setEditingAnexo] = useState<Contrato | null>(null);
  const [deleteModalContrato, setDeleteModalContrato] = useState<Contrato | null>(null);
  const [uploadingContrato, setUploadingContrato] = useState<string | null>(null);

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
          .select('role, avatar_url')
          .eq('id', session.user.id)
          .single();
        
        if (!profile || profile.role !== 'admin') {
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
        .select('*')
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
    return `UF ${amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
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

      // Update cuota with invoice URL
      const { error: updateError } = await supabase
        .from('cuotas')
        .update({ 
          factura_url: publicUrl
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
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
          <p className="mt-4 text-brand_blue font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Gestión de Contratos - FNE LMS</title>
      </Head>
      
      <div className="min-h-screen bg-brand_beige">
        <Header 
          user={currentUser}
          isAdmin={isAdmin}
          onLogout={handleLogout}
          avatarUrl={avatarUrl}
        />
        
        <main className="container mx-auto pt-44 pb-10 px-4">
          <div className="max-w-7xl mx-auto">
            {/* Conditional Header */}
            {(activeTab === 'lista' || activeTab === 'flujo') && (
              <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
                <div className="flex items-center space-x-4 mb-4 md:mb-0">
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center text-brand_blue hover:text-brand_yellow transition-colors"
                  >
                    <ArrowLeft className="mr-2" size={20} />
                    Volver al Panel
                  </Link>
                  <div className="h-6 w-px bg-gray-300"></div>
                  <h1 className="text-3xl font-bold text-brand_blue flex items-center">
                    <FileText className="mr-3" size={32} />
                    Gestión de Contratos
                  </h1>
                </div>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => setActiveTab('lista')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'lista' 
                        ? 'bg-brand_blue text-white' 
                        : 'bg-white text-brand_blue border border-brand_blue hover:bg-brand_blue hover:text-white'
                    }`}
                  >
                    Lista de Contratos
                  </button>
                  <button
                    onClick={() => setActiveTab('nuevo')}
                    className="px-4 py-2 rounded-lg font-medium transition-colors flex items-center bg-white text-brand_blue border border-brand_yellow hover:bg-brand_yellow hover:text-brand_blue"
                  >
                    <Plus className="mr-2" size={16} />
                    Nuevo Contrato
                  </button>
                  <button
                    onClick={() => setActiveTab('nuevo-anexo')}
                    className="px-4 py-2 rounded-lg font-medium transition-colors flex items-center bg-white text-brand_blue border border-brand_blue hover:bg-brand_blue hover:text-white"
                  >
                    <FileText className="mr-2" size={16} />
                    Nuevo Anexo
                  </button>
                  <button
                    onClick={() => setActiveTab('flujo')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center ${
                      activeTab === 'flujo' 
                        ? 'bg-green-600 text-white' 
                        : 'bg-white text-green-600 border border-green-600 hover:bg-green-600 hover:text-white'
                    }`}
                  >
                    <DollarSign className="mr-2" size={16} />
                    Flujo de Caja
                  </button>
                </div>
              </div>
            )}

            {/* Form Header for nuevo/editar modes */}
            {(activeTab === 'nuevo' || activeTab === 'editar' || activeTab === 'nuevo-anexo' || activeTab === 'editar-anexo') && (
              <div className="mb-8">
                <div className="flex items-center space-x-4 mb-6">
                  <button
                    onClick={() => setActiveTab('lista')}
                    className="inline-flex items-center text-brand_blue hover:text-brand_yellow transition-colors"
                  >
                    <ArrowLeft className="mr-2" size={20} />
                    Volver a Contratos
                  </button>
                  <div className="h-6 w-px bg-gray-300"></div>
                  <h1 className="text-3xl font-bold text-brand_blue flex items-center">
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
                  <h2 className="text-xl font-semibold text-brand_blue">
                    Contratos Registrados ({contratos.length})
                  </h2>
                </div>

                {contratos.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse bg-white">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left py-4 px-4 font-semibold text-brand_blue">N° Contrato</th>
                          <th className="text-left py-4 px-4 font-semibold text-brand_blue">Cliente</th>
                          <th className="text-left py-4 px-4 font-semibold text-brand_blue">Fecha</th>
                          <th className="text-left py-4 px-4 font-semibold text-brand_blue">Valor Total</th>
                          <th className="text-left py-4 px-4 font-semibold text-brand_blue">Estado</th>
                          <th className="text-left py-4 px-4 font-semibold text-brand_blue text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contratos.map((contrato) => (
                          <tr key={contrato.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                            <td className="py-4 px-4">
                              <button 
                                onClick={() => setSelectedContrato(contrato)}
                                className="font-medium text-brand_blue hover:text-blue-600 hover:underline cursor-pointer"
                              >
                                {contrato.numero_contrato}
                                {contrato.is_anexo && (
                                  <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                                    ANEXO
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className="py-4 px-4">
                              <div>
                                <div className="font-medium text-gray-900">{contrato.clientes.nombre_fantasia}</div>
                                <div className="text-sm text-gray-500">{contrato.clientes.rut}</div>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="text-sm text-gray-900">
                                {formatDate(contrato.fecha_contrato)}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="font-semibold text-brand_blue">
                                {formatCurrency(contrato.precio_total_uf)}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center space-x-2">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                  contrato.estado === 'activo' 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {contrato.estado === 'activo' ? 'Activo' : 'Pendiente'}
                                </span>
                                {contrato.incluir_en_flujo && (
                                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                                    En Flujo
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center justify-center space-x-2">
                                <button
                                  onClick={() => setSelectedContrato(contrato)}
                                  className="p-2 text-brand_blue hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Ver detalles"
                                >
                                  <Eye size={16} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (contrato.is_anexo) {
                                      setEditingAnexo(contrato);
                                      setActiveTab('editar-anexo');
                                    } else {
                                      setEditingContrato(contrato);
                                      setActiveTab('editar');
                                    }
                                  }}
                                  className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                  title={contrato.is_anexo ? "Editar anexo" : "Editar contrato"}
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  onClick={() => window.open(`/contract-print/${contrato.id}`, '_blank')}
                                  className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                  title="Ver contrato para imprimir"
                                >
                                  <Download size={14} />
                                </button>
                                <button
                                  onClick={() => setDeleteModalContrato(contrato)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Eliminar contrato"
                                >
                                  <Trash2 size={14} />
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
                      className="bg-brand_yellow text-brand_blue px-6 py-3 rounded-lg font-medium hover:bg-brand_yellow/90 transition-colors flex items-center mx-auto"
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
                onSuccess={() => {
                  setActiveTab('lista');
                  loadContratos();
                }}
                onCancel={() => setActiveTab('lista')}
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
                        <span className="font-semibold text-brand_blue">{deleteModalContrato.numero_contrato}</span>?
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
              contrato={selectedContrato}
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
            />
          </div>
        </main>
      </div>
    </>
  );
}