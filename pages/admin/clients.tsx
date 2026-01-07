import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '../../components/layout/MainLayout';
import { getUserPrimaryRole } from '../../utils/roleUtils';
import { formatRut, validateRut } from '../../utils/rutValidation';

import { toast } from 'react-hot-toast';
import { Plus, Edit2, Trash2, Building, Search, FileText } from 'lucide-react';

interface Cliente {
  id: string;
  nombre_legal: string;
  nombre_fantasia: string;
  rut: string;
  direccion: string;
  comuna?: string | null;
  ciudad?: string | null;
  nombre_representante: string;
  rut_representante: string;
  fecha_escritura: string;
  nombre_notario: string;
  comuna_notaria?: string | null;
  nombre_encargado_proyecto?: string | null;
  telefono_encargado_proyecto?: string | null;
  email_encargado_proyecto?: string | null;
  nombre_contacto_administrativo?: string | null;
  telefono_contacto_administrativo?: string | null;
  email_contacto_administrativo?: string | null;
  school_id?: number | null;
  schools?: {
    name: string;
  } | null;
}

export default function ClientsManagement() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filteredClientes, setFilteredClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

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
    comuna_notaria: '',
    nombre_encargado_proyecto: '',
    telefono_encargado_proyecto: '',
    email_encargado_proyecto: '',
    nombre_contacto_administrativo: '',
    telefono_contacto_administrativo: '',
    email_contacto_administrativo: ''
  });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchClientes();
    }
  }, [isAdmin]);

  useEffect(() => {
    // Filter clients based on search term
    if (searchTerm.trim() === '') {
      setFilteredClientes(clientes);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = clientes.filter(cliente =>
        cliente.nombre_fantasia.toLowerCase().includes(term) ||
        cliente.nombre_legal.toLowerCase().includes(term) ||
        cliente.rut.toLowerCase().includes(term) ||
        (cliente.schools?.name && cliente.schools.name.toLowerCase().includes(term))
      );
      setFilteredClientes(filtered);
    }
  }, [searchTerm, clientes]);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!profile) {
        toast.error('Perfil no encontrado.');
        router.push('/dashboard');
        return;
      }

      const userRole = await getUserPrimaryRole(user.id);
      if (userRole !== 'admin') {
        toast.error('Acceso denegado. Solo administradores.');
        router.push('/dashboard');
        return;
      }

      setCurrentUser(user);
      setIsAdmin(true);
    } catch (error) {
      console.error('Error checking auth:', error);
      router.push('/login');
    }
  };

  const fetchClientes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select(`
          *,
          schools!clientes_school_id_fkey (
            name
          )
        `)
        .order('nombre_fantasia');

      if (error) throw error;
      setClientes(data || []);
      setFilteredClientes(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCliente = () => {
    setEditingCliente(null);
    setClienteForm({
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
      email_contacto_administrativo: ''
    });
    setShowClientModal(true);
  };

  const handleEditCliente = async (clienteId: string) => {
    try {
      const { data: cliente, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', clienteId)
        .single();

      if (error || !cliente) {
        toast.error('Cliente no encontrado');
        return;
      }

      setEditingCliente(cliente);
      setClienteForm({
        nombre_legal: cliente.nombre_legal || '',
        nombre_fantasia: cliente.nombre_fantasia || '',
        rut: cliente.rut || '',
        direccion: cliente.direccion || '',
        comuna: cliente.comuna || '',
        ciudad: cliente.ciudad || '',
        nombre_representante: cliente.nombre_representante || '',
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
      setShowClientModal(true);
    } catch (error) {
      console.error('Error fetching client:', error);
      toast.error('Error al cargar datos del cliente');
    }
  };

  const handleDeleteCliente = async (cliente: Cliente) => {
    // Check if client has contracts
    try {
      const { data: contracts, error: contractsError } = await supabase
        .from('contratos')
        .select('id')
        .eq('cliente_id', cliente.id);

      if (contractsError) throw contractsError;

      if (contracts && contracts.length > 0) {
        toast.error(
          `No se puede eliminar. Este cliente tiene ${contracts.length} contrato(s) asociado(s).`
        );
        return;
      }

      // Check if client is linked to a school
      if (cliente.school_id) {
        const confirmDelete = confirm(
          `El cliente "${cliente.nombre_fantasia}" está vinculado a una escuela.\n\n` +
          `¿Está seguro de eliminarlo? Esto también desvinculará la escuela.`
        );

        if (!confirmDelete) return;
      } else {
        const confirmDelete = confirm(
          `¿Está seguro de eliminar el cliente "${cliente.nombre_fantasia}"?\n\n` +
          `Esta acción no se puede deshacer.`
        );

        if (!confirmDelete) return;
      }

      // If linked to school, unlink first
      if (cliente.school_id) {
        const { error: schoolError } = await supabase
          .from('schools')
          .update({ cliente_id: null })
          .eq('id', cliente.school_id);

        if (schoolError) throw schoolError;
      }

      // Delete client
      const { error: deleteError } = await supabase
        .from('clientes')
        .delete()
        .eq('id', cliente.id);

      if (deleteError) throw deleteError;

      toast.success('Cliente eliminado exitosamente');
      fetchClientes();
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Error al eliminar cliente: ' + (error as Error).message);
    }
  };

  const handleSaveCliente = async () => {
    // Validate required fields
    if (!clienteForm.nombre_legal.trim()) {
      toast.error('El nombre legal es requerido');
      return;
    }
    if (!clienteForm.nombre_fantasia.trim()) {
      toast.error('El nombre de fantasía es requerido');
      return;
    }
    if (!clienteForm.rut.trim()) {
      toast.error('El RUT es requerido');
      return;
    }
    if (!validateRut(clienteForm.rut)) {
      toast.error('El RUT no es válido');
      return;
    }
    if (!clienteForm.direccion.trim()) {
      toast.error('La dirección es requerida');
      return;
    }
    if (!clienteForm.nombre_representante.trim()) {
      toast.error('El nombre del representante legal es requerido');
      return;
    }
    if (!clienteForm.rut_representante.trim()) {
      toast.error('El RUT del representante legal es requerido');
      return;
    }
    if (!validateRut(clienteForm.rut_representante)) {
      toast.error('El RUT del representante legal no es válido');
      return;
    }

    try {
      if (editingCliente) {
        // Editing existing client
        // Check if RUT is being changed and if it's already in use
        if (clienteForm.rut !== editingCliente.rut) {
          const { data: existingCliente, error: checkError } = await supabase
            .from('clientes')
            .select('id')
            .eq('rut', clienteForm.rut)
            .neq('id', editingCliente.id)
            .maybeSingle();

          if (checkError) throw checkError;

          if (existingCliente) {
            toast.error('Ya existe otro cliente con este RUT');
            return;
          }
        }

        // Check if editing a client with contracts
        const { data: contracts, error: contractsError } = await supabase
          .from('contratos')
          .select('id')
          .eq('cliente_id', editingCliente.id);

        if (contractsError) throw contractsError;

        if (contracts && contracts.length > 0) {
          const confirmEdit = confirm(
            `Este cliente tiene ${contracts.length} contrato(s) asociado(s).\n\n` +
            `Los cambios afectarán los contratos existentes.\n\n` +
            `¿Desea continuar?`
          );

          if (!confirmEdit) return;
        }

        // Update client
        const { error: updateError } = await supabase
          .from('clientes')
          .update({
            nombre_legal: clienteForm.nombre_legal.trim(),
            nombre_fantasia: clienteForm.nombre_fantasia.trim(),
            rut: clienteForm.rut.trim(),
            direccion: clienteForm.direccion.trim(),
            comuna: clienteForm.comuna.trim() || null,
            ciudad: clienteForm.ciudad.trim() || null,
            nombre_representante: clienteForm.nombre_representante.trim(),
            rut_representante: clienteForm.rut_representante.trim(),
            fecha_escritura: clienteForm.fecha_escritura || null,
            nombre_notario: clienteForm.nombre_notario.trim() || null,
            comuna_notaria: clienteForm.comuna_notaria.trim() || null,
            nombre_encargado_proyecto: clienteForm.nombre_encargado_proyecto.trim() || null,
            telefono_encargado_proyecto: clienteForm.telefono_encargado_proyecto.trim() || null,
            email_encargado_proyecto: clienteForm.email_encargado_proyecto.trim() || null,
            nombre_contacto_administrativo: clienteForm.nombre_contacto_administrativo.trim() || null,
            telefono_contacto_administrativo: clienteForm.telefono_contacto_administrativo.trim() || null,
            email_contacto_administrativo: clienteForm.email_contacto_administrativo.trim() || null
          })
          .eq('id', editingCliente.id);

        if (updateError) throw updateError;

        toast.success('Cliente actualizado exitosamente');
      } else {
        // Creating new client
        // Check if RUT already exists
        const { data: existingCliente, error: checkError } = await supabase
          .from('clientes')
          .select('id')
          .eq('rut', clienteForm.rut)
          .maybeSingle();

        if (checkError) throw checkError;

        if (existingCliente) {
          toast.error('Ya existe un cliente con este RUT');
          return;
        }

        // Insert new client
        const { error: insertError } = await supabase
          .from('clientes')
          .insert({
            nombre_legal: clienteForm.nombre_legal.trim(),
            nombre_fantasia: clienteForm.nombre_fantasia.trim(),
            rut: clienteForm.rut.trim(),
            direccion: clienteForm.direccion.trim(),
            comuna: clienteForm.comuna.trim() || null,
            ciudad: clienteForm.ciudad.trim() || null,
            nombre_representante: clienteForm.nombre_representante.trim(),
            rut_representante: clienteForm.rut_representante.trim(),
            fecha_escritura: clienteForm.fecha_escritura || null,
            nombre_notario: clienteForm.nombre_notario.trim() || null,
            comuna_notaria: clienteForm.comuna_notaria.trim() || null,
            nombre_encargado_proyecto: clienteForm.nombre_encargado_proyecto.trim() || null,
            telefono_encargado_proyecto: clienteForm.telefono_encargado_proyecto.trim() || null,
            email_encargado_proyecto: clienteForm.email_encargado_proyecto.trim() || null,
            nombre_contacto_administrativo: clienteForm.nombre_contacto_administrativo.trim() || null,
            telefono_contacto_administrativo: clienteForm.telefono_contacto_administrativo.trim() || null,
            email_contacto_administrativo: clienteForm.email_contacto_administrativo.trim() || null
          });

        if (insertError) throw insertError;

        toast.success('Cliente creado exitosamente');
      }

      setShowClientModal(false);
      setEditingCliente(null);
      fetchClientes();
    } catch (error) {
      console.error('Error saving client:', error);
      toast.error('Error al guardar cliente: ' + (error as Error).message);
    }
  };

  if (!isAdmin) {
    return (
      <MainLayout
        user={currentUser}
        currentPage="clients"
        pageTitle="Clientes"
        isAdmin={false}
        userRole="admin"
      >
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0a0a0a]"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      user={currentUser}
      currentPage="clients"
      pageTitle="Gestión de Clientes"
      isAdmin={true}
      userRole="admin"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#0a0a0a]">Gestión de Clientes</h1>
            <p className="text-gray-600 mt-2">Administra todos los clientes y sus datos</p>
          </div>
          <button
            onClick={handleAddCliente}
            className="flex items-center px-4 py-2 bg-[#fbbf24] text-white rounded-lg hover:bg-[#e6a42e] transition-colors"
          >
            <Plus size={20} className="mr-2" />
            Nuevo Cliente
          </button>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por nombre, RUT o escuela..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0a0a0a]"></div>
          </div>
        ) : filteredClientes.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Building size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
            </h3>
            <p className="text-gray-500">
              {searchTerm ? 'Intenta con otro término de búsqueda' : 'Comienza creando el primer cliente'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    RUT
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Representante
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Escuela
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredClientes.map((cliente) => (
                  <tr key={cliente.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{cliente.nombre_fantasia}</div>
                        <div className="text-sm text-gray-500">{cliente.nombre_legal}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{cliente.rut}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{cliente.nombre_representante}</div>
                      <div className="text-sm text-gray-500">{cliente.rut_representante}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {cliente.schools ? (
                        <span className="inline-flex items-center px-2 py-1 bg-brand_beige text-brand_accent text-xs rounded">
                          <Building size={12} className="mr-1" />
                          {cliente.schools.name}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Sin vincular</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEditCliente(cliente.id)}
                        className="text-[#fbbf24] hover:text-[#e6a42e] mr-3 inline-flex items-center"
                        title="Editar"
                      >
                        <Edit2 size={18} className="mr-1" />
                        <span className="text-xs">Editar</span>
                      </button>
                      <button
                        onClick={() => handleDeleteCliente(cliente)}
                        className="text-red-600 hover:text-red-800 inline-flex items-center"
                        title="Eliminar"
                      >
                        <Trash2 size={18} className="mr-1" />
                        <span className="text-xs">Eliminar</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Client Modal */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-[#0a0a0a] mb-4">
              {editingCliente ? `Editar Cliente: ${editingCliente.nombre_fantasia}` : 'Nuevo Cliente'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Información Legal */}
              <div className="col-span-2">
                <h3 className="text-lg font-semibold text-gray-700 mb-3 border-b pb-2">Información Legal</h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre Legal *
                </label>
                <input
                  type="text"
                  value={clienteForm.nombre_legal}
                  onChange={(e) => setClienteForm({ ...clienteForm, nombre_legal: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Nombre legal de la organización"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de Fantasía *
                </label>
                <input
                  type="text"
                  value={clienteForm.nombre_fantasia}
                  onChange={(e) => setClienteForm({ ...clienteForm, nombre_fantasia: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Nombre comercial"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  RUT *
                </label>
                <input
                  type="text"
                  value={clienteForm.rut}
                  onChange={(e) => setClienteForm({ ...clienteForm, rut: formatRut(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="XX.XXX.XXX-X"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dirección *
                </label>
                <input
                  type="text"
                  value={clienteForm.direccion}
                  onChange={(e) => setClienteForm({ ...clienteForm, direccion: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Dirección completa"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comuna
                </label>
                <input
                  type="text"
                  value={clienteForm.comuna}
                  onChange={(e) => setClienteForm({ ...clienteForm, comuna: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Comuna"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ciudad
                </label>
                <input
                  type="text"
                  value={clienteForm.ciudad}
                  onChange={(e) => setClienteForm({ ...clienteForm, ciudad: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Ciudad"
                />
              </div>

              {/* Representante Legal */}
              <div className="col-span-2 mt-4">
                <h3 className="text-lg font-semibold text-gray-700 mb-3 border-b pb-2">Representante Legal</h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre Representante Legal *
                </label>
                <input
                  type="text"
                  value={clienteForm.nombre_representante}
                  onChange={(e) => setClienteForm({ ...clienteForm, nombre_representante: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Nombre completo"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  RUT Representante Legal *
                </label>
                <input
                  type="text"
                  value={clienteForm.rut_representante}
                  onChange={(e) => setClienteForm({ ...clienteForm, rut_representante: formatRut(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="XX.XXX.XXX-X"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha Escritura
                </label>
                <input
                  type="date"
                  value={clienteForm.fecha_escritura}
                  onChange={(e) => setClienteForm({ ...clienteForm, fecha_escritura: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre Notario
                </label>
                <input
                  type="text"
                  value={clienteForm.nombre_notario}
                  onChange={(e) => setClienteForm({ ...clienteForm, nombre_notario: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Nombre del notario"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comuna Notaría
                </label>
                <input
                  type="text"
                  value={clienteForm.comuna_notaria}
                  onChange={(e) => setClienteForm({ ...clienteForm, comuna_notaria: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Comuna de la notaría"
                />
              </div>

              {/* Encargado de Proyecto */}
              <div className="col-span-2 mt-4">
                <h3 className="text-lg font-semibold text-gray-700 mb-3 border-b pb-2">Encargado de Proyecto</h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre Encargado
                </label>
                <input
                  type="text"
                  value={clienteForm.nombre_encargado_proyecto}
                  onChange={(e) => setClienteForm({ ...clienteForm, nombre_encargado_proyecto: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Nombre completo"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono Encargado
                </label>
                <input
                  type="tel"
                  value={clienteForm.telefono_encargado_proyecto}
                  onChange={(e) => setClienteForm({ ...clienteForm, telefono_encargado_proyecto: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="+56 9 XXXX XXXX"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Encargado
                </label>
                <input
                  type="email"
                  value={clienteForm.email_encargado_proyecto}
                  onChange={(e) => setClienteForm({ ...clienteForm, email_encargado_proyecto: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="email@ejemplo.com"
                />
              </div>

              {/* Contacto Administrativo */}
              <div className="col-span-2 mt-4">
                <h3 className="text-lg font-semibold text-gray-700 mb-3 border-b pb-2">Contacto Administrativo</h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre Contacto
                </label>
                <input
                  type="text"
                  value={clienteForm.nombre_contacto_administrativo}
                  onChange={(e) => setClienteForm({ ...clienteForm, nombre_contacto_administrativo: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Nombre completo"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono Contacto
                </label>
                <input
                  type="tel"
                  value={clienteForm.telefono_contacto_administrativo}
                  onChange={(e) => setClienteForm({ ...clienteForm, telefono_contacto_administrativo: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="+56 9 XXXX XXXX"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Contacto
                </label>
                <input
                  type="email"
                  value={clienteForm.email_contacto_administrativo}
                  onChange={(e) => setClienteForm({ ...clienteForm, email_contacto_administrativo: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="email@ejemplo.com"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowClientModal(false);
                  setEditingCliente(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCliente}
                className="px-4 py-2 bg-[#fbbf24] text-white rounded-lg hover:bg-[#e6a42e] transition-colors"
              >
                {editingCliente ? 'Guardar Cambios' : 'Crear Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
