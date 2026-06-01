import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Users,
  XCircle,
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../components/layout/FunctionalPageHeader';
import EnhancedTable from '../../components/reports/EnhancedTable';
import { createServiceRoleClient } from '../../lib/api-auth';
import { ReportExporter } from '../../lib/exportUtils';
import {
  TRACTOR_ROLE_LABELS,
  TRACTOR_STATUS_LABELS,
  TractorSignupRole,
  TractorSignupStatus,
} from '../../lib/tractorSignups';
import { isGlobalAdmin } from '../../utils/roleUtils';

interface SchoolOption {
  id: number;
  name: string;
}

interface ExistingRole {
  role_type: string;
  school_id: number | null;
}

interface TractorSignup {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  school_id: number;
  school_name: string;
  birth_date: string;
  profession: string;
  role: TractorSignupRole;
  role_label: string;
  status: TractorSignupStatus;
  status_label: string;
  created_at: string;
  updated_at: string | null;
  granted_at: string | null;
  is_existing_user: boolean;
  existing_user_id: string | null;
  existing_name: string | null;
  existing_email: string | null;
  existing_status: string | null;
  existing_roles: ExistingRole[];
}

type ExistingFilter = 'all' | 'existing' | 'new';

const ROLE_LABEL_BY_TYPE: Record<string, string> = {
  admin: 'Admin',
  consultor: 'Consultor',
  equipo_directivo: 'Equipo Directivo',
  lider_generacion: 'Líder Generación',
  lider_comunidad: 'Líder Comunidad',
  community_manager: 'Community Manager',
  docente: 'Docente',
  supervisor_de_red: 'Supervisor de Red',
  encargado_licitacion: 'Encargado Licitación',
};

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const supabase = createPagesServerClient(ctx);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  const service = createServiceRoleClient();
  const isAdmin = await isGlobalAdmin(service, session.user.id);
  if (!isAdmin) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }

  return { props: {} };
};

export default function TractorSignupsAdminPage() {
  const [rows, setRows] = useState<TractorSignup[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [schoolId, setSchoolId] = useState('all');
  const [role, setRole] = useState<'all' | TractorSignupRole>('all');
  const [status, setStatus] = useState<'all' | TractorSignupStatus>('all');
  const [existingFilter, setExistingFilter] = useState<ExistingFilter>('all');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/tractor-signups');
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || 'Error al cargar registros');
      }
      setRows(json.signups ?? []);
      setSchools(json.schools ?? []);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Error al cargar registros';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (normalizedSearch) {
        const haystack = [
          row.full_name,
          row.email,
          row.school_name,
          row.profession,
          row.existing_name ?? '',
          row.existing_email ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }

      if (schoolId !== 'all' && String(row.school_id) !== schoolId) return false;
      if (role !== 'all' && row.role !== role) return false;
      if (status !== 'all' && row.status !== status) return false;
      if (existingFilter === 'existing' && !row.is_existing_user) return false;
      if (existingFilter === 'new' && row.is_existing_user) return false;

      return true;
    });
  }, [rows, search, schoolId, role, status, existingFilter]);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      pending: rows.filter((row) => row.status === 'pending').length,
      granted: rows.filter((row) => row.status === 'granted').length,
      existing: rows.filter((row) => row.is_existing_user).length,
    };
  }, [rows]);

  const handleGrant = async (row: TractorSignup) => {
    const confirmed = window.confirm(
      `Otorgar acceso a ${row.full_name || row.email} como ${row.role_label}?`
    );
    if (!confirmed) return;

    setActioningId(row.id);
    try {
      const response = await fetch('/api/admin/tractor-signups/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupId: row.id, action: 'grant' }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || 'No se pudo otorgar acceso');
      }

      if (json.email?.error) {
        toast.success('Acceso otorgado. Revisa el envío de correo.');
      } else {
        toast.success('Acceso otorgado');
      }
      await fetchRows();
    } catch (grantError) {
      toast.error(grantError instanceof Error ? grantError.message : 'Error al otorgar acceso');
    } finally {
      setActioningId(null);
    }
  };

  const handleDismiss = async (row: TractorSignup) => {
    const confirmed = window.confirm(`Descartar el registro de ${row.full_name || row.email}?`);
    if (!confirmed) return;

    setActioningId(row.id);
    try {
      const response = await fetch('/api/admin/tractor-signups/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupId: row.id, action: 'dismiss' }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || 'No se pudo descartar el registro');
      }

      toast.success('Registro descartado');
      await fetchRows();
    } catch (dismissError) {
      toast.error(dismissError instanceof Error ? dismissError.message : 'Error al descartar registro');
    } finally {
      setActioningId(null);
    }
  };

  const exportRows = () => {
    return filteredRows.map((row) => ({
      Nombre: row.full_name,
      Email: row.email,
      Colegio: row.school_name,
      Rol: row.role_label,
      'Fecha nacimiento': formatDate(row.birth_date),
      Profesión: row.profession,
      Estado: row.status_label,
      'Ya es usuario': row.is_existing_user ? 'Sí' : 'No',
      'Roles existentes': formatExistingRoles(row.existing_roles),
      'Fecha registro': formatDateTime(row.created_at),
      'Fecha otorgado': row.granted_at ? formatDateTime(row.granted_at) : '',
    }));
  };

  const handleExport = (type: 'csv' | 'excel') => {
    const data = exportRows();
    const headers = Object.keys(data[0] ?? {
      Nombre: '',
      Email: '',
      Colegio: '',
      Rol: '',
      'Fecha nacimiento': '',
      Profesión: '',
      Estado: '',
      'Ya es usuario': '',
      'Roles existentes': '',
      'Fecha registro': '',
      'Fecha otorgado': '',
    });

    const exportData = {
      filename: `lideres-tractor-${new Date().toISOString().slice(0, 10)}`,
      title: 'Líderes de la Generación Tractor',
      headers,
      data,
      metadata: { totalRecords: data.length },
    };

    if (type === 'csv') {
      ReportExporter.exportToCSV(exportData);
    } else {
      ReportExporter.exportToExcel(exportData);
    }
  };

  const columns = [
    {
      key: 'full_name',
      label: 'Nombre',
      render: (_: unknown, row: TractorSignup) => (
        <div>
          <div className="font-medium text-gray-900">{row.full_name}</div>
          <div className="text-xs text-gray-500">{row.email}</div>
        </div>
      ),
    },
    {
      key: 'school_name',
      label: 'Colegio',
      render: (value: string) => <span className="text-sm text-gray-800">{value}</span>,
    },
    {
      key: 'role_label',
      label: 'Rol',
      render: (value: string) => <Badge tone="blue">{value}</Badge>,
    },
    {
      key: 'birth_date',
      label: 'Nacimiento',
      render: (value: string) => <span className="text-sm text-gray-700">{formatDate(value)}</span>,
    },
    {
      key: 'profession',
      label: 'Profesión',
      render: (value: string) => <span className="text-sm text-gray-700">{value}</span>,
    },
    {
      key: 'created_at',
      label: 'Registro',
      render: (value: string) => <span className="text-sm text-gray-700">{formatDateTime(value)}</span>,
    },
    {
      key: 'is_existing_user',
      label: '¿Ya es usuario?',
      render: (_: unknown, row: TractorSignup) =>
        row.is_existing_user ? (
          <div className="space-y-1">
            <Badge tone="green">Sí</Badge>
            <div className="max-w-[180px] text-xs text-gray-500">
              {formatExistingRoles(row.existing_roles) || 'Sin roles activos'}
            </div>
          </div>
        ) : (
          <Badge tone="gray">No</Badge>
        ),
    },
    {
      key: 'status_label',
      label: 'Estado',
      render: (_: unknown, row: TractorSignup) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      label: 'Acciones',
      sortable: false,
      render: (_: unknown, row: TractorSignup) => (
        <div className="flex min-w-[154px] items-center gap-2">
          <button
            type="button"
            onClick={() => handleGrant(row)}
            disabled={row.status === 'granted' || actioningId === row.id}
            title="Otorgar acceso"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-green-200 bg-green-50 text-green-700 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
          >
            {actioningId === row.id ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleDismiss(row)}
            disabled={row.status !== 'pending' || actioningId === row.id}
            title="Descartar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <MainLayout currentPage="tractor-signups" pageTitle="Líderes Tractor">
      <div className="min-h-screen bg-gray-50">
        <ResponsiveFunctionalPageHeader
          icon={<Users className="h-6 w-6" />}
          title="Líderes Tractor"
          subtitle="Registros públicos de Líderes de la Generación Tractor"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchRows}
              disabled={loading}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              title="Actualizar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleExport('csv')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50"
              title="Exportar CSV"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleExport('excel')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50"
              title="Exportar Excel"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </ResponsiveFunctionalPageHeader>

        <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Total" value={stats.total} />
            <StatCard label="Pendientes" value={stats.pending} />
            <StatCard label="Accesos otorgados" value={stats.granted} />
            <StatCard label="Ya eran usuarios" value={stats.existing} />
          </div>

          <div className="border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Filter className="h-4 w-4" aria-hidden="true" />
              Filtros
            </div>
            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar nombre, email o profesión"
                  className={filterClassName + ' pl-9'}
                />
              </div>

              <select value={schoolId} onChange={(event) => setSchoolId(event.target.value)} className={filterClassName}>
                <option value="all">Todos los colegios</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>

              <select value={role} onChange={(event) => setRole(event.target.value as 'all' | TractorSignupRole)} className={filterClassName}>
                <option value="all">Todos los roles</option>
                {(Object.keys(TRACTOR_ROLE_LABELS) as TractorSignupRole[]).map((roleKey) => (
                  <option key={roleKey} value={roleKey}>
                    {TRACTOR_ROLE_LABELS[roleKey]}
                  </option>
                ))}
              </select>

              <select value={status} onChange={(event) => setStatus(event.target.value as 'all' | TractorSignupStatus)} className={filterClassName}>
                <option value="all">Todos los estados</option>
                {(Object.keys(TRACTOR_STATUS_LABELS) as TractorSignupStatus[]).map((statusKey) => (
                  <option key={statusKey} value={statusKey}>
                    {TRACTOR_STATUS_LABELS[statusKey]}
                  </option>
                ))}
              </select>

              <select value={existingFilter} onChange={(event) => setExistingFilter(event.target.value as ExistingFilter)} className={filterClassName}>
                <option value="all">Todos</option>
                <option value="existing">Ya es usuario</option>
                <option value="new">Nuevo usuario</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center border border-gray-200 bg-white">
              <div className="flex items-center gap-3 text-gray-600">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Cargando registros
              </div>
            </div>
          ) : (
            <EnhancedTable
              data={filteredRows}
              columns={columns}
              searchable={false}
              pageSize={25}
              className="shadow-sm"
            />
          )}
        </div>
      </div>
    </MainLayout>
  );
}

const filterClassName =
  'min-h-[40px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#fbbf24]/70';

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[#0a0a0a]">{value}</div>
    </div>
  );
}

function Badge({ tone, children }: { tone: 'green' | 'gray' | 'blue'; children: React.ReactNode }) {
  const classes = {
    green: 'bg-green-50 text-green-700 border-green-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
    blue: 'bg-sky-50 text-sky-700 border-sky-200',
  };

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${classes[tone]}`}>
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: TractorSignupStatus }) {
  const classes: Record<TractorSignupStatus, string> = {
    pending: 'border-amber-200 bg-amber-50 text-amber-800',
    granted: 'border-green-200 bg-green-50 text-green-700',
    dismissed: 'border-gray-200 bg-gray-50 text-gray-700',
  };

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${classes[status]}`}>
      {TRACTOR_STATUS_LABELS[status]}
    </span>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-CL');
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatExistingRoles(roles: ExistingRole[]): string {
  return roles
    .map((role) => ROLE_LABEL_BY_TYPE[role.role_type] ?? role.role_type)
    .filter(Boolean)
    .join(', ');
}
