import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import MainLayout from '../../components/layout/MainLayout';
import { Trash2, Plus, X, AlertTriangle, CheckCircle, Settings } from 'lucide-react';
import { toast } from 'react-hot-toast';
import RoleAssignmentModal from '../../components/RoleAssignmentModal';
import ConsultantAssignmentModal from '../../components/ConsultantAssignmentModal';
import { getUserRoles } from '../../utils/roleUtils';
import { ROLE_NAMES } from '../../types/roles';

type User = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  school: string;
  created_at: string;
  approval_status: string;
  user_roles?: any[];
  consultant_assignments?: any[];
  student_assignments?: any[];
};

export default function UserManagement() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'all'>('pending');
  
  // Add user form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFirstName, setNewUserFirstName] = useState('');
  const [newUserLastName, setNewUserLastName] = useState('');
  const [newUserRole, setNewUserRole] = useState('docente');
  
  const handleOpenRoleModal = (user: User) => {
    const userName = user.first_name && user.last_name 
      ? `${user.first_name} ${user.last_name}` 
      : 'Sin nombre';
    setSelectedUser({
      id: user.id,
      name: userName,
      email: user.email
    });
    setShowRoleModal(true);
  };
  
  const handleCloseRoleModal = () => {
    setShowRoleModal(false);
    setSelectedUser(null);
  };
  
  const handleRoleUpdate = () => {
    // Refresh users list after role update
    fetchUsers();
  };

  const handleOpenConsultantModal = (user: User) => {
    setSelectedUserForAssignment(user);
    setShowConsultantModal(true);
  };
  
  const handleCloseConsultantModal = () => {
    setShowConsultantModal(false);
    setSelectedUserForAssignment(null);
  };
  
  const handleConsultantAssignmentCreated = () => {
    // Refresh users list after assignment update
    fetchUsers();
  };
  const [isCreating, setIsCreating] = useState(false);
  
  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{id: string, email: string} | null>(null);
  
  // Role assignment modal state
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{id: string, name: string, email: string} | null>(null);
  
  // Consultant assignment modal state
  const [showConsultantModal, setShowConsultantModal] = useState(false);
  const [selectedUserForAssignment, setSelectedUserForAssignment] = useState<User | null>(null);
  
  // Approval functions
  const handleApproveUser = async (userId: string) => {
    console.log('🔥 APPROVE BUTTON CLICKED FOR USER:', userId);
    try {
      console.log('Attempting to approve user via admin API:', userId);
      
      // Get current user's session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No authentication token available');
      }

      // Call the admin API to approve the user
      const response = await fetch('/api/admin/approve-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId: userId,
          action: 'approve'
        })
      });

      const result = await response.json();
      console.log('API response:', result);

      if (!response.ok) {
        throw new Error(result.error || 'Failed to approve user');
      }

      console.log('User approved successfully:', result.user);
      toast.success('Usuario aprobado correctamente');
      // Refresh users list
      fetchUsers();
    } catch (error: any) {
      console.error('Unexpected approval error:', error);
      toast.error('Error al aprobar usuario: ' + error.message);
    }
  };

  const handleRejectUser = async (userId: string) => {
    try {
      console.log('Attempting to reject user via admin API:', userId);
      
      // Get current user's session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No authentication token available');
      }

      // Call the admin API to reject the user
      const response = await fetch('/api/admin/approve-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId: userId,
          action: 'reject'
        })
      });

      const result = await response.json();
      console.log('Reject API response:', result);

      if (!response.ok) {
        throw new Error(result.error || 'Failed to reject user');
      }

      console.log('User rejected successfully:', result.user);
      toast.success('Usuario rechazado');
      // Refresh users list
      fetchUsers();
    } catch (error: any) {
      console.error('Unexpected rejection error:', error);
      toast.error('Error al rechazar usuario: ' + error.message);
    }
  };

  useEffect(() => {
    const checkAdminAndFetchUsers = async () => {
      // Check if current user is admin
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }

      setCurrentUser(session.user);

      // Check admin status from both metadata and profile
      const { data: userData } = await supabase.auth.getUser();
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role, avatar_url')
        .eq('id', session.user.id)
        .single();

      const adminRole = userData?.user?.user_metadata?.role === 'admin' || profileData?.role === 'admin';
      
      if (!adminRole) {
        router.push('/dashboard');
        return;
      }

      setIsAdmin(true);

      // Set avatar URL if available
      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      } else {
        // Generate fallback avatar
        const fallbackAvatar = 'https://ui-avatars.com/api/?name=' + 
          encodeURIComponent(session.user.email?.split('@')[0] || 'User') + 
          '&background=00365b&color=fdb933&size=128';
        setAvatarUrl(fallbackAvatar);
      }

      // Fetch all users with roles and assignments
      await fetchUsers();

      setLoading(false);
    };

    checkAdminAndFetchUsers();
  }, [router]);

  const fetchUsers = async () => {
    try {
      // First get all users
      const { data: usersData, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, role, school, created_at, approval_status')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching users:', error);
        toast.error('Error al cargar usuarios');
        return;
      }

      // Then get roles and assignments for each user
      const usersWithRolesAndAssignments = await Promise.all(
        (usersData || []).map(async (user) => {
          // Get user roles
          const userRoles = await getUserRoles(user.id);
          
          // Get consultant assignments (where user is the consultant)
          const { data: consultantAssignments } = await supabase
            .from('consultant_assignments')
            .select(`
              *,
              student:student_id(id, first_name, last_name, email)
            `)
            .eq('consultant_id', user.id)
            .eq('is_active', true);

          // Get student assignments (where user is the student)
          const { data: studentAssignments } = await supabase
            .from('consultant_assignments')
            .select(`
              *,
              consultant:consultant_id(id, first_name, last_name, email)
            `)
            .eq('student_id', user.id)
            .eq('is_active', true);

          return {
            ...user,
            user_roles: userRoles,
            consultant_assignments: consultantAssignments || [],
            student_assignments: studentAssignments || []
          };
        })
      );

      setUsers(usersWithRolesAndAssignments);
    } catch (error) {
      console.error('Unexpected error fetching users:', error);
      toast.error('Error inesperado al cargar usuarios');
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      // Get current user's session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No authentication token available');
      }

      // Call the admin API to update the role
      const response = await fetch('/api/admin/update-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId,
          newRole
        })
      });

      let result;
      const responseText = await response.text();
      
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', responseText);
        throw new Error(`Invalid response from server: ${responseText.substring(0, 100)}...`);
      }

      if (!response.ok) {
        throw new Error(result.error || `Server error: ${response.status}`);
      }

      // Update local state
      setUsers(users.map(user => 
        user.id === userId ? { ...user, role: newRole } : user
      ));

      toast.success(`Rol actualizado a ${newRole}`, {
        duration: 3000,
        position: 'top-right',
        style: {
          background: '#10B981',
          color: 'white',
        },
        icon: '✅',
      });
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error(`Error al actualizar rol: ${error.message}`, {
        duration: 5000,
        position: 'top-right',
        style: {
          background: '#EF4444',
          color: 'white',
        },
        icon: '❌',
      });
    }
  };

  const handleDeleteClick = (userId: string, userEmail: string) => {
    setUserToDelete({ id: userId, email: userEmail });
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    try {
      // Get current user's session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No authentication token available');
      }

      // Call the admin API to delete the user
      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId: userToDelete.id
        })
      });

      let result;
      const responseText = await response.text();
      
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', responseText);
        throw new Error(`Invalid response from server: ${responseText.substring(0, 100)}...`);
      }

      if (!response.ok) {
        throw new Error(result.error || `Server error: ${response.status}`);
      }

      // Update local state
      setUsers(users.filter(user => user.id !== userToDelete.id));
      setShowDeleteModal(false);
      setUserToDelete(null);
      
      // Show success toast
      toast.success('Usuario eliminado correctamente', {
        duration: 4000,
        position: 'top-right',
        style: {
          background: '#10B981',
          color: 'white',
        },
        icon: '🗑️',
      });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error(`Error al eliminar usuario: ${error.message}`, {
        duration: 5000,
        position: 'top-right',
        style: {
          background: '#EF4444',
          color: 'white',
        },
        icon: '❌',
      });
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUserEmail.trim() || !newUserPassword.trim()) {
      toast.error('Email y contraseña son obligatorios', {
        duration: 4000,
        position: 'top-right',
        style: {
          background: '#EF4444',
          color: 'white',
        },
        icon: '⚠️',
      });
      return;
    }

    setIsCreating(true);
    try {
      // Create user with Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: {
          data: {
            role: newUserRole
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email: newUserEmail,
            first_name: newUserFirstName,
            last_name: newUserLastName,
            role: newUserRole
          });

        if (profileError) throw profileError;

        // Add to local state
        const newUser: User = {
          id: data.user.id,
          email: newUserEmail,
          first_name: newUserFirstName,
          last_name: newUserLastName,
          role: newUserRole,
          school: '',
          created_at: new Date().toISOString(),
          approval_status: 'approved' // Admin-created users are auto-approved
        };

        setUsers([newUser, ...users]);
        
        // Reset form
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserFirstName('');
        setNewUserLastName('');
        setNewUserRole('docente');
        setShowAddForm(false);
        
        toast.success('Usuario creado correctamente', {
          duration: 4000,
          position: 'top-right',
          style: {
            background: '#10B981',
            color: 'white',
          },
          icon: '👤',
        });
      }
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error(`Error al crear usuario: ${error.message}`, {
        duration: 5000,
        position: 'top-right',
        style: {
          background: '#EF4444',
          color: 'white',
        },
        icon: '❌',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // Clear remember me preferences on logout
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  if (loading) {
    return (
      <MainLayout 
        user={currentUser} 
        currentPage="users"
        pageTitle="Gestión de Usuarios"
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00365b] mx-auto"></div>
            <p className="mt-4 text-[#00365b] font-medium">Cargando usuarios...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin) {
    return (
      <MainLayout 
        user={currentUser} 
        currentPage="users"
        pageTitle="Acceso Denegado"
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Acceso Denegado</h3>
            <p className="text-red-600">Solo administradores pueden acceder a la gestión de usuarios.</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <>
      <MainLayout 
        user={currentUser} 
        currentPage="users"
        pageTitle="Gestión de Usuarios"
        breadcrumbs={[{label: 'Usuarios'}]}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white p-6 rounded-lg shadow-lg">
          
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-[#00365b] mb-2">
                Gestión de Usuarios
              </h1>
              <p className="text-gray-600">
                Administra los roles de los usuarios del sistema
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-[#00365b] hover:bg-[#fdb933] hover:text-[#00365b] text-white px-4 py-2 rounded-md flex items-center gap-2 transition"
            >
              <Plus size={20} />
              Agregar Usuario
            </button>
          </div>

          {/* Approval Tabs */}
          <div className="mb-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('pending')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'pending'
                    ? 'border-yellow-500 text-yellow-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Pendientes de Aprobación ({users.filter(u => u.approval_status === 'pending').length})
              </button>
              <button
                onClick={() => setActiveTab('approved')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'approved'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Usuarios Aprobados ({users.filter(u => u.approval_status === 'approved').length})
              </button>
              <button
                onClick={() => setActiveTab('all')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'all'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Todos los Usuarios ({users.length})
              </button>
            </nav>
          </div>

          {/* Add User Form */}
          {showAddForm && (
            <div className="mb-6 bg-gray-50 p-6 rounded-lg border">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-[#00365b]">Crear Nuevo Usuario</h3>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                    placeholder="usuario@ejemplo.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña *
                  </label>
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={newUserFirstName}
                    onChange={(e) => setNewUserFirstName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                    placeholder="Nombre"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Apellido
                  </label>
                  <input
                    type="text"
                    value={newUserLastName}
                    onChange={(e) => setNewUserLastName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                    placeholder="Apellido"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rol
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                  >
                    <option value="docente">Docente</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-4 py-2 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b] disabled:opacity-50 transition"
                  >
                    {isCreating ? 'Creando...' : 'Crear Usuario'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-[#00365b] font-semibold">Nombre</th>
                  <th className="px-4 py-2 text-left text-[#00365b] font-semibold">Email</th>
                  <th className="px-4 py-2 text-left text-[#00365b] font-semibold">Escuela</th>
                  <th className="px-4 py-2 text-left text-[#00365b] font-semibold">Estado</th>
                  <th className="px-4 py-2 text-left text-[#00365b] font-semibold">Rol</th>
                  {activeTab !== 'pending' && (
                    <th className="px-4 py-2 text-left text-[#00365b] font-semibold">Asignaciones</th>
                  )}
                  {activeTab !== 'pending' && (
                    <th className="px-4 py-2 text-left text-[#00365b] font-semibold">Cambiar Rol</th>
                  )}
                  <th className="px-4 py-2 text-left text-[#00365b] font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users
                  .filter(user => {
                    if (activeTab === 'pending') return user.approval_status === 'pending';
                    if (activeTab === 'approved') return user.approval_status === 'approved';
                    return true; // 'all' tab shows everyone
                  })
                  .map((user) => (
                  <tr key={user.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {user.first_name && user.last_name 
                        ? `${user.first_name} ${user.last_name}`
                        : 'Sin nombre'
                      }
                    </td>
                    <td className="px-4 py-3">{user.email || 'Sin email'}</td>
                    <td className="px-4 py-3">{user.school || 'Sin escuela'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.approval_status === 'pending' 
                          ? 'bg-yellow-100 text-yellow-800' 
                          : user.approval_status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {user.approval_status === 'pending' ? 'Pendiente' : 
                         user.approval_status === 'approved' ? 'Aprobado' : 'Rechazado'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.user_roles && user.user_roles.length > 0 ? (
                          user.user_roles.map((userRole, index) => (
                            <span 
                              key={`${userRole.id}-${index}`}
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                userRole.role_type === 'admin'
                                  ? 'bg-red-100 text-red-800'
                                  : userRole.role_type === 'lider_comunidad'
                                  ? 'bg-purple-100 text-purple-800'
                                  : userRole.role_type === 'lider_generacion'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : userRole.role_type === 'equipo_directivo'
                                  ? 'bg-orange-100 text-orange-800'
                                  : userRole.role_type === 'consultor'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                              title={`${ROLE_NAMES[userRole.role_type] || userRole.role_type}${userRole.school?.name ? ` - ${userRole.school.name}` : ''}${userRole.generation?.name ? ` - ${userRole.generation.name}` : ''}${userRole.community?.name ? ` - ${userRole.community.name}` : ''}`}
                            >
                              {ROLE_NAMES[userRole.role_type] || userRole.role_type}
                            </span>
                          ))
                        ) : user.role ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800" title="Rol heredado del sistema anterior">
                            {user.role === 'admin' ? 'Administrador' : user.role === 'docente' ? 'Docente' : user.role}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                            Sin roles asignados
                          </span>
                        )}
                      </div>
                    </td>
                    {activeTab !== 'pending' && (
                      <td className="px-4 py-3">
                        <div className="flex flex-col space-y-1">
                          {/* Show consultant assignments (as consultant) */}
                          {user.consultant_assignments && user.consultant_assignments.length > 0 && (
                            <div className="text-xs">
                              <span className="text-gray-600">Como consultor:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {user.consultant_assignments.slice(0, 2).map((assignment: any, index: number) => (
                                  <span 
                                    key={index}
                                    className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs"
                                    title={`${assignment.assignment_type} - Estudiante: ${assignment.student?.first_name || 'Sin nombre'} ${assignment.student?.last_name || ''}`}
                                  >
                                    {assignment.assignment_type === 'monitoring' ? 'Monitoreo' : 
                                     assignment.assignment_type === 'mentoring' ? 'Mentoría' :
                                     assignment.assignment_type === 'evaluation' ? 'Evaluación' :
                                     assignment.assignment_type === 'support' ? 'Apoyo' :
                                     assignment.assignment_type}
                                  </span>
                                ))}
                                {user.consultant_assignments.length > 2 && (
                                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                                    +{user.consultant_assignments.length - 2}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {/* Show student assignments (as student) */}
                          {user.student_assignments && user.student_assignments.length > 0 && (
                            <div className="text-xs">
                              <span className="text-gray-600">Como estudiante:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {user.student_assignments.slice(0, 2).map((assignment: any, index: number) => (
                                  <span 
                                    key={index}
                                    className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                                    title={`${assignment.assignment_type} - Consultor: ${assignment.consultant?.first_name || 'Sin nombre'} ${assignment.consultant?.last_name || ''}`}
                                  >
                                    {assignment.assignment_type === 'monitoring' ? 'Monitoreo' : 
                                     assignment.assignment_type === 'mentoring' ? 'Mentoría' :
                                     assignment.assignment_type === 'evaluation' ? 'Evaluación' :
                                     assignment.assignment_type === 'support' ? 'Apoyo' :
                                     assignment.assignment_type}
                                  </span>
                                ))}
                                {user.student_assignments.length > 2 && (
                                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                                    +{user.student_assignments.length - 2}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {/* Show assign button for docentes */}
                          {(user.role === 'docente' || user.role === 'teacher') && (
                            <button
                              onClick={() => handleOpenConsultantModal(user)}
                              className="flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 transition-colors"
                              title="Asignar consultor"
                            >
                              <Plus size={12} className="mr-1" />
                              Asignar
                            </button>
                          )}
                          
                          {/* Show no assignments message */}
                          {(!user.consultant_assignments || user.consultant_assignments.length === 0) && 
                           (!user.student_assignments || user.student_assignments.length === 0) && (
                            <span className="text-xs text-gray-500">Sin asignaciones</span>
                          )}
                        </div>
                      </td>
                    )}
                    {activeTab !== 'pending' && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleOpenRoleModal(user)}
                          className="flex items-center px-3 py-1 bg-[#fdb933] text-white rounded text-sm hover:bg-[#e6a530] transition-colors"
                          title="Gestionar roles"
                        >
                          <Settings size={14} className="mr-1" />
                          Gestionar Roles
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {user.approval_status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApproveUser(user.id)}
                              className="text-green-600 hover:text-green-800 p-1 rounded transition"
                              title="Aprobar usuario"
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button
                              onClick={() => handleRejectUser(user.id)}
                              className="text-red-600 hover:text-red-800 p-1 rounded transition"
                              title="Rechazar usuario"
                            >
                              <X size={16} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDeleteClick(user.id, user.email)}
                          className="text-red-600 hover:text-red-800 p-1 rounded transition"
                          title="Eliminar usuario"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No se encontraron usuarios</p>
            </div>
          )}

        </div>
      </div>
      
      {/* Role Assignment Modal */}
      {showRoleModal && selectedUser && (
        <RoleAssignmentModal
          isOpen={showRoleModal}
          onClose={handleCloseRoleModal}
          userId={selectedUser.id}
          userName={selectedUser.name}
          userEmail={selectedUser.email}
          currentUserId={currentUser?.id || ''}
          onRoleUpdate={handleRoleUpdate}
        />
      )}

      {/* Consultant Assignment Modal */}
      {showConsultantModal && selectedUserForAssignment && (
        <ConsultantAssignmentModal
          isOpen={showConsultantModal}
          onClose={handleCloseConsultantModal}
          onAssignmentCreated={handleConsultantAssignmentCreated}
          editingAssignment={{
            student_id: selectedUserForAssignment.id,
            student: {
              id: selectedUserForAssignment.id,
              first_name: selectedUserForAssignment.first_name,
              last_name: selectedUserForAssignment.last_name,
              email: selectedUserForAssignment.email
            }
          }}
        />
      )}
      </MainLayout>
      
      {/* Delete Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Confirmar Eliminación
                </h3>
              </div>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600">
                ¿Estás seguro de que quieres eliminar al usuario{' '}
                <span className="font-semibold text-gray-900">{userToDelete.email}</span>?
              </p>
              <p className="text-sm text-red-600 mt-2">
                Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setUserToDelete(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition flex items-center gap-2"
              >
                <Trash2 size={16} />
                Eliminar Usuario
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}