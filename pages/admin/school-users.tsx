import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Plus, Trash2, X } from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import UnifiedUserManagement from '../../components/admin/UnifiedUserManagement';
import RoleAssignmentModal from '../../components/RoleAssignmentModal';
import PasswordResetModal from '../../components/PasswordResetModal';
import UserEditModal from '../../components/admin/UserEditModal';
import { createServiceRoleClient } from '../../lib/api-auth';
import { ED_ASSIGNABLE_ROLES, ED_CREATE_USER_ROLES } from '../../utils/roleUtils';
import { ROLE_NAMES, type UserRoleType } from '../../types/roles';

type PageProps = { schoolId: number };

type ListUser = {
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

const PAGE_SIZE = 25;

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const supabase = createPagesServerClient(ctx);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  const service = createServiceRoleClient();
  const { data: roleRows } = await service
    .from('user_roles')
    .select('id, role_type, school_id')
    .eq('user_id', session.user.id)
    .eq('is_active', true)
    .order('id', { ascending: true });

  const rows = (roleRows ?? []) as Array<{
    id: number;
    role_type: string;
    school_id: number | string | null;
  }>;

  const isAdmin = rows.some((r) => r.role_type === 'admin');
  if (isAdmin) {
    return { redirect: { destination: '/admin/user-management', permanent: false } };
  }

  // Invariant: a user holds at most one active equipo_directivo row.
  // Verified via prod data audit on 2026-05-11 (no user had >1 active ED row).
  // Fail-closed: if the invariant is violated (manual SQL, role-assignment
  // race), refuse to render rather than silently scope the page to whichever
  // row happens to come first. A DB-level partial unique index is the proper
  // long-term guard but is owned by the DB agent — tracked in PR #19
  // follow-ups as "Partial unique index on user_roles for ED uniqueness".
  const edRows = rows.filter((r) => r.role_type === 'equipo_directivo');
  if (edRows.length > 1) {
    console.error(
      '[school-users] multi-ED invariant violated for user',
      session.user.id,
      'rows:',
      edRows.map((r) => ({ id: r.id, school_id: r.school_id })),
    );
    return { redirect: { destination: '/dashboard', permanent: false } };
  }
  const edRow = edRows[0];

  if (!edRow || edRow.school_id === null || edRow.school_id === undefined) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }

  const schoolId =
    typeof edRow.school_id === 'string' ? Number(edRow.school_id) : edRow.school_id;
  if (!Number.isFinite(schoolId)) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }

  return { props: { schoolId } };
};

const SchoolUsersPage: React.FC<PageProps> = (props) => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<User | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');

  const [users, setUsers] = useState<ListUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0 });
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);

  const [searchInput, setSearchInput] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'approved'>('all');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(String(props.schoolId));
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFirstName, setNewUserFirstName] = useState('');
  const [newUserLastName, setNewUserLastName] = useState('');
  const [newUserRole, setNewUserRole] = useState<string>('docente');
  const [isCreating, setIsCreating] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [userToEdit, setUserToEdit] = useState<ListUser | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: string; email: string } | null>(null);

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; email: string } | null>(null);

  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [userToReset, setUserToReset] = useState<{ id: string; email: string; name: string } | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);

      if (!sessionUser) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', sessionUser.id)
        .single();

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      } else {
        const fallbackAvatar =
          'https://ui-avatars.com/api/?name=' +
          encodeURIComponent(sessionUser.email?.split('@')[0] || 'User') +
          '&background=00365b&color=fdb933&size=128';
        setAvatarUrl(fallbackAvatar);
      }
    })();
  }, [supabase]);

  const fetchUsers = useCallback(
    async (
      page = 1,
      overrides?: {
        search?: string;
        status?: 'all' | 'pending' | 'approved';
        schoolId?: string;
        communityId?: string;
      }
    ) => {
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

        const fetchedUsers: ListUser[] = data.users || [];

        const usersWithAccess = fetchedUsers.map((u) => {
          const isGlobalAdminRole =
            (u.user_roles || []).some((r: any) => r.role_type === 'admin') ||
            u.role === 'admin';
          return {
            ...u,
            is_global_admin: isGlobalAdminRole,
            expense_access_enabled: isGlobalAdminRole,
          };
        });

        setUsers(usersWithAccess);
        setTotalUsers(data.total || 0);
        setCurrentPage(data.page || page);
        if (data.summary) {
          setSummary({
            total: data.summary.total ?? 0,
            pending: data.summary.pending ?? 0,
            approved: data.summary.approved ?? 0,
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
    },
    [appliedSearchQuery, selectedStatus, selectedSchoolId, selectedCommunityId, supabase]
  );

  useEffect(() => {
    fetchUsers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));
  const pageStart = totalUsers === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = totalUsers === 0 ? 0 : pageStart + users.length - 1;

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    fetchUsers(page);
  };

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
    if (!searchInput && !appliedSearchQuery) return;
    setSearchInput('');
    setAppliedSearchQuery('');
    setCurrentPage(1);
    fetchUsers(1, { search: '' });
  };

  const handleStatusFilterChange = (value: 'all' | 'pending' | 'approved') => {
    if (selectedStatus === value) return;
    setSelectedStatus(value);
    setCurrentPage(1);
    fetchUsers(1, { status: value });
  };

  const handleSchoolFilterChange = (_value: string) => {
    // School is locked to the ED user's school; ignore changes.
  };

  const handleCommunityFilterChange = (value: string) => {
    if (selectedCommunityId === value) return;
    setSelectedCommunityId(value);
    setCurrentPage(1);
    fetchUsers(1, { communityId: value });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const noop = () => {};

  const handleOpenRoleModal = (target: ListUser) => {
    const userName =
      target.first_name && target.last_name
        ? `${target.first_name} ${target.last_name}`
        : 'Sin nombre';
    setSelectedUser({ id: target.id, name: userName, email: target.email });
    setShowRoleModal(true);
  };

  const handleCloseRoleModal = () => {
    setShowRoleModal(false);
    setSelectedUser(null);
  };

  const handleRoleUpdate = () => {
    fetchUsers(currentPage);
  };

  const handleEditUser = (target: ListUser) => {
    setUserToEdit(target);
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

  const handleDeleteClick = (userId: string, userEmail: string) => {
    setUserToDelete({ id: userId, email: userEmail });
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: userToDelete.id }),
      });

      const responseText = await response.text();
      let result: any;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(`Invalid response from server: ${responseText.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(result.error || `Server error: ${response.status}`);
      }

      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
      setShowDeleteModal(false);
      setUserToDelete(null);

      toast.success('Usuario eliminado correctamente', {
        duration: 4000,
        position: 'top-right',
        style: { background: '#10B981', color: 'white' },
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
        style: { background: '#EF4444', color: 'white' },
        icon: '❌',
      });
    }
  };

  const handleSubmitNewUser = async (addAnother: boolean) => {
    if (isCreating) return;

    if (!newUserEmail.trim() || !newUserPassword.trim()) {
      toast.error('Email y contraseña son obligatorios', {
        duration: 4000,
        position: 'top-right',
        style: { background: '#EF4444', color: 'white' },
        icon: '⚠️',
      });
      return;
    }

    setIsCreating(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          firstName: newUserFirstName,
          lastName: newUserLastName,
          role: newUserRole,
          schoolId: props.schoolId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create user');
      }

      if (result.success && result.user) {
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserFirstName('');
        setNewUserLastName('');
        setNewUserRole('docente');
        setCurrentPage(1);
        fetchUsers(1);

        if (addAnother) {
          toast.success('Usuario creado. Puedes agregar otro.', {
            duration: 3000,
            position: 'top-right',
            style: { background: '#10B981', color: 'white' },
            icon: '👤',
          });
          emailInputRef.current?.focus();
        } else {
          setShowAddForm(false);
          toast.success(
            'Usuario creado correctamente. El usuario deberá cambiar su contraseña en el primer inicio de sesión.',
            {
              duration: 5000,
              position: 'top-right',
              style: { background: '#10B981', color: 'white' },
              icon: '👤',
            }
          );
        }
      }
    } catch (error: any) {
      console.error('Error creating user:', error);

      let errorMessage = error.message;
      if (
        error.message?.includes('duplicate key') ||
        error.message?.includes('already registered')
      ) {
        errorMessage = 'Este email ya está registrado en el sistema';
      } else if (error.code === '23505') {
        errorMessage = 'El usuario ya existe';
      }

      toast.error(`Error al crear usuario: ${errorMessage}`, {
        duration: 5000,
        position: 'top-right',
        style: { background: '#EF4444', color: 'white' },
        icon: '❌',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handlePasswordReset = async (userId: string, temporaryPassword: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No session found');
    }

    const response = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ userId, temporaryPassword }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reset password');
    }

    return response.json();
  };

  const schoolName =
    schools.find((s) => String(s.id) === String(props.schoolId))?.name ?? null;

  return (
    <>
    <MainLayout
      user={user}
      currentPage="school-users"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={false}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          Usuarios del colegio{schoolName ? ` — ${schoolName}` : ''}
        </h1>
      </div>

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
        onApprove={noop}
        onReject={noop}
        onDelete={(target) => handleDeleteClick(target.id, target.email)}
        onRoleChange={(target) => handleOpenRoleModal(target)}
        onAssign={noop}
        onPasswordReset={(target) => {
          setUserToReset({
            id: target.id,
            email: target.email,
            name:
              target.first_name && target.last_name
                ? `${target.first_name} ${target.last_name}`
                : 'Sin nombre',
          });
          setShowPasswordResetModal(true);
        }}
        onExpenseAccessToggle={noop}
        onAddUser={() => setShowAddForm(true)}
        onBulkImport={noop}
        onEditUser={handleEditUser}
        hideBulkImport
        hideExpenseAccess
        hideApprove
        hideReject
        hideAssign
        lockedSchoolId={props.schoolId}
        hideCommunityFilter
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mt-6">
          <span className="text-sm text-gray-500">
            {totalUsers === 0
              ? 'No hay usuarios para mostrar'
              : `Mostrando ${pageStart}-${pageEnd} de ${totalUsers} usuarios`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="px-3 py-1 rounded border border-gray-300 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-600">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              className="px-3 py-1 rounded border border-gray-300 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmitNewUser(false);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    ref={emailInputRef}
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
                    placeholder="usuario@ejemplo.com"
                    autoFocus
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
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rol
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
                  >
                    {ED_CREATE_USER_ROLES.map((roleType) => (
                      <option key={roleType} value={roleType}>
                        {ROLE_NAMES[roleType as UserRoleType]}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Los roles de Líder de Comunidad y Líder de Generación
                    requieren información adicional y deben asignarse desde la
                    opción &quot;Cambiar Rol&quot; del usuario una vez creado.
                  </p>
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
                  type="button"
                  onClick={() => handleSubmitNewUser(true)}
                  disabled={isCreating}
                  className="px-4 py-2 border border-[#0a0a0a] text-[#0a0a0a] rounded-md hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Plus size={16} />
                  Guardar y agregar otro
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
                      Guardar
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRoleModal && selectedUser && (
        <RoleAssignmentModal
          isOpen={showRoleModal}
          onClose={handleCloseRoleModal}
          userId={selectedUser.id}
          userName={selectedUser.name}
          userEmail={selectedUser.email}
          currentUserId={user?.id || ''}
          onRoleUpdate={handleRoleUpdate}
          allowedRoles={ED_ASSIGNABLE_ROLES}
        />
      )}
    </MainLayout>

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

    <PasswordResetModal
      isOpen={showPasswordResetModal}
      onClose={() => {
        setShowPasswordResetModal(false);
        setUserToReset(null);
      }}
      user={userToReset}
      onPasswordReset={handlePasswordReset}
    />

    <UserEditModal
      isOpen={showEditModal}
      onClose={handleEditModalClose}
      user={userToEdit}
      onUserUpdated={handleUserUpdated}
      disableSchoolEdit
      hideQaTesterToggle
    />
    </>
  );
};

export default SchoolUsersPage;
