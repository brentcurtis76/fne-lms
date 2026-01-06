import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../../lib/supabase';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '../../components/layout/MainLayout';
import { getUserPrimaryRole } from '../../utils/roleUtils';
import { formatRut, validateRut } from '../../utils/rutValidation';

import { toast } from 'react-hot-toast';
import { Plus, Edit2, Trash2, Building, Users, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { GRADE_RANGES } from '../../constants/gradeRanges';

interface School {
  id: number; // Changed from string to number
  name: string;
  code?: string | null;
  address?: string | null;
  region?: string | null;
  has_generations: boolean;
  created_at: string;
  updated_at: string;
  cliente_id?: string | null; // Added cliente_id
  generations?: Generation[];
  _count?: {
    profiles: number;
    generations: number;
  };
}

interface Generation {
  id: string;
  school_id: number; // Changed from string to number
  name: string;
  grade_range: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  _count?: {
    profiles: number;
    communities: number;
  };
}

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
}

export default function SchoolsManagement() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSchoolModal, setShowSchoolModal] = useState(false);
  const [showGenerationModal, setShowGenerationModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [editingGeneration, setEditingGeneration] = useState<Generation | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [expandedSchools, setExpandedSchools] = useState<Set<number>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [linkingSchool, setLinkingSchool] = useState<School | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [showClientEditModal, setShowClientEditModal] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [confirmationModal, setConfirmationModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    details?: string[];
    note?: string;
    onConfirm: () => void;
  }>({
    show: false,
    title: '',
    message: '',
    details: [],
    note: '',
    onConfirm: () => {}
  });

  // Form states
  const [schoolForm, setSchoolForm] = useState({
    name: '',
    code: '',
    address: '',
    region: '',
    has_generations: false // Changed default to false
  });

  const [generationForm, setGenerationForm] = useState({
    name: '',
    grade_range: '',
    description: ''
  });

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
      fetchSchools();
      fetchClientes();
    }
  }, [isAdmin]);

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

  const fetchSchools = async () => {
    setLoading(true);
    try {
      // Fetch schools with basic data
      const { data: schoolsData, error: schoolsError } = await supabase
        .from('schools')
        .select(`
          *,
          generations (
            *,
            profiles!profiles_generation_id_fkey (count),
            growth_communities (count)
          )
        `)
        .order('name');

      if (schoolsError) throw schoolsError;

      // Get user counts from user_roles table for accurate counting
      const { data: userCounts, error: countError } = await supabase
        .from('user_roles')
        .select('school_id')
        .not('school_id', 'is', null);

      if (countError) throw countError;

      // Count users per school
      const schoolUserCounts = userCounts?.reduce((acc: any, role: any) => {
        if (!acc[role.school_id]) {
          acc[role.school_id] = new Set();
        }
        acc[role.school_id].add(role.user_id);
        return acc;
      }, {});

      // Get unique user counts per school
      const { data: uniqueUserCounts, error: uniqueCountError } = await supabase
        .rpc('get_school_user_counts');

      let userCountMap: Record<number, number> = {};
      
      if (!uniqueCountError && uniqueUserCounts) {
        uniqueUserCounts.forEach((item: any) => {
          userCountMap[item.school_id] = item.user_count;
        });
      } else {
        // Fallback: manual count from user_roles
        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('school_id, user_id')
          .not('school_id', 'is', null);

        if (!roleError && roleData) {
          const schoolUsers: Record<number, Set<string>> = {};
          roleData.forEach((role: any) => {
            if (!schoolUsers[role.school_id]) {
              schoolUsers[role.school_id] = new Set();
            }
            schoolUsers[role.school_id].add(role.user_id);
          });
          
          Object.entries(schoolUsers).forEach(([schoolId, userSet]) => {
            userCountMap[parseInt(schoolId)] = userSet.size;
          });
        }
      }

      // Transform the data to include accurate counts
      const transformedSchools = schoolsData?.map(school => ({
        ...school,
        _count: {
          profiles: userCountMap[school.id] || 0,
          generations: school.generations?.length || 0
        },
        generations: school.generations?.map((gen: any) => ({
          ...gen,
          _count: {
            profiles: gen.profiles?.[0]?.count || 0,
            communities: gen.growth_communities?.[0]?.count || 0
          }
        })) || []
      })) || [];

      setSchools(transformedSchools);
    } catch (error) {
      console.error('Error fetching schools:', error);
      toast.error('Error al cargar escuelas');
    } finally {
      setLoading(false);
    }
  };

  const fetchClientes = async () => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('nombre_fantasia');
      
      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const handleToggleExpand = (schoolId: number) => {
    const newExpanded = new Set(expandedSchools);
    if (newExpanded.has(schoolId)) {
      newExpanded.delete(schoolId);
    } else {
      newExpanded.add(schoolId);
    }
    setExpandedSchools(newExpanded);
  };

  const handleAddSchool = () => {
    setEditingSchool(null);
    setSchoolForm({
      name: '',
      code: '',
      address: '',
      region: '',
      has_generations: false // Changed default to false
    });
    setShowSchoolModal(true);
  };

  const handleEditSchool = (school: School) => {
    setEditingSchool(school);
    setSchoolForm({
      name: school.name,
      code: school.code || '',
      address: school.address || '',
      region: school.region || '',
      has_generations: school.has_generations === true // Only true if explicitly true, false for NULL or false
    });
    setShowSchoolModal(true);
  };

  const performGenerationTransition = async (school: School) => {
    try {
      // FIRST: Update the school to has_generations = false
      // This must be done first so the trigger allows null generation_id
      // Only include fields that exist in the database
      const updateData: any = {
        name: schoolForm.name,
        has_generations: false // Set to false first
      };
      
      // Note: code and address fields might not exist in the database
      
      const { error: schoolError } = await supabase
        .from('schools')
        .update(updateData)
        .eq('id', school.id);

      if (schoolError) {
        console.error('Error updating school:', schoolError);
        console.error('School update payload:', {
          name: schoolForm.name,
          code: schoolForm.code || null,
          address: schoolForm.address || null,
          region: schoolForm.region || null,
          has_generations: false,
          school_id: school.id
        });
        toast.error(`Error al actualizar la escuela: ${schoolError.message || 'Error desconocido'}`);
        return;
      }

      // SECOND: Now we can clear generation references from communities
      const { error: communityError } = await supabase
        .from('growth_communities')
        .update({ generation_id: null })
        .eq('school_id', school.id);

      if (communityError) {
        console.error('Error updating communities:', communityError);
        toast.error('Error al actualizar las comunidades');
        // Rollback school change
        await supabase
          .from('schools')
          .update({ has_generations: true })
          .eq('id', school.id);
        return;
      }

      // THIRD: Clear generation references from profiles
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ generation_id: null })
        .eq('school_id', school.id);

      if (profileError) {
        console.error('Error updating profiles:', profileError);
        toast.error('Error al actualizar los perfiles de usuario');
        // Rollback changes
        await supabase
          .from('schools')
          .update({ has_generations: true })
          .eq('id', school.id);
        return;
      }

      toast.success('Escuela actualizada exitosamente - ahora opera sin generaciones');
      setShowSchoolModal(false);
      setConfirmationModal({ ...confirmationModal, show: false });
      fetchSchools();
    } catch (error) {
      console.error('Error transitioning school:', error);
      toast.error('Error al transicionar la escuela');
    }
  };

  const handleDeleteSchool = async (school: School) => {
    if (!confirm(`¿Está seguro de eliminar la escuela "${school.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('schools')
        .delete()
        .eq('id', school.id);

      if (error) throw error;

      toast.success('Escuela eliminada exitosamente');
      fetchSchools();
    } catch (error) {
      console.error('Error deleting school:', error);
      toast.error('Error al eliminar la escuela');
    }
  };

  const handleSaveSchool = async () => {
    if (!schoolForm.name.trim()) {
      toast.error('El nombre de la escuela es requerido');
      return;
    }

    try {
      if (editingSchool) {
        // Check if we're transitioning from has_generations to no generations
        if (editingSchool.has_generations && !schoolForm.has_generations) {
          // Show custom confirmation modal instead of browser confirm
          setConfirmationModal({
            show: true,
            title: `¿Está seguro de desactivar las generaciones para "${schoolForm.name}"?`,
            message: 'Esto hará que:',
            details: [
              'Las comunidades de crecimiento ya no requerirán generaciones',
              'Los usuarios ya no estarán asignados a generaciones', 
              'Las generaciones existentes permanecerán pero no se usarán'
            ],
            note: 'Esta acción se puede revertir más tarde.',
            onConfirm: async () => {
              await performGenerationTransition(editingSchool);
            }
          });
          return;
        }

        // Check if we're transitioning from no generations to has_generations
        if (!editingSchool.has_generations && schoolForm.has_generations) {
          const confirmMessage = `¿Está seguro de activar las generaciones para "${schoolForm.name}"?\n\n` +
            `Deberá asignar generaciones a las comunidades y usuarios después de este cambio.`;
          
          if (!confirm(confirmMessage)) {
            return;
          }
        }

        // Update the school - only include known fields
        const updatePayload: any = {
          name: schoolForm.name,
          has_generations: schoolForm.has_generations
        };
        
        console.log('Updating school with payload:', updatePayload);
        
        const { data, error } = await supabase
          .from('schools')
          .update(updatePayload)
          .eq('id', editingSchool.id)
          .select();
          
        if (data) {
          console.log('School updated:', data);
        }

        if (error) throw error;
        toast.success('Escuela actualizada exitosamente');
      } else {
        // Create new school - only include known fields
        const insertPayload: any = {
          name: schoolForm.name,
          has_generations: schoolForm.has_generations
        };
        
        console.log('Creating school with payload:', insertPayload);
        
        const { data, error } = await supabase
          .from('schools')
          .insert(insertPayload)
          .select();
          
        if (data) {
          console.log('School created:', data);
        }

        if (error) throw error;
        toast.success('Escuela creada exitosamente');
      }

      setShowSchoolModal(false);
      fetchSchools();
    } catch (error) {
      console.error('Error saving school:', error);
      toast.error('Error al guardar la escuela');
    }
  };

  const handleAddGeneration = (school: School) => {
    setSelectedSchool(school);
    setEditingGeneration(null);
    setGenerationForm({
      name: '',
      grade_range: '',
      description: ''
    });
    setShowGenerationModal(true);
  };

  const handleEditGeneration = (generation: Generation, school: School) => {
    setSelectedSchool(school);
    setEditingGeneration(generation);
    setGenerationForm({
      name: generation.name,
      grade_range: generation.grade_range || '',
      description: generation.description || ''
    });
    setShowGenerationModal(true);
  };

  const handleDeleteGeneration = async (generation: Generation) => {
    if (!confirm(`¿Está seguro de eliminar la generación "${generation.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('generations')
        .delete()
        .eq('id', generation.id);

      if (error) throw error;

      toast.success('Generación eliminada exitosamente');
      fetchSchools();
    } catch (error) {
      console.error('Error deleting generation:', error);
      toast.error('Error al eliminar la generación');
    }
  };

  const handleSaveGeneration = async () => {
    if (!generationForm.name.trim()) {
      toast.error('El nombre de la generación es requerido');
      return;
    }

    if (!selectedSchool) {
      toast.error('No se ha seleccionado una escuela');
      return;
    }

    try {
      if (editingGeneration) {
        const { error } = await supabase
          .from('generations')
          .update({
            name: generationForm.name,
            grade_range: generationForm.grade_range || null,
            description: generationForm.description || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingGeneration.id);

        if (error) throw error;
        toast.success('Generación actualizada exitosamente');
      } else {
        const { error } = await supabase
          .from('generations')
          .insert({
            school_id: selectedSchool.id,
            name: generationForm.name,
            grade_range: generationForm.grade_range || null,
            description: generationForm.description || null
          });

        if (error) throw error;
        toast.success('Generación creada exitosamente');
      }

      setShowGenerationModal(false);
      fetchSchools();
    } catch (error) {
      console.error('Error saving generation:', error);
      toast.error('Error al guardar la generación');
    }
  };

  const handleCreateContract = (school: School) => {
    if (!school.cliente_id) {
      toast.error('Esta escuela no tiene un cliente asociado');
      return;
    }
    
    // Navigate to contracts page with pre-selected client
    router.push(`/contracts?cliente_id=${school.cliente_id}&school_name=${encodeURIComponent(school.name)}`);
  };

  const handleLinkClient = (school: School) => {
    setLinkingSchool(school);
    setShowClientModal(true);
  };

  const handleSaveLinkClient = async (clienteId: string) => {
    if (!linkingSchool) return;

    try {
      // First, check if the client exists and is not already linked
      const { data: cliente, error: clientCheckError } = await supabase
        .from('clientes')
        .select('id, school_id')
        .eq('id', clienteId)
        .single();

      if (clientCheckError || !cliente) {
        toast.error('Cliente no encontrado');
        return;
      }

      if (cliente.school_id) {
        toast.error('Este cliente ya está vinculado a otra escuela');
        return;
      }

      // Update both tables in a transaction-like manner
      // First update the school
      const { error: schoolError } = await supabase
        .from('schools')
        .update({ cliente_id: clienteId })
        .eq('id', linkingSchool.id);

      if (schoolError) throw schoolError;

      // Then update the client
      const { error: clientError } = await supabase
        .from('clientes')
        .update({ school_id: linkingSchool.id })
        .eq('id', clienteId);

      if (clientError) {
        // Rollback school update if client update fails
        await supabase
          .from('schools')
          .update({ cliente_id: null })
          .eq('id', linkingSchool.id);
        throw clientError;
      }

      toast.success('Cliente vinculado exitosamente');
      setShowClientModal(false);
      setLinkingSchool(null);
      fetchSchools();
    } catch (error) {
      console.error('Error linking client:', error);
      toast.error('Error al vincular cliente: ' + (error as Error).message);
    }
  };

  const handleEditCliente = async (clienteId: string) => {
    try {
      // Fetch full client data
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
      setShowClientEditModal(true);
    } catch (error) {
      console.error('Error fetching client:', error);
      toast.error('Error al cargar datos del cliente');
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

    if (!editingCliente) {
      toast.error('No hay cliente seleccionado para editar');
      return;
    }

    try {
      // Check if RUT is being changed and if it's already in use by another client
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
      setShowClientEditModal(false);
      setEditingCliente(null);
      fetchClientes();
      fetchSchools();
    } catch (error) {
      console.error('Error updating client:', error);
      toast.error('Error al actualizar cliente: ' + (error as Error).message);
    }
  };

  if (!isAdmin) {
    return (
      <MainLayout
        user={currentUser}
        currentPage="schools"
        pageTitle="Escuelas"
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
      currentPage="schools"
      pageTitle="Gestión de Escuelas"
      isAdmin={true}
      userRole="admin"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#0a0a0a]">Gestión de Escuelas</h1>
            <p className="text-gray-600 mt-2">Administra las escuelas y sus generaciones</p>
          </div>
          <button
            onClick={handleAddSchool}
            className="flex items-center px-4 py-2 bg-[#fbbf24] text-white rounded-lg hover:bg-[#e6a42e] transition-colors"
          >
            <Plus size={20} className="mr-2" />
            Nueva Escuela
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0a0a0a]"></div>
          </div>
        ) : schools.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Building size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay escuelas registradas</h3>
            <p className="text-gray-500">Comienza creando la primera escuela</p>
          </div>
        ) : (
          <div className="space-y-4">
            {schools.map((school) => (
              <div key={school.id} className="bg-white rounded-lg shadow">
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={() => handleToggleExpand(school.id)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        {expandedSchools.has(school.id) ? 
                          <ChevronDown size={20} /> : 
                          <ChevronRight size={20} />
                        }
                      </button>
                      <div>
                        <h3 className="text-lg font-semibold text-[#0a0a0a]">{school.name}</h3>
                        <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                          <span className="flex items-center">
                            <Users size={14} className="mr-1" />
                            {school._count?.profiles || 0} usuarios
                          </span>
                          {school.has_generations === true && (
                            <span>{school._count?.generations || 0} generaciones</span>
                          )}
                        </div>
                        {school.has_generations === false && (
                          <span className="inline-block mt-2 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                            Sin generaciones
                          </span>
                        )}
                        {school.cliente_id && (
                          <span className="inline-flex items-center mt-2 ml-2">
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                              <FileText size={12} className="inline mr-1" />
                              Cliente vinculado
                            </span>
                            <button
                              onClick={() => handleEditCliente(school.cliente_id!)}
                              className="ml-1 p-1 text-green-600 hover:text-green-800 transition-colors"
                              title="Editar cliente"
                            >
                              <Edit2 size={12} />
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {school.has_generations === true && (
                        <button
                          onClick={() => handleAddGeneration(school)}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200 transition-colors"
                        >
                          <Plus size={16} className="inline mr-1" />
                          Generación
                        </button>
                      )}
                      <button
                        onClick={() => handleEditSchool(school)}
                        className="p-2 text-gray-600 hover:text-[#fbbf24] transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteSchool(school)}
                        className="p-2 text-gray-600 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                      {school.cliente_id ? (
                        <button
                          onClick={() => handleCreateContract(school)}
                          className="p-2 text-green-600 hover:text-green-700 transition-colors"
                          title="Crear contrato"
                        >
                          <FileText size={18} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleLinkClient(school)}
                          className="p-2 text-blue-600 hover:text-blue-700 transition-colors"
                          title="Vincular cliente"
                        >
                          <Plus size={18} />
                        </button>
                      )}
                    </div>
                  </div>

                  {expandedSchools.has(school.id) && school.has_generations === true && school.generations && school.generations.length > 0 && (
                    <div className="mt-4 ml-9 space-y-2">
                      {school.generations.map((generation) => (
                        <div key={generation.id} className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium text-gray-900">{generation.name}</h4>
                              <div className="text-sm text-gray-600 mt-1">
                                {generation.grade_range && <span>{generation.grade_range}</span>}
                                <span className="ml-4 flex items-center inline">
                                  <Users size={12} className="mr-1" />
                                  {generation._count?.profiles || 0} usuarios
                                </span>
                                <span className="ml-4">
                                  {generation._count?.communities || 0} comunidades
                                </span>
                              </div>
                              {generation.description && (
                                <p className="text-sm text-gray-500 mt-2">{generation.description}</p>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleEditGeneration(generation, school)}
                                className="p-1 text-gray-600 hover:text-[#fbbf24] transition-colors"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteGeneration(generation)}
                                className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* School Modal */}
      {showSchoolModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-[#0a0a0a] mb-4">
              {editingSchool ? 'Editar Escuela' : 'Nueva Escuela'}
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={schoolForm.name}
                  onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Nombre de la escuela"
                />
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={schoolForm.has_generations}
                    onChange={(e) => setSchoolForm({ ...schoolForm, has_generations: e.target.checked })}
                    className="mr-2 h-4 w-4 text-[#fbbf24] focus:ring-[#fbbf24] border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">Habilitar generaciones para esta escuela</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  Marcar solo si la escuela organiza estudiantes por generaciones (ej: Tractor, Innova)
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowSchoolModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveSchool}
                className="px-4 py-2 bg-[#fbbf24] text-white rounded-lg hover:bg-[#e6a42e] transition-colors"
              >
                {editingSchool ? 'Actualizar' : 'Crear'} Escuela
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generation Modal */}
      {showGenerationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-[#0a0a0a] mb-4">
              {editingGeneration ? 'Editar Generación' : 'Nueva Generación'}
            </h2>
            {selectedSchool && (
              <p className="text-sm text-gray-600 mb-4">Escuela: {selectedSchool.name}</p>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={generationForm.name}
                  onChange={(e) => setGenerationForm({ ...generationForm, name: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Ej: Tractor, Innova"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rango de Grados
                </label>
                <select
                  value={generationForm.grade_range}
                  onChange={(e) => setGenerationForm({ ...generationForm, grade_range: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                >
                  <option value="">Seleccione un rango...</option>
                  <optgroup label="Educación Parvularia">
                    <option value="P1-P2">P1-P2</option>
                    <option value="P1-P3">P1-P3</option>
                    <option value="P1-PreKinder">P1-PreKinder</option>
                    <option value="P1-Kinder">P1-Kinder</option>
                    <option value="P2-P3">P2-P3</option>
                    <option value="P2-PreKinder">P2-PreKinder</option>
                    <option value="P2-Kinder">P2-Kinder</option>
                    <option value="P3-PreKinder">P3-PreKinder</option>
                    <option value="P3-Kinder">P3-Kinder</option>
                    <option value="PreKinder-Kinder">PreKinder-Kinder</option>
                  </optgroup>
                  <optgroup label="Desde P1">
                    <option value="P1-2do">P1-2do</option>
                    <option value="P1-3ro">P1-3ro</option>
                    <option value="P1-4to">P1-4to</option>
                    <option value="P1-5to">P1-5to</option>
                    <option value="P1-6to">P1-6to</option>
                    <option value="P1-8vo">P1-8vo</option>
                    <option value="P1-12vo">P1-12vo</option>
                  </optgroup>
                  <optgroup label="Desde PreKinder">
                    <option value="PreKinder-2do">PreKinder-2do</option>
                    <option value="PreKinder-3ro">PreKinder-3ro</option>
                    <option value="PreKinder-4to">PreKinder-4to</option>
                    <option value="PreKinder-5to">PreKinder-5to</option>
                    <option value="PreKinder-6to">PreKinder-6to</option>
                    <option value="PreKinder-8vo">PreKinder-8vo</option>
                    <option value="PreKinder-12vo">PreKinder-12vo</option>
                  </optgroup>
                  <optgroup label="Desde Kinder">
                    <option value="Kinder-2do">Kinder-2do</option>
                    <option value="Kinder-3ro">Kinder-3ro</option>
                    <option value="Kinder-4to">Kinder-4to</option>
                    <option value="Kinder-5to">Kinder-5to</option>
                    <option value="Kinder-6to">Kinder-6to</option>
                    <option value="Kinder-8vo">Kinder-8vo</option>
                    <option value="Kinder-12vo">Kinder-12vo</option>
                  </optgroup>
                  <optgroup label="Educación Básica">
                    <option value="1ro-2do">1ro-2do</option>
                    <option value="1ro-3ro">1ro-3ro</option>
                    <option value="1ro-4to">1ro-4to</option>
                    <option value="1ro-5to">1ro-5to</option>
                    <option value="1ro-6to">1ro-6to</option>
                    <option value="1ro-8vo">1ro-8vo</option>
                    <option value="1ro-12vo">1ro-12vo</option>
                    <option value="3ro-4to">3ro-4to</option>
                    <option value="3ro-5to">3ro-5to</option>
                    <option value="3ro-6to">3ro-6to</option>
                    <option value="3ro-8vo">3ro-8vo</option>
                    <option value="3ro-12vo">3ro-12vo</option>
                    <option value="5to-6to">5to-6to</option>
                    <option value="5to-8vo">5to-8vo</option>
                    <option value="5to-12vo">5to-12vo</option>
                  </optgroup>
                  <optgroup label="Educación Media">
                    <option value="7mo-8vo">7mo-8vo</option>
                    <option value="7mo-12vo">7mo-12vo</option>
                    <option value="9no-12vo">9no-12vo</option>
                  </optgroup>
                  <optgroup label="Grupos Especiales">
                    <option value="Equipo Directivo">Equipo Directivo</option>
                    <option value="Docentes">Docentes</option>
                    <option value="Asistentes de la Educación">Asistentes de la Educación</option>
                    <option value="Apoderados">Apoderados</option>
                    <option value="Otro">Otro</option>
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción
                </label>
                <textarea
                  value={generationForm.description}
                  onChange={(e) => setGenerationForm({ ...generationForm, description: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Descripción opcional"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowGenerationModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveGeneration}
                className="px-4 py-2 bg-[#fbbf24] text-white rounded-lg hover:bg-[#e6a42e] transition-colors"
              >
                {editingGeneration ? 'Actualizar' : 'Crear'} Generación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmationModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-[#0a0a0a] mb-4">
              {confirmationModal.title}
            </h2>
            
            {confirmationModal.message && (
              <p className="text-gray-700 mb-3">{confirmationModal.message}</p>
            )}
            
            {confirmationModal.details && confirmationModal.details.length > 0 && (
              <ul className="list-disc list-inside mb-4 space-y-1">
                {confirmationModal.details.map((detail, index) => (
                  <li key={index} className="text-gray-600 text-sm">{detail}</li>
                ))}
              </ul>
            )}
            
            {confirmationModal.note && (
              <p className="text-sm text-gray-500 mb-4">{confirmationModal.note}</p>
            )}
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmationModal({ ...confirmationModal, show: false })}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => confirmationModal.onConfirm()}
                className="px-4 py-2 bg-[#fbbf24] text-white rounded-lg hover:bg-[#e6a42e] transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Link Modal */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-[#0a0a0a] mb-4">
              Vincular Cliente a {linkingSchool?.name}
            </h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seleccionar Cliente
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                onChange={(e) => e.target.value && handleSaveLinkClient(e.target.value)}
              >
                <option value="">Seleccione un cliente...</option>
                {clientes.map(cliente => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre_fantasia} - {cliente.rut}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowClientModal(false);
                  setLinkingSchool(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Edit Modal */}
      {showClientEditModal && editingCliente && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-[#0a0a0a] mb-4">
              Editar Cliente: {editingCliente.nombre_fantasia}
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
                  setShowClientEditModal(false);
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
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}