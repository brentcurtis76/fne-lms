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
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface MemberLite extends ProfileLite {
  user_id: string;
  role_type: string;
}

interface MembersResponse {
  community: {
    id: string;
    name: string;
    school_id: number | string;
    school_name: string | null;
    generation_id: string | null;
    max_teachers: number | null;
  };
  currentMembers: Array<MemberLite & { user_roles_id: string }>;
  eligibleUsers: {
    unassigned: MemberLite[];
    reassignFrom: Array<
      MemberLite & {
        current_community_id: string;
        current_community_name: string | null;
      }
    >;
  };
  excludedSummary: {
    count: number;
    reasons: {
      is_leader: number;
      generation_mismatch: number;
    };
  };
}

type PageProps = {
  role: 'admin' | 'equipo_directivo';
  community: CommunityProps;
};

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
    .eq('is_active', true);

  const rows = (roleRows ?? []) as Array<{
    id: number;
    role_type: string;
    school_id: number | string | null;
  }>;

  const isAdmin = rows.some((r) => r.role_type === 'admin');

  let role: 'admin' | 'equipo_directivo' | null = null;
  let edSchoolId: number | null = null;

  if (isAdmin) {
    role = 'admin';
  } else {
    const edRow = rows
      .filter((r) => r.role_type === 'equipo_directivo')
      .sort((a, b) => a.id - b.id)[0];

    if (!edRow || edRow.school_id === null || edRow.school_id === undefined) {
      return { redirect: { destination: '/dashboard', permanent: false } };
    }

    const schoolId =
      typeof edRow.school_id === 'string' ? Number(edRow.school_id) : edRow.school_id;
    if (!Number.isFinite(schoolId)) {
      return { redirect: { destination: '/dashboard', permanent: false } };
    }

    role = 'equipo_directivo';
    edSchoolId = schoolId;
  }

  const rawId = ctx.params?.id;
  const communityId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!communityId || typeof communityId !== 'string') {
    return { notFound: true };
  }

  const { data: community } = await service
    .from('growth_communities')
    .select('id, name, school_id, school:schools(name)')
    .eq('id', communityId)
    .maybeSingle<{
      id: string;
      name: string;
      school_id: number | string | null;
      school: { name: string } | null;
    }>();

  if (!community) {
    return { notFound: true };
  }

  if (role === 'equipo_directivo' && edSchoolId !== null) {
    const communitySchoolId =
      typeof community.school_id === 'number'
        ? community.school_id
        : Number(community.school_id);
    if (!Number.isFinite(communitySchoolId) || communitySchoolId !== edSchoolId) {
      return { redirect: { destination: '/dashboard', permanent: false } };
    }
  }

  return {
    props: {
      role,
      community: {
        id: community.id,
        name: community.name,
        school_name: community.school?.name ?? '—',
      },
    },
  };
};

function displayName(p: ProfileLite): string {
  const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  return full || p.email || '—';
}

function matchesSearch(p: ProfileLite, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase();
  const email = (p.email ?? '').toLowerCase();
  return name.includes(needle) || email.includes(needle);
}

function skippedReasonLabel(reason: string): string {
  switch (reason) {
    case 'no_eligible_role':
      return 'sin rol elegible en este colegio';
    case 'already_in_community':
      return 'ya pertenece a esta comunidad';
    case 'is_leader':
      return 'es líder de comunidad';
    case 'generation_mismatch':
      return 'pertenece a otra generación';
    default:
      return reason;
  }
}

const GrowthCommunityMembersPage: React.FC<PageProps> = ({ role, community }) => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MembersResponse | null>(null);
  const [search, setSearch] = useState('');
  const [selectedUnassigned, setSelectedUnassigned] = useState<Set<string>>(new Set());
  const [selectedReassign, setSelectedReassign] = useState<Set<string>>(new Set());
  const [reassignOpen, setReassignOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [changeLeaderTargetId, setChangeLeaderTargetId] = useState<string | null>(null);
  const [promoteTargetId, setPromoteTargetId] = useState<string | null>(null);
  const [promoteSubmitting, setPromoteSubmitting] = useState(false);
  const [demoteMode, setDemoteMode] = useState<'demote_to_member' | 'remove_from_community'>(
    'demote_to_member'
  );
  const [demoteSubmitting, setDemoteSubmitting] = useState(false);

  useEffect(() => {
    if (changeLeaderTargetId) setDemoteMode('demote_to_member');
  }, [changeLeaderTargetId]);

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

  const leaders = useMemo(
    () => data?.currentMembers?.filter((m) => m.role_type === 'lider_comunidad') ?? [],
    [data]
  );
  const nonLeaderMembers = useMemo(
    () => data?.currentMembers?.filter((m) => m.role_type !== 'lider_comunidad') ?? [],
    [data]
  );
  const filteredCurrent = useMemo(
    () => nonLeaderMembers.filter((m) => matchesSearch(m, search)),
    [nonLeaderMembers, search]
  );
  const filteredUnassigned = useMemo(
    () => (data?.eligibleUsers.unassigned ?? []).filter((m) => matchesSearch(m, search)),
    [data, search]
  );
  const filteredReassign = useMemo(
    () => (data?.eligibleUsers.reassignFrom ?? []).filter((m) => matchesSearch(m, search)),
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
  const selectedUnassignedUsers = useMemo(
    () => (data?.eligibleUsers.unassigned ?? []).filter((u) => selectedUnassigned.has(u.user_id)),
    [data, selectedUnassigned]
  );
  const selectedReassignUsers = useMemo(
    () => (data?.eligibleUsers.reassignFrom ?? []).filter((u) => selectedReassign.has(u.user_id)),
    [data, selectedReassign]
  );

  const allFilteredUnassignedSelected =
    filteredUnassigned.length > 0 &&
    filteredUnassigned.every((u) => selectedUnassigned.has(u.user_id));
  const allFilteredReassignSelected =
    filteredReassign.length > 0 && filteredReassign.every((u) => selectedReassign.has(u.user_id));

  const handleSelectAllUnassigned = () => {
    setSelectedUnassigned((prev) => {
      const next = new Set(prev);
      if (allFilteredUnassignedSelected) {
        filteredUnassigned.forEach((u) => next.delete(u.user_id));
      } else {
        filteredUnassigned.forEach((u) => next.add(u.user_id));
      }
      return next;
    });
  };

  const handleSelectAllReassign = () => {
    setSelectedReassign((prev) => {
      const next = new Set(prev);
      if (allFilteredReassignSelected) {
        filteredReassign.forEach((u) => next.delete(u.user_id));
      } else {
        filteredReassign.forEach((u) => next.add(u.user_id));
      }
      return next;
    });
  };

  const handleRemove = async (userId: string) => {
    if (!window.confirm('¿Quitar este usuario de la comunidad?')) {
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/growth-communities/${community.id}/members?userId=${encodeURIComponent(userId)}`,
        { method: 'DELETE' }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.message ?? json.error ?? 'Error al quitar miembro');
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
          toast.error(
            `La asignación excede la capacidad máxima (${json.currentMemberCount ?? '—'} / ${json.maxTeachers ?? '—'})`
          );
        } else {
          toast.error(json.error ?? 'Error al asignar miembros');
        }
        return;
      }
      const assigned = typeof json.assigned === 'number' ? json.assigned : 0;
      const skipped = Array.isArray(json.skipped) ? json.skipped.length : 0;
      if (assigned > 0) {
        toast.success(
          `${assigned} usuario(s) asignado(s)${skipped > 0 ? `, ${skipped} omitido(s): ${json.skipped.map((s: { reason: string }) => skippedReasonLabel(s.reason)).join(', ')}` : ''}`
        );
      } else {
        toast.error(
          `Ningún usuario asignado${skipped > 0 ? `, ${skipped} omitido(s): ${json.skipped.map((s: { reason: string }) => skippedReasonLabel(s.reason)).join(', ')}` : ''}`
        );
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

  const promoteTarget = useMemo(
    () => nonLeaderMembers.find((m) => m.user_id === promoteTargetId) ?? null,
    [nonLeaderMembers, promoteTargetId]
  );
  const demoteTarget = useMemo(
    () => leaders.find((m) => m.user_id === changeLeaderTargetId) ?? null,
    [leaders, changeLeaderTargetId]
  );

  const handleConfirmPromote = async () => {
    if (!promoteTarget) return;
    setPromoteSubmitting(true);
    try {
      const res = await fetch(`/api/admin/growth-communities/${community.id}/leaders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: promoteTarget.user_id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = json.error as string | undefined;
        const map: Record<string, string> = {
          already_leader: 'Este usuario ya es líder de esta comunidad.',
          no_eligible_role_in_school: 'El usuario no tiene un rol activo en este colegio.',
          generation_mismatch: 'El usuario pertenece a una generación distinta.',
          invalid_user_id: 'Identificador de usuario inválido.',
        };
        toast.error(
          (code && map[code]) ?? json.message ?? json.error ?? 'Error al promover a líder'
        );
        return;
      }
      toast.success(`${displayName(promoteTarget)} ahora es líder de la comunidad.`);
      setPromoteTargetId(null);
      fetchMembers();
    } catch {
      toast.error('Error de red al promover a líder');
    } finally {
      setPromoteSubmitting(false);
    }
  };

  const handleConfirmDemote = async () => {
    if (!demoteTarget) return;
    setDemoteSubmitting(true);
    try {
      const res = await fetch(`/api/admin/growth-communities/${community.id}/leaders`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: demoteTarget.user_id, mode: demoteMode }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = json.error as string | undefined;
        const map: Record<string, string> = {
          no_eligible_role_to_demote_to:
            "Este usuario no tiene otro rol en este colegio. Usa 'Quitar de esta comunidad' en su lugar.",
          generation_mismatch_on_demote:
            'El usuario pertenece a otra generación; no se puede mantener como miembro.',
          chosen_row_in_other_community:
            "El otro rol del usuario ya pertenece a otra comunidad. Reasigna ese rol primero o usa 'Quitar de esta comunidad'.",
          compensation_failed: 'Error inconsistente al cambiar líder. Contacta a soporte.',
        };
        toast.error(
          (code && map[code]) ?? json.message ?? json.error ?? 'Error al cambiar líder'
        );
        return;
      }
      toast.success(
        demoteMode === 'demote_to_member'
          ? 'Líder convertido en miembro'
          : 'Líder removido de la comunidad'
      );
      setChangeLeaderTargetId(null);
      fetchMembers();
    } catch {
      toast.error('Error de red al cambiar líder');
    } finally {
      setDemoteSubmitting(false);
    }
  };

  const bulkLabel = submitting
    ? 'Asignando...'
    : hasReassignments
      ? selectedUnassigned.size > 0
        ? `Asignar ${selectedUnassigned.size} nuevo(s) y reasignar ${selectedReassign.size}`
        : `Reasignar ${selectedReassign.size} usuario(s)`
      : `Asignar ${selectedUnassigned.size} usuario(s)`;

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand_primary"></div>
      </div>
    );
  }

  const excluded = data?.excludedSummary;
  const excludedTotal = excluded?.count ?? 0;
  const maxTeachers = data?.community.max_teachers ?? null;
  const currentCount = data?.currentMembers.length ?? 0;
  const schoolName = data?.community.school_name ?? community.school_name;
  const eligibleCount =
    (data?.eligibleUsers.unassigned.length ?? 0) +
    (data?.eligibleUsers.reassignFrom.length ?? 0);

  return (
    <MainLayout
      user={user}
      currentPage="growth-communities"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={role === 'admin'}
      onLogout={handleLogout}
    >
      <ResponsiveFunctionalPageHeader
        icon={<Users />}
        title="Miembros de la comunidad"
        subtitle={`${community.name} — ${schoolName}`}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-32">
        {/* Community / school / capacity card */}
        <div className="bg-white rounded-lg shadow p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{community.name}</h2>
              <p className="text-sm text-gray-500">{schoolName}</p>
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

        {/* Leaders */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              Líderes de la comunidad ({leaders.length})
            </span>
          </div>
          {leaders.length === 0 ? (
            <div className="flex items-start gap-3 p-4 bg-blue-50 text-blue-800 text-sm">
              <Info className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p>Esta comunidad no tiene líderes activos. Promueve un miembro abajo.</p>
            </div>
          ) : (
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
                    <th scope="col" className="px-4 py-3 text-right font-medium text-gray-700">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leaders.map((m) => (
                    <tr key={m.user_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-900">{displayName(m)}</td>
                      <td className="px-4 py-3 text-gray-600">{m.email ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setChangeLeaderTargetId(m.user_id)}
                          aria-pressed={changeLeaderTargetId === m.user_id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-brand_primary bg-brand_accent/40 hover:bg-brand_accent/60 transition-colors"
                        >
                          Cambiar líder
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Current members */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              Miembros actuales (no líderes) ({nonLeaderMembers.length})
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
                  filteredCurrent.map((m) => (
                    <tr key={m.user_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-900">{displayName(m)}</td>
                      <td className="px-4 py-3 text-gray-600">{m.email ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{m.role_type}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setPromoteTargetId(m.user_id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-brand_primary bg-brand_accent/40 hover:bg-brand_accent/60 transition-colors"
                          >
                            Promotear a líder
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemove(m.user_id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Quitar
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

        {/* Unassigned eligible */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              Sin asignar ({filteredUnassigned.length})
            </span>
            <button
              type="button"
              onClick={handleSelectAllUnassigned}
              disabled={filteredUnassigned.length === 0}
              className="text-xs font-medium text-brand_primary hover:underline disabled:text-gray-400 disabled:no-underline"
            >
              {allFilteredUnassignedSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allFilteredUnassignedSelected}
                      onChange={handleSelectAllUnassigned}
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
                          aria-label={`Seleccionar ${displayName(u)}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-900">{displayName(u)}</td>
                      <td className="px-4 py-3 text-gray-600">{u.email ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{u.role_type}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reassign from another community (collapsed by default) */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6 border border-red-100">
          <button
            type="button"
            onClick={() => setReassignOpen((v) => !v)}
            aria-expanded={reassignOpen}
            className="w-full p-4 border-b border-red-100 flex items-center justify-between bg-red-50 hover:bg-red-100 transition-colors"
          >
            <span className="text-sm font-medium text-red-800">
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
              <div className="p-4 border-b border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={handleSelectAllReassign}
                  disabled={filteredReassign.length === 0}
                  className="text-xs font-medium text-red-700 hover:underline disabled:text-gray-400 disabled:no-underline"
                >
                  {allFilteredReassignSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>
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
                              aria-label={`Reasignar ${displayName(u)}`}
                            />
                          </td>
                          <td className="px-4 py-3 text-gray-900">{displayName(u)}</td>
                          <td className="px-4 py-3 text-gray-600">{u.email ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{u.role_type}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {u.current_community_name ?? u.current_community_id}
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
              <details className="mt-1">
                <summary className="cursor-pointer text-blue-700">Ver detalles</summary>
                <ul className="mt-1 list-disc list-inside text-blue-700">
                  {(excluded?.reasons.is_leader ?? 0) > 0 && (
                    <li>
                      {excluded?.reasons.is_leader} es líder de otra comunidad y no puede moverse
                      desde aquí
                    </li>
                  )}
                  {(excluded?.reasons.generation_mismatch ?? 0) > 0 && (
                    <li>
                      {excluded?.reasons.generation_mismatch} pertenece a una generación distinta a
                      la de esta comunidad
                    </li>
                  )}
                </ul>
              </details>
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
                  <div>
                    <p className="font-medium">{selectedUnassigned.size} nuevo(s) miembro(s)</p>
                    <ul className="mt-1 max-h-28 overflow-y-auto list-disc list-inside text-gray-600">
                      {selectedUnassignedUsers.map((u) => (
                        <li key={u.user_id}>{displayName(u)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {selectedReassign.size > 0 && (
                  <div className="text-amber-700">
                    <p className="font-medium">
                      {selectedReassign.size} se moverá(n) desde otra comunidad
                    </p>
                    <ul className="mt-1 max-h-28 overflow-y-auto list-disc list-inside">
                      {selectedReassignUsers.map((u) => (
                        <li key={u.user_id}>
                          {displayName(u)} ({u.current_community_name ?? u.current_community_id})
                        </li>
                      ))}
                    </ul>
                  </div>
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

        {/* Promote to leader modal */}
        {promoteTarget && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="flex items-start justify-between p-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Promover a líder</h3>
                <button
                  type="button"
                  onClick={() => setPromoteTargetId(null)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 text-sm text-gray-700">
                <p>
                  ¿Promover a <strong>{displayName(promoteTarget)}</strong> como líder de esta
                  comunidad?
                </p>
              </div>
              <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPromoteTargetId(null)}
                  disabled={promoteSubmitting}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPromote}
                  disabled={promoteSubmitting}
                  className="px-4 py-2 text-sm font-semibold bg-brand_primary text-white hover:opacity-90 rounded-md disabled:opacity-50"
                >
                  {promoteSubmitting ? 'Promoviendo...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Change leader (demote) modal */}
        {demoteTarget && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="flex items-start justify-between p-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">
                  Cambiar líder: {demoteTarget.first_name ?? ''} {demoteTarget.last_name ?? ''}
                </h3>
                <button
                  type="button"
                  onClick={() => setChangeLeaderTargetId(null)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 text-sm text-gray-700 space-y-3">
                <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="demote_mode"
                    value="demote_to_member"
                    checked={demoteMode === 'demote_to_member'}
                    onChange={() => setDemoteMode('demote_to_member')}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium text-gray-900 block">
                      Convertir en miembro de esta comunidad
                    </span>
                    <span className="text-xs text-gray-600 block mt-1">
                      El usuario perderá su rol de líder pero seguirá siendo miembro de esta
                      comunidad usando su otro rol activo en este colegio.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="demote_mode"
                    value="remove_from_community"
                    checked={demoteMode === 'remove_from_community'}
                    onChange={() => setDemoteMode('remove_from_community')}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium text-gray-900 block">
                      Quitar de esta comunidad
                    </span>
                    <span className="text-xs text-gray-600 block mt-1">
                      El usuario será removido completamente de esta comunidad. Podrá volver a ser
                      asignado a otra comunidad más tarde.
                    </span>
                  </span>
                </label>
              </div>
              <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setChangeLeaderTargetId(null)}
                  disabled={demoteSubmitting}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDemote}
                  disabled={demoteSubmitting}
                  className="px-4 py-2 text-sm font-semibold bg-brand_primary text-white hover:opacity-90 rounded-md disabled:opacity-50"
                >
                  {demoteSubmitting ? 'Aplicando...' : 'Confirmar'}
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
