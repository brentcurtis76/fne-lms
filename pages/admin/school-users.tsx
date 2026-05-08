import React, { useCallback, useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import MainLayout from '../../components/layout/MainLayout';
import UnifiedUserManagement from '../../components/admin/UnifiedUserManagement';
import { createServiceRoleClient } from '../../lib/api-auth';

type PageProps =
  | { role: 'admin'; schoolId: null }
  | { role: 'equipo_directivo'; schoolId: number };

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
    return { props: { role: 'admin' as const, schoolId: null } };
  }

  const edRow = rows.find((r) => r.role_type === 'equipo_directivo');

  if (!edRow || edRow.school_id === null || edRow.school_id === undefined) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }

  const schoolId =
    typeof edRow.school_id === 'string' ? Number(edRow.school_id) : edRow.school_id;
  if (!Number.isFinite(schoolId)) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }

  return { props: { role: 'equipo_directivo' as const, schoolId } };
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
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(
    props.role === 'equipo_directivo' ? String(props.schoolId) : ''
  );
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>('');

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
        let expenseAccessMap: Record<string, boolean> = {};

        const { data: expenseAccessData, error: expenseAccessError } = await supabase
          .from('expense_report_access')
          .select('user_id, can_submit');

        if (expenseAccessError) {
          console.error('Error fetching expense report access:', expenseAccessError);
          toast.error('No se pudo cargar el acceso a reportes de gastos');
        } else {
          expenseAccessMap = (expenseAccessData || []).reduce<Record<string, boolean>>(
            (acc, record) => {
              acc[record.user_id] = record.can_submit;
              return acc;
            },
            {}
          );
        }

        const usersWithAccess = fetchedUsers.map((u) => {
          const isGlobalAdminRole =
            (u.user_roles || []).some((r: any) => r.role_type === 'admin') ||
            u.role === 'admin';
          return {
            ...u,
            is_global_admin: isGlobalAdminRole,
            expense_access_enabled: isGlobalAdminRole ? true : !!expenseAccessMap[u.id],
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

  const handleSchoolFilterChange = (value: string) => {
    if (props.role === 'equipo_directivo') return;
    if (selectedSchoolId === value) return;
    setSelectedSchoolId(value);
    setSelectedCommunityId('');
    setCurrentPage(1);
    fetchUsers(1, { schoolId: value, communityId: '' });
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

  const notImplemented = () =>
    toast('Esta acción se habilita en la Fase 13', { icon: 'ℹ️' });

  const schoolName =
    props.role === 'equipo_directivo'
      ? schools.find((s) => String(s.id) === String(props.schoolId))?.name ?? null
      : null;

  return (
    <MainLayout
      user={user}
      currentPage="school-users"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={props.role === 'admin'}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      {props.role === 'equipo_directivo' && (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <h1 className="text-2xl font-semibold text-gray-900">
            Usuarios del colegio{schoolName ? ` — ${schoolName}` : ''}
          </h1>
        </div>
      )}

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
        onApprove={notImplemented}
        onReject={notImplemented}
        onDelete={notImplemented}
        onRoleChange={notImplemented}
        onAssign={notImplemented}
        onPasswordReset={notImplemented}
        onExpenseAccessToggle={notImplemented}
        onAddUser={notImplemented}
        onBulkImport={notImplemented}
        onEditUser={notImplemented}
        hideBulkImport={props.role === 'equipo_directivo' ? true : undefined}
        hideExpenseAccess={props.role === 'equipo_directivo' ? true : undefined}
        lockedSchoolId={props.role === 'equipo_directivo' ? props.schoolId : undefined}
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
    </MainLayout>
  );
};

export default SchoolUsersPage;
