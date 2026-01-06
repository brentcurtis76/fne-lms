import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../../lib/supabase';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';

import MainLayout from '../../components/layout/MainLayout';
import { Trash2, Plus, X, AlertTriangle, CheckCircle, Settings, Users, Key } from 'lucide-react';
import { toast } from 'react-hot-toast';
import RoleAssignmentModal from '../../components/RoleAssignmentModal';
import ConsultantAssignmentModal from '../../components/ConsultantAssignmentModal';
import PasswordResetModal from '../../components/PasswordResetModal';
import UnifiedUserManagement from '../../components/admin/UnifiedUserManagement';
import BulkUserImportModal from '../../components/admin/BulkUserImportModal';
import UserEditModal from '../../components/admin/UserEditModal';
import { getUserPrimaryRole, metadataHasRole } from '../../utils/roleUtils';
import { ROLE_NAMES } from '../../types/roles';

type User = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  school?: string | null;
  created_at?: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  user_roles?: any[];
  consultant_assignments?: any[];
  student_assignments?: any[];
  course_assignments?: any[];
  school_relation?: { id: number; name: string } | null;
  expense_access_enabled?: boolean;
  is_global_admin?: boolean;
};

export default function UserManagement() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const PAGE_SIZE = 25;
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0 });
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
  
  // Add user form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFirstName, setNewUserFirstName] = useState('');
  const [newUserLastName, setNewUserLastName] = useState('');
  const [newUserRole, setNewUserRole] = useState('docente');

  // Password reset modal state
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [userToReset, setUserToReset] = useState<{ id: string; email: string; name: string } | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'approved'>('all');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>('');
  
  // Bulk import modal state
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  
  // Edit user modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  
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
    fetchUsers(currentPage);
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
    fetchUsers(currentPage);
  };
  
  const handleEditUser = (user: User) => {
    setUserToEdit(user);
    setShowEditModal(true);
  };
  
  const handleEditModalClose = () => {
    setShowEditModal(false);
    setUserToEdit(null);
  };
  
  const handleUserUpdated = () => {
    fetchUsers(currentPage);
    setShowEditModal(false);
    setUserToEdit(null);
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
  const [expenseAccessUpdating, setExpenseAccessUpdating] = useState<Record<string, boolean>>({});
  const fetchUsers = useCallback(async (page = 1, overrides?: {
    search?: string;
    status?: 'all' | 'pending' | 'approved';
    schoolId?: string;
    communityId?: string;
  }) => {
    try {
      setLoading(true);

      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: PAGE_SIZE.toString(),
      });

      const searchTerm = overrides?.search ?? appliedSearchQuery;
      const statusFilter = overrides?.status ?? selectedStatus;
      const schoolFilter = overrides?.schoolId ?? selectedSchoolId;
      const communityFilter = overrides?.communityId ?? selectedCommunityId;

      if (searchTerm.trim()) {
        params.append('search', searchTerm.trim());
      }
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (schoolFilter) {
        params.append('schoolId', schoolFilter);
      }
      if (communityFilter) {
        params.append('communityId', communityFilter);
      }

      const response = await fetch(`/api/admin/users?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();

      const fetchedUsers: User[] = data.users || [];
      let expenseAccessMap: Record<string, boolean> = {};

      const { data: expenseAccessData, error: expenseAccessError } = await supabase
        .from('expense_report_access')
        .select('user_id, can_submit');

      if (expenseAccessError) {
        console.error('Error fetching expense report access:', expenseAccessError);
        toast.error('No se pudo cargar el acceso a reportes de gastos');
      } else {
        expenseAccessMap = (expenseAccessData || []).reduce<Record<string, boolean>>((acc, record) => {
          acc[record.user_id] = record.can_submit;
          return acc;
        }, {});
      }

      const usersWithAccess = fetchedUsers.map(user => {
        const isGlobalAdminRole = (user.user_roles || []).some((role: any) => role.role_type === 'admin') || user.role === 'admin';
        return {
          ...user,
          is_global_admin: isGlobalAdminRole,
          expense_access_enabled: isGlobalAdminRole ? true : !!expenseAccessMap[user.id]
        };
      });

      setUsers(usersWithAccess);
      setTotalUsers(data.total || 0);
      setCurrentPage(data.page || page);
      if (data.summary) {
        setSummary({
          total: data.summary.total ?? 0,
          pending: data.summary.pending ?? 0,
          approved: data.summary.approved ?? 0
        });
      }
      if (data.schools) {
        setSchools(data.schools);
      }
    } catch (error) {
      console.error('Unexpected error fetching users:', error);
      toast.error('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, [PAGE_SIZE, appliedSearchQuery, selectedStatus, selectedSchoolId, selectedCommunityId, supabase]);


  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));
  const pageStart = totalUsers === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = totalUsers === 0 ? 0 : pageStart + users.length - 1;

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    fetchUsers(page);
  };

  
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
      fetchUsers(currentPage);
    } catch (error: any) {
      console.error('Unexpected approval error:', error);
      toast.error('Error al aprobar usuario: ' + error.message);
    }
  };

  // Helper function to get primary school from user roles
  const getUserPrimarySchool = (user: any) => {
    // First check if user has roles with schools
    if (user.user_roles && user.user_roles.length > 0) {
      // Find the first role with a school
      const roleWithSchool = user.user_roles.find((role: any) => role.school?.name);
      if (roleWithSchool) {
        return roleWithSchool.school.name;
      }
    }
    
    // Fallback to school_relation if available
    if (user.school_relation?.name) {
      return user.school_relation.name;
    }
    
    // Fallback to old text field
    return user.school || 'Sin escuela';
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
      fetchUsers(currentPage);
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
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      // Get user role from user_roles table
      const userRole = await getUserPrimaryRole(session.user.id);
      const adminRole = metadataHasRole(userData?.user?.user_metadata, 'admin') || userRole === 'admin';
      
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
      await fetchUsers(1);

      setLoading(false);
    };

    checkAdminAndFetchUsers();
  }, [router, fetchUsers]);



  const handleSearchChange = (value: string) => {
    setSearchInput(value);
  };

  const handleSearchSubmit = () => {
    const trimmed = searchInput.trim();
    setAppliedSearchQuery(trimmed);
    setCurrentPage(1);
    fetchUsers(1, { search: trimmed });
  };

  const handleSearchClear = () => {
    if (!searchInput && !appliedSearchQuery) {
      return;
    }
    setSearchInput('');
    setAppliedSearchQuery('');
    setCurrentPage(1);
    fetchUsers(1, { search: '' });
  };

  const handleStatusFilterChange = (value: 'all' | 'pending' | 'approved') => {
    if (selectedStatus === value) {
      return;
    }
    setSelectedStatus(value);
    setCurrentPage(1);
    fetchUsers(1, { status: value });
  };

  const handleSchoolFilterChange = (value: string) => {
    if (selectedSchoolId === value) {
      return;
    }
    setSelectedSchoolId(value);
    // Clear community filter when school changes
    setSelectedCommunityId('');
    setCurrentPage(1);
    fetchUsers(1, { schoolId: value, communityId: '' });
  };

  const handleCommunityFilterChange = (value: string) => {
    if (selectedCommunityId === value) {
      return;
    }
    setSelectedCommunityId(value);
    setCurrentPage(1);
    fetchUsers(1, { communityId: value });
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
      setUsers(prev => prev.map(user =>
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
      fetchUsers(currentPage);
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

  const handleToggleExpenseAccess = async (userId: string, enable: boolean) => {
    try {
      setExpenseAccessUpdating(prev => ({ ...prev, [userId]: true }));

      const note = enable
        ? 'Acceso habilitado desde panel de administración'
        : 'Acceso deshabilitado desde panel de administración';

      const { error } = await supabase
        .from('expense_report_access')
        .upsert(
          {
            user_id: userId,
            can_submit: enable,
            granted_by: currentUser?.id ?? null,
            notes: note
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      setUsers(prev => prev.map(user =>
        user.id === userId
          ? { ...user, expense_access_enabled: enable }
          : user
      ));

      toast.success(enable
        ? 'Acceso a reportes de gastos habilitado'
        : 'Acceso a reportes de gastos deshabilitado');
    } catch (error) {
      console.error('Error updating expense report access:', error);
      toast.error('No se pudo actualizar el acceso a reportes de gastos');
    } finally {
      setExpenseAccessUpdating(prev => {
        const { [userId]: _, ...rest } = prev;
        return rest;
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
      setUsers(prev => prev.filter(user => user.id !== userToDelete.id));
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
      if (users.length <= 1 && currentPage > 1) {
        handlePageChange(currentPage - 1);
      } else {
        fetchUsers(currentPage);
      }

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
    
    // Prevent double submission
    if (isCreating) return;
    
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
      // Get the current user's auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Call the API endpoint to create user with admin privileges
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          firstName: newUserFirstName,
          lastName: newUserLastName,
          role: newUserRole
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create user');
      }

      if (result.success && result.user) {
        // Reset form
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserFirstName('');
        setNewUserLastName('');
        setNewUserRole('docente');
        setShowAddForm(false);
        setCurrentPage(1);
        fetchUsers(1);

        toast.success('Usuario creado correctamente. El usuario deberá cambiar su contraseña en el primer inicio de sesión.', {
          duration: 5000,
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
      
      // Check for specific error types
      let errorMessage = error.message;
      if (error.message?.includes('duplicate key') || error.message?.includes('already registered')) {
        errorMessage = 'Este email ya está registrado en el sistema';
      } else if (error.code === '23505') {
        errorMessage = 'El usuario ya existe';
      }
      
      toast.error(`Error al crear usuario: ${errorMessage}`, {
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

  const handlePasswordReset = async (userId: string, temporaryPassword: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No session found');
    }

    const response = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        userId,
        temporaryPassword
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reset password');
    }

    return response.json();
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
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#0a0a0a] mx-auto"></div>
            <p className="mt-4 text-[#0a0a0a] font-medium">Cargando usuarios...</p>
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
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <UnifiedUserManagement
          users={users}
          summary={summary}
          schools={schools}
          searchQuery={searchInput}
          selectedStatus={selectedStatus}
          selectedSchoolId={selectedSchoolId}
          selectedCommunityId={selectedCommunityId}
          onSearchChange={handleSearchChange}
          onSearchSubmit={handleSearchSubmit}
          onClearSearch={handleSearchClear}
          onStatusChange={handleStatusFilterChange}
          onSchoolChange={handleSchoolFilterChange}
          onCommunityChange={handleCommunityFilterChange}
          isLoading={loading}
          onApprove={handleApproveUser}
          onReject={handleRejectUser}
          onDelete={(user) => handleDeleteClick(user.id, user.email)}
          onRoleChange={(user) => handleOpenRoleModal(user)}
          onAssign={(user) => handleOpenConsultantModal(user)}
          onPasswordReset={(user) => {
            setUserToReset({
              id: user.id,
              email: user.email,
              name: user.first_name && user.last_name 
                ? `${user.first_name} ${user.last_name}`
                : 'Sin nombre'
            });
            setShowPasswordResetModal(true);
          }}
          onExpenseAccessToggle={(user, enabled) => handleToggleExpenseAccess(user.id, enabled)}
          expenseAccessUpdating={expenseAccessUpdating}
          onAddUser={() => setShowAddForm(true)}
          onBulkImport={() => setShowBulkImportModal(true)}
          onEditUser={handleEditUser}
        />
        <div className="flex items-center justify-between mt-6">
          <span className="text-sm text-gray-500">
            {totalUsers === 0 ? 'No hay usuarios para mostrar' : `Mostrando ${pageStart}-${pageEnd} de ${totalUsers} usuarios`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="px-3 py-1 rounded border border-gray-300 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-600">Página {currentPage} de {totalPages}</span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              className="px-3 py-1 rounded border border-gray-300 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          </div>
        </div>

        
        {/* Add User Form Modal */}
        {showAddForm && (
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-[#0a0a0a]">Crear Nuevo Usuario</h3>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleAddUser} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
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
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
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
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
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
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
                      placeholder="Apellido"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-4 py-2 bg-[#0a0a0a] text-white rounded-md hover:bg-[#1f1f1f] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isCreating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Creando...
                      </>
                    ) : (
                      <>
                        <Plus size={16} />
                        Crear Usuario
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

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

      {/* Password Reset Modal */}
      <PasswordResetModal
        isOpen={showPasswordResetModal}
        onClose={() => {
          setShowPasswordResetModal(false);
          setUserToReset(null);
        }}
        user={userToReset}
        onPasswordReset={handlePasswordReset}
      />

      {/* Bulk User Import Modal */}
      <BulkUserImportModal
        isOpen={showBulkImportModal}
        onClose={() => setShowBulkImportModal(false)}
        onImportComplete={() => {
          setShowBulkImportModal(false);
          fetchUsers(currentPage);
        }}
      />
      
      {/* User Edit Modal */}
      <UserEditModal
        isOpen={showEditModal}
        onClose={handleEditModalClose}
        user={userToEdit}
        onUserUpdated={handleUserUpdated}
      />
    </>
  );
}
