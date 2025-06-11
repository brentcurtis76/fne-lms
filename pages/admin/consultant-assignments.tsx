import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '../../components/layout/MainLayout';
import ConsultantAssignmentModal from '../../components/ConsultantAssignmentModal';
import { supabase } from '../../lib/supabase';
import { ResponsiveFunctionalPageHeader } from '../../components/layout/FunctionalPageHeader';
import { GraduationCap, Plus } from 'lucide-react';

interface Assignment {
  id: string;
  consultant_id: string;
  student_id: string;
  assignment_type: string;
  can_view_progress: boolean;
  can_assign_courses: boolean;
  can_message_student: boolean;
  school_id?: string;
  generation_id?: string;
  community_id?: string;
  starts_at?: string;
  ends_at?: string;
  is_active: boolean;
  created_at: string;
  consultant?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  student?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  school?: {
    id: string;
    name: string;
  };
  generation?: {
    id: string;
    name: string;
  };
  community?: {
    id: string;
    name: string;
  };
}

const ConsultantAssignmentsPage: React.FC = () => {
  const router = useRouter();
  
  // Authentication state
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  
  // Data state
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  // Assignment type labels
  const assignmentTypeLabels = {
    monitoring: 'Monitoreo',
    mentoring: 'Mentoría',
    evaluation: 'Evaluación',
    support: 'Apoyo'
  };

  // Assignment type colors
  const assignmentTypeColors = {
    monitoring: 'bg-blue-100 text-blue-800',
    mentoring: 'bg-green-100 text-green-800',
    evaluation: 'bg-purple-100 text-purple-800',
    support: 'bg-orange-100 text-orange-800'
  };

  useEffect(() => {
    initializeAuth();
  }, [router]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchAssignments();
    }
  }, [user, isAdmin]);

  const initializeAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role, first_name, last_name, avatar_url')
        .eq('id', session.user.id)
        .single();
      
      if (profileData) {
        const isAdminUser = profileData.role === 'admin';
        setIsAdmin(isAdminUser);
        
        if (!isAdminUser) {
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  const fetchAssignments = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        console.error('Session error:', sessionError);
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch('/api/admin/consultant-assignments', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch assignments');
      }

      const data = await response.json();
      setAssignments(data.assignments || []);
    } catch (error) {
      console.error('Error fetching assignments:', error);
      toast.error('Error al cargar asignaciones');
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!confirm('¿Está seguro de que desea eliminar esta asignación?')) {
      return;
    }

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/admin/consultant-assignments?id=${assignmentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete assignment');
      }

      toast.success('Asignación eliminada exitosamente');
      fetchAssignments();
    } catch (error) {
      console.error('Error deleting assignment:', error);
      toast.error('Error al eliminar asignación');
    }
  };

  const handleEditAssignment = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setIsModalOpen(true);
  };

  const handleCreateAssignment = () => {
    setEditingAssignment(null);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingAssignment(null);
  };

  const handleAssignmentCreated = () => {
    fetchAssignments();
  };

  const getFilteredAssignments = () => {
    let filtered = assignments;

    // Filter by status
    if (filterStatus === 'active') {
      filtered = filtered.filter(a => a.is_active);
    } else if (filterStatus === 'inactive') {
      filtered = filtered.filter(a => !a.is_active);
    }

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(a => a.assignment_type === filterType);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(a => 
        a.consultant?.first_name?.toLowerCase().includes(term) ||
        a.consultant?.last_name?.toLowerCase().includes(term) ||
        a.student?.first_name?.toLowerCase().includes(term) ||
        a.student?.last_name?.toLowerCase().includes(term) ||
        a.consultant?.email?.toLowerCase().includes(term) ||
        a.student?.email?.toLowerCase().includes(term)
      );
    }

    return filtered;
  };

  const getPermissionBadges = (assignment: Assignment) => {
    const permissions = [];
    if (assignment.can_view_progress) permissions.push('Progreso');
    if (assignment.can_assign_courses) permissions.push('Asignar');
    if (assignment.can_message_student) permissions.push('Mensajes');
    return permissions;
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'Sin límite';
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isAssignmentActive = (assignment: Assignment) => {
    if (!assignment.is_active) return false;
    
    const now = new Date();
    const starts = assignment.starts_at ? new Date(assignment.starts_at) : null;
    const ends = assignment.ends_at ? new Date(assignment.ends_at) : null;
    
    if (starts && starts > now) return false;
    if (ends && ends < now) return false;
    
    return true;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#e8e5e2] flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00365b]"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#e8e5e2] flex justify-center items-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#00365b] mb-4">Acceso Denegado</h1>
          <p className="text-gray-600">No tiene permisos para acceder a esta página.</p>
        </div>
      </div>
    );
  }

  const filteredAssignments = getFilteredAssignments();

  return (
    <MainLayout 
      user={user} 
      currentPage="consultants"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<GraduationCap />}
        title="Consultorías"
        subtitle="Gestión de asignaciones consultor-estudiante para seguimiento y mentorías"
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por nombre o email..."
        primaryAction={{
          label: "Nueva Asignación",
          onClick: handleCreateAssignment,
          icon: <Plus size={20} />
        }}
      />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
            >
              <option value="all">Todos los tipos</option>
              <option value="monitoring">Monitoreo</option>
              <option value="mentoring">Mentoría</option>
              <option value="evaluation">Evaluación</option>
              <option value="support">Apoyo</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
            >
              <option value="all">Todas las asignaciones</option>
              <option value="active">Solo activas</option>
              <option value="inactive">Solo inactivas</option>
            </select>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {assignments.filter(a => a.is_active).length}
              </div>
              <div className="text-sm text-blue-800">Asignaciones Activas</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {assignments.filter(a => a.assignment_type === 'mentoring').length}
              </div>
              <div className="text-sm text-green-800">Mentorías</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {new Set(assignments.map(a => a.consultant_id)).size}
              </div>
              <div className="text-sm text-purple-800">Consultores Únicos</div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {new Set(assignments.map(a => a.student_id)).size}
              </div>
              <div className="text-sm text-orange-800">Estudiantes Únicos</div>
            </div>
          </div>

          {/* Assignments Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left p-4 font-medium text-gray-700">Consultor</th>
                  <th className="text-left p-4 font-medium text-gray-700">Estudiante</th>
                  <th className="text-left p-4 font-medium text-gray-700">Tipo</th>
                  <th className="text-left p-4 font-medium text-gray-700">Permisos</th>
                  <th className="text-left p-4 font-medium text-gray-700">Duración</th>
                  <th className="text-left p-4 font-medium text-gray-700">Estado</th>
                  <th className="text-left p-4 font-medium text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center p-8 text-gray-500">
                      {searchTerm || filterType !== 'all' || filterStatus !== 'all' 
                        ? 'No se encontraron asignaciones que coincidan con los filtros.'
                        : 'No hay asignaciones creadas aún.'
                      }
                    </td>
                  </tr>
                ) : (
                  filteredAssignments.map((assignment) => (
                    <tr key={assignment.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-4">
                        <div>
                          <div className="font-medium text-gray-900">
                            {assignment.consultant?.first_name} {assignment.consultant?.last_name}
                          </div>
                          <div className="text-sm text-gray-500">{assignment.consultant?.email}</div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          <div className="font-medium text-gray-900">
                            {assignment.student?.first_name} {assignment.student?.last_name}
                          </div>
                          <div className="text-sm text-gray-500">{assignment.student?.email}</div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          assignmentTypeColors[assignment.assignment_type as keyof typeof assignmentTypeColors]
                        }`}>
                          {assignmentTypeLabels[assignment.assignment_type as keyof typeof assignmentTypeLabels]}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {getPermissionBadges(assignment).map((permission, index) => (
                            <span 
                              key={index}
                              className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                            >
                              {permission}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm">
                          <div>Inicio: {formatDateTime(assignment.starts_at)}</div>
                          <div>Fin: {formatDateTime(assignment.ends_at)}</div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          isAssignmentActive(assignment)
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {isAssignmentActive(assignment) ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditAssignment(assignment)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteAssignment(assignment.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      <ConsultantAssignmentModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onAssignmentCreated={handleAssignmentCreated}
        editingAssignment={editingAssignment}
      />
    </MainLayout>
  );
};

export default ConsultantAssignmentsPage;