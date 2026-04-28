import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import {
  Users,
  Search,
  Lock,
  Trash2,
  ChevronUp,
  ChevronDown,
  TriangleAlert,
  Info,
  UserPlus,
  X,
} from 'lucide-react';
import MainLayout from '../../../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../../../components/layout/FunctionalPageHeader';
import { createServiceRoleClient } from '../../../../lib/api-auth';

interface CommunityProps {
  id: string;
  name: string;
  school_name: string;
}

interface ProfileLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface RoleLite {
  id: string;
  user_id: string;
  role_type: string;
  school_id: number | string | null;
  generation_id: string | null;
  community_id: string | null;
  is_active: boolean;
}

interface MembersResponse {
  community: {
    id: string;
    name: string;
    school_id: number | string;
    generation_id: string | null;
    max_teachers: number | null;
  };
  currentMembers: Array<{ user_id: string; profile: ProfileLite | null; role: RoleLite }>;
  eligibleUsers: {
    unassigned: Array<{
      user_id: string;
      profile: ProfileLite | null;
      chosen_role: RoleLite;
    }>;
    reassignFrom: Array<{
      user_id: string;
      profile: ProfileLite | null;
      chosen_role: RoleLite;
      from_community_id: string;
      from_community_name: string | null;
    }>;
  };
  excludedSummary: {
    is_leader: number;
    generation_mismatch: number;
  };
}

export const getServerSideProps: GetServerSideProps<{ community: CommunityProps }> = async (
  ctx
) => {
  const supabase = createPagesServerClient(ctx);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  const service = createServiceRoleClient();
  const { data: adminRow } = await service
    .from('user_roles')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('role_type', 'admin')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!adminRow) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }

  const rawId = ctx.params?.id;
  const communityId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!communityId || typeof communityId !== 'string') {
    return { notFound: true };
  }

  const { data: community } = await service
    .from('growth_communities')
    .select('id, name, school:schools(name)')
    .eq('id', communityId)
    .maybeSingle<{ id: string; name: string; school: { name: string } | null }>();

  if (!community) {
    return { notFound: true };
  }

  return {
    props: {
      community: {
        id: community.id,
        name: community.name,
        school_name: community.school?.name ?? '—',
      },
    },
  };
};

function displayName(p: ProfileLite | null): string {
  if (!p) return '—';
  const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  return full || p.email || '—';
}

function matchesSearch(p: ProfileLite | null, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.toLowerCase();
  const email = (p?.email ?? '').toLowerCase();
  return name.includes(needle) || email.includes(needle);
}

const GrowthCommunityMembersPage: React.FC<{ community: CommunityProps }> = ({ community }) => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<User | null>(null);
  const [isAdmin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MembersResponse | null>(null);
  const [search, setSearch] = useState('');
  const [selectedUnassigned, setSelectedUnassigned] = useState<Set<string>>(new Set());
  const [selectedReassign, setSelectedReassign] = useState<Set<string>>(new Set());
  const [reassignOpen, setReassignOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    })();
  }, [supabase]);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/growth-communities/${community.id}/members`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Error al cargar miembros');
        return;
      }
      setData(json as MembersResponse);
    } catch {
      toast.error('Error de red al cargar miembros');
    } finally {
      setLoading(false);
    }
  }, [community.id]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const filteredCurrent = useMemo(
    () => (data?.currentMembers ?? []).filter((m) => matchesSearch(m.profile, search)),
    [data, search]
  );
  const filteredUnassigned = useMemo(
    () => (data?.eligibleUsers.unassigned ?? []).filter((m) => matchesSearch(m.profile, search)),
    [data, search]
  );
  const filteredReassign = useMemo(
    () => (data?.eligibleUsers.reassignFrom ?? []).filter((m) => matchesSearch(m.profile, search)),
    [data, search]
  );

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const totalSelected = selectedUnassigned.size + selectedReassign.size;
  const hasReassignments = selectedReassign.size > 0;

  const handleRemove = async (userId: string) => {
    try {
      const res = await fetch(
        `/api/admin/growth-communities/${community.id}/members?userId=${encodeURIComponent(userId)}`,
        { method: 'DELETE' }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Error al quitar miembro');
        return;
      }
      toast.success('Miembro quitado de la comunidad');
      fetchMembers();
    } catch {
      toast.error('Error de red al quitar miembro');
    }
  };

  const handleConfirmAssign = async () => {
    setConfirmOpen(false);
    if (totalSelected === 0) return;
    setSubmitting(true);
    try {
      const userIds = Array.from(
        new Set([...Array.from(selectedUnassigned), ...Array.from(selectedReassign)])
      );
      const res = await fetch(`/api/admin/growth-communities/${community.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.error === 'exceeds_max') {
          toast.error('La asignación excede la capacidad máxima de la comunidad');
        } else {
          toast.error(json.error ?? 'Error al asignar miembros');
        }
        return;
      }
      const added = Array.isArray(json.added) ? json.added.length : 0;
      const skipped = Array.isArray(json.skipped) ? json.skipped.length : 0;
      if (added > 0) {
        toast.success(
          `${added} usuario(s) asignado(s)${skipped > 0 ? ` — ${skipped} omitido(s)` : ''}`
        );
      } else {
        toast.error(`Ningún usuario asignado${skipped > 0 ? ` — ${skipped} omitido(s)` : ''}`);
      }
      setSelectedUnassigned(new Set());
      setSelectedReassign(new Set());
      fetchMembers();
    } catch {
      toast.error('Error de red al asignar miembros');
    } finally {
      setSubmitting(false);
    }
  };

  const bulkLabel = submitting
    ? 'Asignando...'
    : hasReassignments
      ? selectedUnassigned.size > 0
        ? `Asignar y reasignar ${totalSelected} usuario(s)`
        : `Reasignar ${selectedReassign.size} usuario(s)`
      : `Asignar ${selectedUnassigned.size} usuario(s)`;

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand_primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-brand_primary mb-4">Acceso Denegado</h1>
          <p className="text-gray-600">No tiene permisos para acceder a esta página.</p>
        </div>
      </div>
    );
  }

  const excluded = data?.excludedSummary;
  const excludedTotal = (excluded?.is_leader ?? 0) + (excluded?.generation_mismatch ?? 0);
  const maxTeachers = data?.community.max_teachers ?? null;
  const currentCount = data?.currentMembers.length ?? 0;
  const eligibleCount =
    (data?.eligibleUsers.unassigned.length ?? 0) +
    (data?.eligibleUsers.reassignFrom.length ?? 0);

  return (
    <MainLayout
      user={user}
      currentPage="growth-communities"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
    >
      <ResponsiveFunctionalPageHeader
        icon={<Users />}
        title="Miembros de la comunidad"
        subtitle={`${community.name} — ${community.school_name}`}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-32">
        {/* Community / school / capacity card */}
        <div className="bg-white rounded-lg shadow p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{community.name}</h2>
              <p className="text-sm text-gray-500">{community.school_name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="text-gray-700">
                <span className="font-semibold">{currentCount}</span>
                {maxTeachers != null ? ` / ${maxTeachers}` : ''} miembro(s)
                {maxTeachers != null ? ' (capacidad)' : ' actuales'}
              </div>
              <div className="text-gray-700">
                <span className="font-semibold">{eligibleCount}</span> elegible(s)
              </div>
            </div>
          </div>
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o email"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent"
              aria-label="Buscar usuarios"
            />
          </div>
        </div>

        {/* Current members */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              Miembros actuales ({filteredCurrent.length})
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                    Nombre
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                    Rol
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-gray-700">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCurrent.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No hay miembros que coincidan con la búsqueda
                    </td>
                  </tr>
                ) : (
                  filteredCurrent.map((m) => {
                    const isLeader = m.role.role_type === 'lider_comunidad';
                    return (
                      <tr key={m.user_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-900">{displayName(m.profile)}</td>
                        <td className="px-4 py-3 text-gray-600">{m.profile?.email ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{m.role.role_type}</td>
                        <td className="px-4 py-3 text-right">
                          {isLeader ? (
                            <button
                              type="button"
                              disabled
                              title="No se puede quitar al líder de su comunidad"
                              aria-label="No se puede quitar al líder de su comunidad"
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-gray-400 cursor-not-allowed"
                            >
                              <Lock className="h-3.5 w-3.5" />
                              Quitar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRemove(m.user_id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Quitar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Unassigned eligible */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              Sin asignar ({filteredUnassigned.length})
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={
                        filteredUnassigned.length > 0 &&
                        selectedUnassigned.size === filteredUnassigned.length
                      }
                      onChange={() => {
                        if (selectedUnassigned.size === filteredUnassigned.length) {
                          setSelectedUnassigned(new Set());
                        } else {
                          setSelectedUnassigned(new Set(filteredUnassigned.map((u) => u.user_id)));
                        }
                      }}
                      className="rounded border-gray-300"
                      aria-label="Seleccionar todos los usuarios sin asignar"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                    Nombre
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                    Rol
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUnassigned.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No hay usuarios sin asignar
                    </td>
                  </tr>
                ) : (
                  filteredUnassigned.map((u) => (
                    <tr
                      key={u.user_id}
                      className={`hover:bg-gray-50 transition-colors ${selectedUnassigned.has(u.user_id) ? 'bg-yellow-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedUnassigned.has(u.user_id)}
                          onChange={() =>
                            setSelectedUnassigned((s) => toggle(s, u.user_id))
                          }
                          className="rounded border-gray-300"
                          aria-label={`Seleccionar ${displayName(u.profile)}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-900">{displayName(u.profile)}</td>
                      <td className="px-4 py-3 text-gray-600">{u.profile?.email ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{u.chosen_role.role_type}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reassign from another community (collapsed by default) */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <button
            type="button"
            onClick={() => setReassignOpen((v) => !v)}
            aria-expanded={reassignOpen}
            className="w-full p-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <span className="text-sm font-medium text-gray-700">
              Cambiar de comunidad ({filteredReassign.length})
            </span>
            {reassignOpen ? (
              <ChevronUp className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            )}
          </button>
          {reassignOpen && (
            <>
              <div className="flex items-start gap-3 p-4 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
                <TriangleAlert
                  className="h-5 w-5 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p>
                  Estos usuarios ya pertenecen a otra comunidad. Al asignarlos aquí se{' '}
                  <strong>moverán</strong> y dejarán de ser miembros de su comunidad anterior.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left">
                        <span className="sr-only">Seleccionar</span>
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                        Nombre
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                        Email
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                        Rol
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                        Actualmente en
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredReassign.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                          No hay usuarios para reasignar
                        </td>
                      </tr>
                    ) : (
                      filteredReassign.map((u) => (
                        <tr
                          key={u.user_id}
                          className={`hover:bg-gray-50 transition-colors ${selectedReassign.has(u.user_id) ? 'bg-amber-50' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedReassign.has(u.user_id)}
                              onChange={() =>
                                setSelectedReassign((s) => toggle(s, u.user_id))
                              }
                              className="rounded border-gray-300"
                              aria-label={`Reasignar ${displayName(u.profile)}`}
                            />
                          </td>
                          <td className="px-4 py-3 text-gray-900">{displayName(u.profile)}</td>
                          <td className="px-4 py-3 text-gray-600">{u.profile?.email ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{u.chosen_role.role_type}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {u.from_community_name ?? u.from_community_id}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Excluded users hint */}
        {excludedTotal > 0 && (
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
            <Info className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-medium">
                {excludedTotal} usuario(s) del colegio no aparecen como elegibles
              </p>
              <ul className="mt-1 list-disc list-inside text-blue-700">
                {(excluded?.is_leader ?? 0) > 0 && (
                  <li>
                    {excluded?.is_leader} es líder de otra comunidad y no puede moverse desde aquí
                  </li>
                )}
                {(excluded?.generation_mismatch ?? 0) > 0 && (
                  <li>
                    {excluded?.generation_mismatch} pertenece a una generación distinta a la de
                    esta comunidad
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Sticky bulk action bar */}
        {totalSelected > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-20 bg-brand_primary text-white p-4 shadow-lg">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center gap-4">
              <span className="text-sm font-medium">
                {totalSelected} usuario(s) seleccionado(s)
                {hasReassignments && (
                  <span className="ml-2 text-amber-200">
                    ({selectedReassign.size} reasignación(es))
                  </span>
                )}
              </span>
              <div className="ml-auto flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUnassigned(new Set());
                    setSelectedReassign(new Set());
                  }}
                  className="px-3 py-2 text-sm text-white/70 hover:text-white underline"
                >
                  Deseleccionar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={submitting || totalSelected === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-brand_accent text-brand_primary rounded-md text-sm font-semibold hover:bg-brand_accent_hover transition-colors disabled:opacity-50"
                >
                  <UserPlus className="h-4 w-4" />
                  {bulkLabel}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation modal */}
        {confirmOpen && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="flex items-start justify-between p-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Confirmar asignación</h3>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 text-sm text-gray-700 space-y-2">
                <p>
                  Vas a asignar <strong>{totalSelected}</strong> usuario(s) a{' '}
                  <strong>{community.name}</strong>.
                </p>
                {selectedUnassigned.size > 0 && (
                  <p>· {selectedUnassigned.size} nuevo(s) miembro(s).</p>
                )}
                {selectedReassign.size > 0 && (
                  <p className="text-amber-700">
                    · {selectedReassign.size} se moverá(n) desde otra comunidad.
                  </p>
                )}
              </div>
              <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAssign}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold bg-brand_primary text-white hover:opacity-90 rounded-md disabled:opacity-50"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default GrowthCommunityMembersPage;
