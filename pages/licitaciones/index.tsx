import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '@/components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { Plus, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { LicitacionEstado, ESTADO_DISPLAY } from '@/types/licitaciones';

interface LicitacionRow {
  id: string;
  numero_licitacion: string;
  nombre_licitacion: string;
  estado: LicitacionEstado;
  year: number;
  created_at: string;
  fecha_publicacion?: string | null;
  schools?: { name: string } | null;
  programa_id?: string;
}

function EstadoBadge({ estado }: { estado: LicitacionEstado }) {
  const info = ESTADO_DISPLAY[estado] || { label: estado, color: 'text-gray-700', bg: 'bg-gray-100' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${info.bg} ${info.color}`}>
      {info.label}
    </span>
  );
}

export default function LicitacionesPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEncargado, setIsEncargado] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [licitaciones, setLicitaciones] = useState<LicitacionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  // Filters
  const [filterEstado, setFilterEstado] = useState('');
  const [filterYear, setFilterYear] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/auth/my-roles');
      const rolesData = await response.json();

      if (!response.ok) {
        toast.error('Error al verificar permisos');
        router.push('/dashboard');
        return;
      }

      const roles: string[] = (rolesData.roles || rolesData.data?.roles || []).map((r: { role_type: string }) => r.role_type);
      const adminAccess = roles.includes('admin');
      const encargadoAccess = roles.includes('encargado_licitacion');

      if (!adminAccess && !encargadoAccess) {
        toast.error('No tiene permisos para acceder a licitaciones');
        router.push('/dashboard');
        return;
      }

      setCurrentUser(user);
      setIsAdmin(adminAccess);
      setIsEncargado(encargadoAccess);
      setUserRole(adminAccess ? 'admin' : 'encargado_licitacion');
    } catch {
      router.push('/login');
    }
  };

  const fetchLicitaciones = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(LIMIT));
      if (filterEstado) params.set('estado', filterEstado);
      if (filterYear) params.set('year', filterYear);

      const res = await fetch(`/api/licitaciones?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Error al cargar licitaciones');
        return;
      }

      setLicitaciones(json.data?.licitaciones || []);
      setTotal(json.data?.total || 0);
    } catch {
      toast.error('Error al cargar licitaciones');
    } finally {
      setLoading(false);
    }
  }, [currentUser, page, filterEstado, filterYear]);

  useEffect(() => {
    if (currentUser) {
      fetchLicitaciones();
    }
  }, [fetchLicitaciones]);

  const totalPages = Math.ceil(total / LIMIT);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 1 + i);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  return (
    <MainLayout
      user={currentUser as Parameters<typeof MainLayout>[0]['user']}
      currentPage="licitaciones"
      pageTitle="Licitaciones"
      isAdmin={isAdmin}
      userRole={userRole}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {isAdmin ? 'Licitaciones' : 'Mis Licitaciones'}
            </h1>
            <p className="text-gray-600 mt-1">
              Procesos de licitacion de servicios ATE bajo Ley SEP
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => router.push('/licitaciones/nueva')}
              className="flex items-center px-4 py-2 bg-yellow-400 text-black rounded-lg hover:bg-yellow-500 transition-colors"
            >
              <Plus size={20} className="mr-2" />
              Nueva Licitacion
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select
                value={filterEstado}
                onChange={e => { setFilterEstado(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              >
                <option value="">Todos los estados</option>
                {(Object.keys(ESTADO_DISPLAY) as LicitacionEstado[]).map(e => (
                  <option key={e} value={e}>{ESTADO_DISPLAY[e].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ano</label>
              <select
                value={filterYear}
                onChange={e => { setFilterYear(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              >
                <option value="">Todos los anos</option>
                {years.map(y => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
          </div>
        ) : licitaciones.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <FileText size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay licitaciones</h3>
            <p className="text-gray-500">
              {isAdmin
                ? 'Crea la primera licitacion con el boton "Nueva Licitacion"'
                : 'No hay licitaciones asignadas a su escuela'}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Numero
                    </th>
                    {isAdmin && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Escuela
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ano
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha Publicacion
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Creado
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {licitaciones.map(lic => (
                    <tr
                      key={lic.id}
                      onClick={() => router.push(`/licitaciones/${lic.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {lic.numero_licitacion}
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {lic.schools?.name || '-'}
                        </td>
                      )}
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                        {lic.nombre_licitacion}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <EstadoBadge estado={lic.estado} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {lic.year}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(lic.fecha_publicacion)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(lic.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 px-2">
                <p className="text-sm text-gray-600">
                  Mostrando {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} de {total}
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    aria-label="Página anterior"
                    className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 hover:bg-gray-50 transition-colors"
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  <span className="text-sm text-gray-700">
                    Pagina {page} de {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    aria-label="Página siguiente"
                    className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 hover:bg-gray-50 transition-colors"
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
