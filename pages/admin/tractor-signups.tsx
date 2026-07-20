import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../components/layout/FunctionalPageHeader';
import EnhancedTable from '../../components/reports/EnhancedTable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { createServiceRoleClient } from '../../lib/api-auth';
import { ReportExporter } from '../../lib/exportUtils';
import {
  SIGNUP_SOURCES,
  SIGNUP_SOURCE_LABELS,
  SignupSource,
  TRACTOR_ROLE_LABELS,
  TRACTOR_STATUS_LABELS,
  TractorSignupRole,
  TractorSignupStatus,
  formatDate,
  formatDateTime,
  formatExistingRoles,
} from '../../lib/tractorSignups';
import { isGlobalAdmin } from '../../utils/roleUtils';
import {
  ExistingUserBadge,
  RoleBadge,
  SourceBadge,
  StatusBadge,
  TractorSignup,
  TractorSignupCard,
} from '../../components/admin/TractorSignupCard';

interface SchoolOption {
  id: number;
  name: string;
}

type ExistingFilter = 'all' | 'existing' | 'new';
type SignupAction = 'grant' | 'dismiss' | 'delete';

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

  const [search, setSearch] = useState('');
  const [schoolId, setSchoolId] = useState('all');
  const [source, setSource] = useState<'all' | SignupSource>('all');
  const [role, setRole] = useState<'all' | TractorSignupRole>('all');
  const [status, setStatus] = useState<'all' | TractorSignupStatus>('all');
  const [existingFilter, setExistingFilter] = useState<ExistingFilter>('all');

  // Manage dialog (detail + actions). `confirmDelete` flips the dialog into its
  // delete-confirmation state; `deleteAccount` toggles tearing down the linked
  // platform account. `pendingAction` drives the per-button spinner.
  const [manageRow, setManageRow] = useState<TractorSignup | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteAccount, setDeleteAccount] = useState(false);
  const [pendingAction, setPendingAction] = useState<SignupAction | null>(null);
  const busy = pendingAction !== null;

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
      if (source !== 'all' && row.source !== source) return false;
      if (role !== 'all' && row.role !== role) return false;
      if (status !== 'all' && row.status !== status) return false;
      if (existingFilter === 'existing' && !row.is_existing_user) return false;
      if (existingFilter === 'new' && row.is_existing_user) return false;

      return true;
    });
  }, [rows, search, schoolId, source, role, status, existingFilter]);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      pending: rows.filter((row) => row.status === 'pending').length,
      granted: rows.filter((row) => row.status === 'granted').length,
      existing: rows.filter((row) => row.is_existing_user).length,
    };
  }, [rows]);

  const openManage = (row: TractorSignup) => {
    setManageRow(row);
    setConfirmDelete(false);
    setDeleteAccount(false);
  };

  const closeManage = () => {
    if (busy) return;
    setManageRow(null);
    setConfirmDelete(false);
    setDeleteAccount(false);
  };

  const runAction = async (action: SignupAction) => {
    if (!manageRow) return;
    setPendingAction(action);
    try {
      const body =
        action === 'delete'
          ? { signupId: manageRow.id, action, deleteAccount }
          : { signupId: manageRow.id, action };

      const response = await fetch('/api/admin/tractor-signups/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || 'No se pudo completar la acción');
      }

      if (action === 'grant') {
        if (json.email?.sent === false || json.email?.fallback || json.email?.error) {
          toast('Acceso otorgado, pero no se envió el correo de invitación');
        } else {
          toast.success('Acceso otorgado');
        }
        // The grant itself succeeded; a generation warning is informational only.
        if (json.generation?.warning) {
          toast(json.generation.warning, { icon: '⚠️' });
        }
      } else if (action === 'dismiss') {
        toast.success('Registro descartado');
      } else {
        toast.success(json.deletedAccount ? 'Usuario y registro eliminados' : 'Registro eliminado');
      }

      setManageRow(null);
      setConfirmDelete(false);
      setDeleteAccount(false);
      await fetchRows();
    } catch (actionError) {
      toast.error(actionError instanceof Error ? actionError.message : 'Error al procesar la acción');
    } finally {
      setPendingAction(null);
    }
  };

  const exportRows = () => {
    return filteredRows.map((row) => ({
      Nombre: row.full_name,
      Email: row.email,
      Origen: row.source_label,
      Colegio: row.school_name,
      Generación: row.generation_name ?? '',
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
    const headers = Object.keys(
      data[0] ?? {
        Nombre: '',
        Email: '',
        Origen: '',
        Colegio: '',
        Generación: '',
        Rol: '',
        'Fecha nacimiento': '',
        Profesión: '',
        Estado: '',
        'Ya es usuario': '',
        'Roles existentes': '',
        'Fecha registro': '',
        'Fecha otorgado': '',
      }
    );

    const exportData = {
      filename: `registros-publicos-${new Date().toISOString().slice(0, 10)}`,
      title: 'Registros públicos',
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
      key: 'source_label',
      label: 'Origen',
      render: (_: unknown, row: TractorSignup) => <SourceBadge source={row.source} />,
    },
    {
      key: 'school_name',
      label: 'Colegio',
      render: (_: unknown, row: TractorSignup) => (
        <div>
          <div className="text-sm text-gray-800">{row.school_name}</div>
          {row.generation_name && (
            <div className="text-xs text-gray-500">{row.generation_name}</div>
          )}
        </div>
      ),
    },
    {
      key: 'role_label',
      label: 'Rol',
      render: (value: string) => <RoleBadge>{value}</RoleBadge>,
    },
    {
      key: 'is_existing_user',
      label: '¿Ya es usuario?',
      render: (_: unknown, row: TractorSignup) => <ExistingUserBadge row={row} />,
    },
    {
      key: 'status_label',
      label: 'Estado',
      render: (_: unknown, row: TractorSignup) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      label: '',
      sortable: false,
      render: (_: unknown, row: TractorSignup) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => openManage(row)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Gestionar
          </button>
        </div>
      ),
    },
  ];

  return (
    <MainLayout currentPage="tractor-signups" pageTitle="Registros">
      <div className="min-h-screen bg-gray-50">
        <ResponsiveFunctionalPageHeader
          icon={<Users className="h-6 w-6" />}
          title="Registros"
          subtitle="Registros públicos de acceso (Líderes Tractor y registro general)"
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr]">
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

              <select
                value={source}
                onChange={(event) => setSource(event.target.value as 'all' | SignupSource)}
                className={filterClassName}
                data-testid="signups-source-filter"
              >
                <option value="all">Todos los orígenes</option>
                {SIGNUP_SOURCES.map((sourceKey) => (
                  <option key={sourceKey} value={sourceKey}>
                    {SIGNUP_SOURCE_LABELS[sourceKey]}
                  </option>
                ))}
              </select>

              <select
                value={role}
                onChange={(event) => setRole(event.target.value as 'all' | TractorSignupRole)}
                className={filterClassName}
              >
                <option value="all">Todos los roles</option>
                {(Object.keys(TRACTOR_ROLE_LABELS) as TractorSignupRole[]).map((roleKey) => (
                  <option key={roleKey} value={roleKey}>
                    {TRACTOR_ROLE_LABELS[roleKey]}
                  </option>
                ))}
              </select>

              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as 'all' | TractorSignupStatus)}
                className={filterClassName}
              >
                <option value="all">Todos los estados</option>
                {(Object.keys(TRACTOR_STATUS_LABELS) as TractorSignupStatus[]).map((statusKey) => (
                  <option key={statusKey} value={statusKey}>
                    {TRACTOR_STATUS_LABELS[statusKey]}
                  </option>
                ))}
              </select>

              <select
                value={existingFilter}
                onChange={(event) => setExistingFilter(event.target.value as ExistingFilter)}
                className={filterClassName}
              >
                <option value="all">Todos</option>
                <option value="existing">Ya es usuario</option>
                <option value="new">Nuevo usuario</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center border border-gray-200 bg-white">
              <div className="flex items-center gap-3 text-gray-600">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Cargando registros
              </div>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 border border-dashed border-gray-300 bg-white px-4 text-center">
              <Users className="h-6 w-6 text-gray-400" aria-hidden="true" />
              <p className="text-sm text-gray-600">No hay registros que coincidan con los filtros.</p>
            </div>
          ) : (
            <>
              {/* Desktop: compact table */}
              <div className="hidden md:block">
                <EnhancedTable
                  data={filteredRows}
                  columns={columns}
                  searchable={false}
                  pageSize={25}
                  className="shadow-sm"
                />
              </div>

              {/* Mobile: cards (no side-scrolling table on small/older hardware) */}
              <div className="space-y-3 md:hidden">
                {filteredRows.map((row) => (
                  <TractorSignupCard key={row.id} row={row} onManage={openManage} busy={busy} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={manageRow !== null}
        onOpenChange={(open) => {
          if (!open) closeManage();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          {manageRow && (
            <>
              <DialogHeader>
                <DialogTitle>{manageRow.full_name || manageRow.email}</DialogTitle>
                <DialogDescription>{manageRow.email}</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Detail label="Origen">
                  <SourceBadge source={manageRow.source} />
                </Detail>
                <Detail label="Generación" value={manageRow.generation_name ?? undefined} />
                <Detail label="Colegio" value={manageRow.school_name} />
                <Detail label="Rol">
                  <RoleBadge>{manageRow.role_label}</RoleBadge>
                </Detail>
                <Detail label="Nacimiento" value={formatDate(manageRow.birth_date)} />
                <Detail label="Profesión" value={manageRow.profession} />
                <Detail label="Registro" value={formatDateTime(manageRow.created_at)} />
                <Detail label="Estado">
                  <StatusBadge status={manageRow.status} />
                </Detail>
                <div className="col-span-2">
                  <Detail label="¿Ya es usuario?">
                    {manageRow.is_existing_user ? (
                      <span className="text-gray-800">
                        Sí — {formatExistingRoles(manageRow.existing_roles) || 'sin roles activos'}
                      </span>
                    ) : (
                      <span className="text-gray-500">No</span>
                    )}
                  </Detail>
                </div>
                {manageRow.granted_at && (
                  <Detail label="Otorgado" value={formatDateTime(manageRow.granted_at)} />
                )}
              </div>

              {!confirmDelete ? (
                <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => runAction('grant')}
                    disabled={busy || manageRow.status === 'granted'}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    {pendingAction === 'grant' ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    Otorgar acceso
                  </button>
                  <button
                    type="button"
                    onClick={() => runAction('dismiss')}
                    disabled={busy || manageRow.status !== 'pending'}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    {pendingAction === 'dismiss' ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                    )}
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Eliminar
                  </button>
                </div>
              ) : (
                <div className="mt-2 border-t border-gray-100 pt-4">
                  <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    <div>
                      Se eliminará este registro de forma permanente.
                      {manageRow.linked_user_id
                        ? ' Marca la casilla para eliminar también la cuenta de la plataforma.'
                        : ''}
                    </div>
                  </div>

                  {manageRow.linked_user_id && (
                    <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={deleteAccount}
                        onChange={(event) => setDeleteAccount(event.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[#0a0a0a] focus:ring-[#fbbf24]"
                      />
                      <span>
                        También eliminar la cuenta de la plataforma (inicio de sesión, perfil y roles).
                        {manageRow.is_existing_user && (
                          <span className="mt-1 block font-medium text-red-700">
                            Esta persona ya tenía una cuenta antes de este registro; se eliminará por completo.
                          </span>
                        )}
                      </span>
                    </label>
                  )}

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={busy}
                      className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => runAction('delete')}
                      disabled={busy}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pendingAction === 'delete' ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      )}
                      {deleteAccount && manageRow.linked_user_id
                        ? 'Eliminar usuario y registro'
                        : 'Eliminar registro'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
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

function Detail({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-gray-800">{children ?? (value || '—')}</div>
    </div>
  );
}
