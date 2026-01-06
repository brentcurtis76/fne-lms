/**
 * Network Management Interface for Administrators
 * Comprehensive UI for managing networks, school assignments, and supervisors
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../components/layout/FunctionalPageHeader';
import { 
  Network, 
  Plus, 
  School, 
  Users, 
  Edit3, 
  Trash2, 
  UserPlus, 
  Building,
  Eye,
  AlertTriangle,
  Check,
  X,
  Search,
  Filter
} from 'lucide-react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../../lib/supabase';
import { getUserPrimaryRole } from '../../utils/roleUtils';

interface NetworkData {
  id: string;
  name: string;
  description?: string;
  created_by?: string;
  last_updated_by?: string;
  created_at: string;
  updated_at: string;
  school_count: number;
  supervisor_count: number;
  schools: Array<{
    id: number;
    name: string;
    code?: string;
    assigned_at: string;
    assigned_by?: string;
  }>;
  supervisors: Array<{
    user_id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    assigned_at: string;
  }>;
}

interface School {
  id: number;
  name: string;
  has_generations?: boolean;
  current_network?: {
    id: string;
    name: string;
    assigned_at: string;
  };
}

interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  created_at: string;
}

const NetworkManagementPage: React.FC = () => {
  const router = useRouter();
  const supabaseClient = useSupabaseClient();
  
  // Authentication state
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  
  // Data state
  const [loading, setLoading] = useState(true);
  const [networks, setNetworks] = useState<NetworkData[]>([]);
  const [availableSchools, setAvailableSchools] = useState<School[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  
  // UI state
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkData | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSchoolModal, setShowSchoolModal] = useState(false);
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Form state
  const [networkForm, setNetworkForm] = useState({ name: '', description: '' });
  const [selectedSchools, setSelectedSchools] = useState<number[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState<'all' | 'with_supervisors' | 'without_supervisors'>('all');
  const [migrationError, setMigrationError] = useState(false);

  useEffect(() => {
    initializeAuth();
  }, []);

  useEffect(() => {
    if (user && userRole) {
      fetchNetworks();
    }
  }, [user, userRole]);

  const initializeAuth = async () => {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      const { data: profileData } = await supabaseClient
        .from('profiles')
        .select('first_name, last_name, avatar_url')
        .eq('id', session.user.id)
        .single();
      
      if (profileData) {
        const role = await getUserPrimaryRole(session.user.id);
        setUserRole(role);
        setIsAdmin(role === 'admin');
        
        if (role !== 'admin') {
          toast.error('Solo administradores pueden acceder a la gestión de redes');
          router.push('/dashboard');
          return;
        }
        
        if (profileData.avatar_url) {
          setAvatarUrl(profileData.avatar_url);
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const fetchNetworks = async () => {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch('/api/admin/networks', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Network fetch error:', errorData);
        
        // Check if it's a missing table error
        if (errorData.details && errorData.details.includes('does not exist')) {
          setMigrationError(true);
          toast.error('Las tablas de red no existen. Por favor aplique la migración de base de datos.');
          return;
        }
        
        throw new Error(errorData.error || 'Error al cargar redes');
      }

      const data = await response.json();
      setNetworks(data.networks || []);
    } catch (error) {
      console.error('Error fetching networks:', error);
      toast.error('Error al cargar redes');
    }
  };

  const fetchAllSchoolsWithNetworks = async () => {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch('/api/admin/networks/all-schools-simple', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Schools API response:', data);
        setAvailableSchools(data.schools || []);
      } else {
        const errorData = await response.json();
        console.error('Error response from API:', errorData);
        console.error('Full error details:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        toast.error(errorData.error || 'Error al cargar escuelas');
      }
    } catch (error) {
      console.error('Error fetching schools:', error);
    }
  };

  const fetchAvailableUsers = async (networkId: string) => {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(`/api/admin/networks/supervisors-simple?networkId=${networkId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAvailableUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching available users:', error);
    }
  };

  const handleCreateNetwork = async () => {
    if (!networkForm.name.trim()) {
      toast.error('El nombre de la red es requerido');
      return;
    }

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch('/api/admin/networks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(networkForm)
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || 'Red creada exitosamente');
        setShowCreateModal(false);
        setNetworkForm({ name: '', description: '' });
        fetchNetworks();
      } else {
        console.error('Network creation failed:', data);
        if (data.details) {
          toast.error(`${data.error}: ${data.details}`);
        } else {
          toast.error(data.error || 'Error al crear la red');
        }
      }
    } catch (error) {
      console.error('Error creating network:', error);
      toast.error('Error al crear la red');
    }
  };

  const handleUpdateNetwork = async () => {
    if (!selectedNetwork || !networkForm.name.trim()) {
      toast.error('El nombre de la red es requerido');
      return;
    }

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch('/api/admin/networks', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: selectedNetwork.id,
          ...networkForm
        })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || 'Red actualizada exitosamente');
        setShowEditModal(false);
        setNetworkForm({ name: '', description: '' });
        setSelectedNetwork(null);
        fetchNetworks();
      } else {
        toast.error(data.error || 'Error al actualizar la red');
      }
    } catch (error) {
      console.error('Error updating network:', error);
      toast.error('Error al actualizar la red');
    }
  };

  const handleDeleteNetwork = async () => {
    if (!selectedNetwork) return;

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/admin/networks?id=${selectedNetwork.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || 'Red eliminada exitosamente');
        setShowDeleteConfirm(false);
        setSelectedNetwork(null);
        fetchNetworks();
      } else {
        toast.error(data.error || 'Error al eliminar la red');
      }
    } catch (error) {
      console.error('Error deleting network:', error);
      toast.error('Error al eliminar la red');
    }
  };

  const handleAssignSchools = async () => {
    if (!selectedNetwork || selectedSchools.length === 0) {
      toast.error('Selecciona al menos una escuela');
      return;
    }

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch('/api/admin/networks/schools', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          networkId: selectedNetwork.id,
          schoolIds: selectedSchools
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Handle enhanced API response with detailed feedback
        const { message, summary, assigned_schools, already_assigned_schools, conflicted_schools } = data;
        
        // Show main success message
        toast.success(message || 'Operación completada');
        
        // Show detailed breakdown if available
        if (summary) {
          console.log('📊 Assignment Summary:', summary);
          
          // Additional detailed notifications for transparency
          if (assigned_schools && assigned_schools.length > 0) {
            console.log('✅ Newly assigned schools:', assigned_schools);
          }
          
          if (already_assigned_schools && already_assigned_schools.length > 0) {
            console.log('ℹ️ Already assigned schools:', already_assigned_schools);
          }
          
          if (conflicted_schools && conflicted_schools.length > 0) {
            console.log('⚠️ Conflicted schools:', conflicted_schools);
            // Show warning toast for conflicts
            const conflictNames = conflicted_schools.map((s: any) => `${s.name} (${s.current_network})`).join(', ');
            // @ts-expect-error - toast.warn not in types but exists
            toast.warn(`Escuelas omitidas por conflictos: ${conflictNames}`, { duration: 8000 });
          }
        }
        
        setShowSchoolModal(false);
        setSelectedSchools([]);
        setSelectedNetwork(null);
        fetchNetworks();
      } else {
        // Handle error response - could be partial success with conflicts
        if (response.status === 409 && data.summary) {
          // Show warning for conflict-only scenario
          // @ts-expect-error - toast.warn not in types but exists
          toast.warn(data.error || 'Algunas escuelas no pudieron ser asignadas');
          
          if (data.conflicted_schools && data.conflicted_schools.length > 0) {
            const conflictDetails = data.conflicted_schools
              .map((s: any) => `${s.name} → ${s.current_network}`)
              .join(', ');
            console.log('⚠️ Detailed conflicts:', conflictDetails);
          }
        } else {
          // Standard error handling
          toast.error(data.error || 'Error al asignar escuelas');
        }
      }
    } catch (error) {
      console.error('Error assigning schools:', error);
      toast.error('Error al asignar escuelas');
    }
  };

  const handleAssignSupervisor = async () => {
    if (!selectedNetwork || !selectedUser) {
      toast.error('Selecciona un usuario');
      return;
    }

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch('/api/admin/networks/supervisors', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          networkId: selectedNetwork.id,
          userId: selectedUser
        })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || 'Supervisor asignado exitosamente');
        setShowSupervisorModal(false);
        setSelectedUser('');
        setSelectedNetwork(null);
        fetchNetworks();
      } else {
        toast.error(data.error || 'Error al asignar supervisor');
      }
    } catch (error) {
      console.error('Error assigning supervisor:', error);
      toast.error('Error al asignar supervisor');
    }
  };

  const handleRemoveSchool = async (schoolId: number) => {
    if (!selectedNetwork) return;

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch('/api/admin/networks/schools', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          networkId: selectedNetwork.id,
          schoolId: schoolId
        })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || 'Escuela removida exitosamente');
        fetchNetworks();
      } else {
        toast.error(data.error || 'Error al remover escuela');
      }
    } catch (error) {
      console.error('Error removing school:', error);
      toast.error('Error al remover escuela');
    }
  };

  const handleRemoveSupervisor = async (userId: string) => {
    if (!selectedNetwork) return;

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch('/api/admin/networks/supervisors', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          networkId: selectedNetwork.id,
          userId: userId
        })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || 'Supervisor removido exitosamente');
        fetchNetworks();
      } else {
        toast.error(data.error || 'Error al remover supervisor');
      }
    } catch (error) {
      console.error('Error removing supervisor:', error);
      toast.error('Error al remover supervisor');
    }
  };

  const openEditModal = (network: NetworkData) => {
    setSelectedNetwork(network);
    setNetworkForm({ 
      name: network.name, 
      description: network.description || '' 
    });
    setShowEditModal(true);
  };

  const openSchoolModal = (network: NetworkData) => {
    setSelectedNetwork(network);
    // Pre-select schools already in this network
    const currentSchoolIds = network.schools.map(s => s.id);
    setSelectedSchools(currentSchoolIds);
    fetchAllSchoolsWithNetworks();
    setShowSchoolModal(true);
  };

  const openSupervisorModal = (network: NetworkData) => {
    setSelectedNetwork(network);
    setSelectedUser('');
    fetchAvailableUsers(network.id);
    setShowSupervisorModal(true);
  };

  const openDeleteConfirm = (network: NetworkData) => {
    setSelectedNetwork(network);
    setShowDeleteConfirm(true);
  };

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Filter networks based on search and filter criteria
  const filteredNetworks = networks.filter(network => {
    const matchesSearch = !searchQuery || 
      network.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      network.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = filterBy === 'all' ||
      (filterBy === 'with_supervisors' && network.supervisor_count > 0) ||
      (filterBy === 'without_supervisors' && network.supervisor_count === 0);

    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#e8e5e2] flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a0a0a]"></div>
      </div>
    );
  }

  return (
    <MainLayout 
      user={user} 
      currentPage="network-management"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<Network />}
        title="Gestión de Redes"
        subtitle="Administra redes de colegios y supervisores"
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Buscar redes..."
      >
        <div className="flex items-center space-x-3">
          <select
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent text-sm"
          >
            <option value="all">Todas las redes</option>
            <option value="with_supervisors">Con supervisores</option>
            <option value="without_supervisors">Sin supervisores</option>
          </select>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center px-4 py-2 bg-[#0a0a0a] text-white rounded-lg hover:bg-[#0a0a0a]/90 transition-colors"
          >
            <Plus size={20} className="mr-2" />
            Nueva Red
          </button>
        </div>
      </ResponsiveFunctionalPageHeader>
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Migration Error Banner */}
        {migrationError && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-yellow-800">
                  Migración de Base de Datos Requerida
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>Las tablas de red no existen en la base de datos. Para usar esta funcionalidad:</p>
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>Ve al Dashboard de Supabase → SQL Editor</li>
                    <li>Copia el contenido de <code className="bg-yellow-200 px-1 rounded">/database/add-supervisor-de-red-role-fixed.sql</code></li>
                    <li>Ejecuta el SQL en DOS PASOS (ver archivo para instrucciones)</li>
                    <li>Recarga esta página</li>
                  </ol>
                </div>
                <div className="mt-4">
                  <a
                    href="/admin/apply-network-migration"
                    className="text-sm font-medium text-yellow-800 hover:text-yellow-900 underline"
                  >
                    Ver instrucciones detalladas →
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Network className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">{networks.length}</div>
                <div className="text-sm text-gray-600">Total Redes</div>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <Building className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">
                  {networks.reduce((sum, n) => sum + n.school_count, 0)}
                </div>
                <div className="text-sm text-gray-600">Escuelas Asignadas</div>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Users className="h-6 w-6 text-amber-600" />
              </div>
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">
                  {networks.reduce((sum, n) => sum + n.supervisor_count, 0)}
                </div>
                <div className="text-sm text-gray-600">Supervisores Activos</div>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">
                  {networks.filter(n => n.supervisor_count === 0).length}
                </div>
                <div className="text-sm text-gray-600">Sin Supervisores</div>
              </div>
            </div>
          </div>
        </div>

        {/* Networks Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredNetworks.map((network) => (
            <div key={network.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow">
              <div className="p-6">
                {/* Network Header */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{network.name}</h3>
                    {network.description && (
                      <p className="text-sm text-gray-600 mt-1">{network.description}</p>
                    )}
                  </div>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => openEditModal(network)}
                      className="p-2 text-gray-400 hover:text-[#0a0a0a] transition-colors"
                      title="Editar red"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => openDeleteConfirm(network)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                      title="Eliminar red"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-xl font-bold text-[#0a0a0a]">{network.school_count}</div>
                    <div className="text-xs text-gray-600">Escuelas</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-xl font-bold text-[#fbbf24]">{network.supervisor_count}</div>
                    <div className="text-xs text-gray-600">Supervisores</div>
                  </div>
                </div>

                {/* Schools Preview */}
                {network.schools.length > 0 && (
                  <div className="mb-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">Escuelas Asignadas:</div>
                    <div className="space-y-1">
                      {network.schools.slice(0, 3).map((school) => (
                        <div key={school.id} className="flex justify-between items-center text-sm">
                          <span className="text-gray-600">{school.name}</span>
                          <button
                            onClick={() => handleRemoveSchool(school.id)}
                            className="text-red-400 hover:text-red-600"
                            title="Remover escuela"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      {network.schools.length > 3 && (
                        <div className="text-sm text-gray-500">
                          +{network.schools.length - 3} más
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Supervisors Preview */}
                {network.supervisors.length > 0 && (
                  <div className="mb-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">Supervisores:</div>
                    <div className="space-y-1">
                      {network.supervisors.map((supervisor) => (
                        <div key={supervisor.user_id} className="flex justify-between items-center text-sm">
                          <span className="text-gray-600">
                            {supervisor.first_name} {supervisor.last_name}
                          </span>
                          <button
                            onClick={() => handleRemoveSupervisor(supervisor.user_id)}
                            className="text-red-400 hover:text-red-600"
                            title="Remover supervisor"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex space-x-2">
                  <button
                    onClick={() => openSchoolModal(network)}
                    className="flex-1 flex items-center justify-center px-3 py-2 bg-[#0a0a0a] text-white rounded-lg hover:bg-[#0a0a0a]/90 transition-colors text-sm"
                  >
                    <Building size={16} className="mr-1" />
                    Escuelas
                  </button>
                  <button
                    onClick={() => openSupervisorModal(network)}
                    className="flex-1 flex items-center justify-center px-3 py-2 bg-[#fbbf24] text-white rounded-lg hover:bg-[#fbbf24]/90 transition-colors text-sm"
                  >
                    <UserPlus size={16} className="mr-1" />
                    Supervisores
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredNetworks.length === 0 && (
          <div className="text-center py-12">
            <Network className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No hay redes</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery ? 'No se encontraron redes que coincidan con tu búsqueda.' : 'Comienza creando tu primera red de colegios.'}
            </p>
            {!searchQuery && (
              <div className="mt-6">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-[#0a0a0a] text-white rounded-lg hover:bg-[#0a0a0a]/90 transition-colors"
                >
                  <Plus size={20} className="mr-2" />
                  Nueva Red
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Network Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Crear Nueva Red</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de la Red *
                </label>
                <input
                  type="text"
                  value={networkForm.name}
                  onChange={(e) => setNetworkForm({ ...networkForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Ej: Red Norte, Red Metropolitana"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción
                </label>
                <textarea
                  value={networkForm.description}
                  onChange={(e) => setNetworkForm({ ...networkForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  placeholder="Descripción opcional de la red"
                />
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNetworkForm({ name: '', description: '' });
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateNetwork}
                className="flex-1 px-4 py-2 bg-[#0a0a0a] text-white rounded-lg hover:bg-[#0a0a0a]/90 transition-colors"
              >
                Crear Red
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Network Modal */}
      {showEditModal && selectedNetwork && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Editar Red</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de la Red *
                </label>
                <input
                  type="text"
                  value={networkForm.name}
                  onChange={(e) => setNetworkForm({ ...networkForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción
                </label>
                <textarea
                  value={networkForm.description}
                  onChange={(e) => setNetworkForm({ ...networkForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                />
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setNetworkForm({ name: '', description: '' });
                  setSelectedNetwork(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleUpdateNetwork}
                className="flex-1 px-4 py-2 bg-[#0a0a0a] text-white rounded-lg hover:bg-[#0a0a0a]/90 transition-colors"
              >
                Actualizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* School Assignment Modal */}
      {showSchoolModal && selectedNetwork && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              Asignar Escuelas a "{selectedNetwork.name}"
            </h3>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <span className="font-medium">Nota:</span> Las escuelas que ya pertenecen a otra red aparecen deshabilitadas 
                y muestran a qué red están asignadas. Solo puedes seleccionar escuelas disponibles o las que ya están en esta red.
              </p>
            </div>
            
            {selectedSchools.length > 0 && (
              <div className="mb-4 text-sm text-gray-600">
                <span className="font-medium">{selectedSchools.length}</span> escuela{selectedSchools.length !== 1 ? 's' : ''} seleccionada{selectedSchools.length !== 1 ? 's' : ''}
              </div>
            )}
            
            {availableSchools.length > 0 ? (
              <div className="space-y-2 mb-4">
                {availableSchools.map((school) => {
                  const isInThisNetwork = school.current_network?.id === selectedNetwork.id;
                  const isInOtherNetwork = school.current_network && school.current_network.id !== selectedNetwork.id;
                  const isDisabled = isInOtherNetwork;
                  
                  return (
                    <label 
                      key={school.id} 
                      className={`flex items-center p-3 border rounded-lg ${
                        isDisabled ? 'bg-gray-100 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSchools.includes(school.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSchools([...selectedSchools, school.id]);
                          } else {
                            setSelectedSchools(selectedSchools.filter(id => id !== school.id));
                          }
                        }}
                        disabled={isDisabled}
                        className="mr-3"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{school.name}</span>
                          {isInThisNetwork && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              En esta red
                            </span>
                          )}
                        </div>
                        {isInOtherNetwork && (
                          <div className="text-sm text-red-600 mt-1">
                            Asignado a: {school.current_network.name}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <School className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No hay escuelas</h3>
                <p className="mt-1 text-sm text-gray-500">
                  No se encontraron escuelas en el sistema.
                </p>
              </div>
            )}
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowSchoolModal(false);
                  setSelectedSchools([]);
                  setSelectedNetwork(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssignSchools}
                disabled={selectedSchools.length === 0}
                className="flex-1 px-4 py-2 bg-[#0a0a0a] text-white rounded-lg hover:bg-[#0a0a0a]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Guardar Cambios ({selectedSchools.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supervisor Assignment Modal */}
      {showSupervisorModal && selectedNetwork && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">
              Asignar Supervisor a "{selectedNetwork.name}"
            </h3>
            
            {availableUsers.length > 0 ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Seleccionar Usuario
                  </label>
                  <select
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  >
                    <option value="">Selecciona un usuario...</option>
                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No hay usuarios disponibles</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Todos los usuarios ya tienen roles de supervisor asignados.
                </p>
              </div>
            )}
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowSupervisorModal(false);
                  setSelectedUser('');
                  setSelectedNetwork(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssignSupervisor}
                disabled={!selectedUser}
                className="flex-1 px-4 py-2 bg-[#0a0a0a] text-white rounded-lg hover:bg-[#0a0a0a]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Asignar Supervisor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedNetwork && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-6 w-6 text-red-600 mr-3" />
              <h3 className="text-lg font-semibold">Confirmar Eliminación</h3>
            </div>
            
            <p className="text-gray-600 mb-4">
              ¿Estás seguro de que quieres eliminar la red "{selectedNetwork.name}"?
            </p>
            
            {selectedNetwork.supervisor_count > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-800">
                  <strong>Advertencia:</strong> Esta red tiene {selectedNetwork.supervisor_count} supervisor(es) activo(s). 
                  Primero debes remover todos los supervisores antes de eliminar la red.
                </p>
              </div>
            )}
            
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setSelectedNetwork(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteNetwork}
                disabled={selectedNetwork.supervisor_count > 0}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Eliminar Red
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default NetworkManagementPage;