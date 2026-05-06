import React, { useState, useEffect, useCallback } from 'react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { Users, ArrowRight, Plus, Pencil, Trash2 } from 'lucide-react';
import MainLayout from '../../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { createServiceRoleClient } from '../../../lib/api-auth';

interface SchoolLite {
  id: number;
  name: string;
}

interface CommunityRow {
  id: string;
  name: string;
  generation_id: string | null;
  max_teachers: number | null;
  description: string | null;
  member_count: number;
}

interface DeleteBlocker {
  kind: string;
  count: number;
}

const BLOCKER_LABELS: Record<string, string> = {
  members_or_leaders: 'Miembros / líderes activos',
  sessions: 'Sesiones de consultoría',
  consultant_assignments: 'Asignaciones de consultores',
  workspaces: 'Espacios de trabajo de la comunidad',
  group_assignments: 'Grupos de asignaciones',
  assignment_instances: 'Tareas asignadas',
  submission_shares: 'Entregas compartidas',
  legacy_profile_refs: 'Referencias en perfiles (legado)',
};

interface SchoolMeta {
  id: number;
  has_generations: boolean;
}

interface GenerationOption {
  id: string;
  name: string;
}

const MAX_TEACHERS_DEFAULT = 16;
const MAX_TEACHERS_MIN = 2;
const MAX_TEACHERS_MAX = 16;
const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;

type PageProps =
  | { role: 'admin'; schoolId: null }
  | { role: 'equipo_directivo'; schoolId: number };

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
  if (isAdmin) {
    return { props: { role: 'admin' as const, schoolId: null } };
  }

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

  return { props: { role: 'equipo_directivo' as const, schoolId } };
};

const GrowthCommunitiesIndexPage: React.FC<PageProps> = ({ role, schoolId }) => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<User | null>(null);
  const [schools, setSchools] = useState<SchoolLite[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(
    role === 'equipo_directivo' ? String(schoolId) : ''
  );
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedSchool, setSelectedSchool] = useState<SchoolMeta | null>(null);
  const [generations, setGenerations] = useState<GenerationOption[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formName, setFormName] = useState('');
  const [formGenerationId, setFormGenerationId] = useState('');
  const [formMaxTeachers, setFormMaxTeachers] = useState<string>(String(MAX_TEACHERS_DEFAULT));
  const [formDescription, setFormDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editTarget, setEditTarget] = useState<CommunityRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editGenerationId, setEditGenerationId] = useState('');
  const [editMaxTeachers, setEditMaxTeachers] = useState<string>(String(MAX_TEACHERS_DEFAULT));
  const [editDescription, setEditDescription] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CommunityRow | null>(null);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deleteBlockers, setDeleteBlockers] = useState<DeleteBlocker[] | null>(null);
  const [deleteDeletable, setDeleteDeletable] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    })();
  }, [supabase]);

  const fetchSchools = useCallback(async () => {
    const { data, error } = await supabase
      .from('schools')
      .select('id, name')
      .order('name');
    if (error) {
      toast.error('Error al cargar colegios');
      return;
    }
    setSchools((data ?? []) as SchoolLite[]);
  }, [supabase]);

  const fetchCommunities = useCallback(
    async (schoolId: string) => {
      if (!schoolId) {
        setCommunities([]);
        return;
      }
      setLoading(true);
      try {
        const { data: comms, error } = await supabase
          .from('growth_communities')
          .select('id, name, generation_id, max_teachers, description')
          .eq('school_id', schoolId)
          .order('name');

        if (error) {
          toast.error('Error al cargar comunidades');
          setCommunities([]);
          return;
        }

        type RawCommunity = {
          id: string;
          name: string;
          generation_id: string | null;
          max_teachers: number | null;
          description: string | null;
        };
        const raw = (comms ?? []) as RawCommunity[];

        // One grouped query instead of N per-community count queries.
        const countByCommunity = new Map<string, number>();
        if (raw.length > 0) {
          const { data: memberRows, error: countError } = await supabase
            .from('user_roles')
            .select('community_id')
            .in(
              'community_id',
              raw.map((c) => c.id)
            )
            .eq('is_active', true);
          if (countError) {
            toast.error('Error al cargar miembros');
          } else {
            for (const row of (memberRows ?? []) as Array<{
              community_id: string | null;
            }>) {
              if (row.community_id) {
                countByCommunity.set(
                  row.community_id,
                  (countByCommunity.get(row.community_id) ?? 0) + 1
                );
              }
            }
          }
        }

        const enriched: CommunityRow[] = raw.map((c) => ({
          id: c.id,
          name: c.name,
          generation_id: c.generation_id,
          max_teachers: c.max_teachers,
          description: c.description,
          member_count: countByCommunity.get(c.id) ?? 0,
        }));
        setCommunities(enriched);
      } catch {
        toast.error('Error de red al cargar comunidades');
        setCommunities([]);
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  useEffect(() => {
    fetchCommunities(selectedSchoolId);
  }, [selectedSchoolId, fetchCommunities]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedSchoolId) {
      setSelectedSchool(null);
      setGenerations([]);
      return;
    }
    (async () => {
      const schoolIdNum = Number(selectedSchoolId);
      const [{ data: schoolRow, error: schoolErr }, { data: genRows, error: genErr }] =
        await Promise.all([
          supabase
            .from('schools')
            .select('id, has_generations')
            .eq('id', schoolIdNum)
            .single(),
          supabase
            .from('generations')
            .select('id, name')
            .eq('school_id', schoolIdNum)
            .order('name'),
        ]);
      if (cancelled) return;
      if (schoolErr || !schoolRow) {
        setSelectedSchool(null);
      } else {
        const row = schoolRow as { id: number; has_generations: boolean | null };
        setSelectedSchool({ id: row.id, has_generations: row.has_generations === true });
      }
      if (genErr) {
        setGenerations([]);
      } else {
        setGenerations((genRows ?? []) as GenerationOption[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSchoolId, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const openCreateModal = () => {
    setFormName('');
    setFormGenerationId('');
    setFormMaxTeachers(String(MAX_TEACHERS_DEFAULT));
    setFormDescription('');
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    if (submitting) return;
    setShowCreateModal(false);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!selectedSchoolId) {
      toast.error('Selecciona un colegio');
      return;
    }

    const trimmedName = formName.trim();
    if (trimmedName.length < 1 || trimmedName.length > NAME_MAX) {
      toast.error(`El nombre debe tener entre 1 y ${NAME_MAX} caracteres.`);
      return;
    }

    const requiresGeneration = selectedSchool?.has_generations === true;
    if (requiresGeneration && !formGenerationId) {
      toast.error('Esta escuela utiliza generaciones; debes seleccionar una.');
      return;
    }

    const parsedMax = Number(formMaxTeachers);
    if (
      !Number.isInteger(parsedMax) ||
      parsedMax < MAX_TEACHERS_MIN ||
      parsedMax > MAX_TEACHERS_MAX
    ) {
      toast.error(`La capacidad debe ser un número entero entre ${MAX_TEACHERS_MIN} y ${MAX_TEACHERS_MAX}.`);
      return;
    }

    if (formDescription.length > DESCRIPTION_MAX) {
      toast.error(`La descripción debe tener máximo ${DESCRIPTION_MAX} caracteres.`);
      return;
    }

    const body: Record<string, unknown> = {
      name: trimmedName,
      school_id: Number(selectedSchoolId),
      max_teachers: parsedMax,
    };
    if (requiresGeneration && formGenerationId) {
      body.generation_id = formGenerationId;
    }
    if (formDescription.trim().length > 0) {
      body.description = formDescription;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/growth-communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 201) {
        toast.success('Comunidad creada correctamente.');
        setShowCreateModal(false);
        await fetchCommunities(selectedSchoolId);
        return;
      }

      let payload: { error?: string; message?: string } = {};
      try {
        payload = await res.json();
      } catch {
        // ignore
      }

      if (payload.error === 'duplicate_name') {
        toast.error('Ya existe una comunidad con ese nombre.');
      } else if (payload.error === 'generation_required') {
        toast.error('Esta escuela utiliza generaciones; debes seleccionar una.');
      } else {
        toast.error(payload.message ?? payload.error ?? 'Error al crear la comunidad');
      }
    } catch {
      toast.error('Error de red al crear la comunidad');
    } finally {
      setSubmitting(false);
    }
  };

  const canCreate = Boolean(selectedSchoolId);
  const showGenerationField = selectedSchool?.has_generations === true;

  const openEditModal = (community: CommunityRow) => {
    setEditTarget(community);
    setEditName(community.name);
    setEditGenerationId(community.generation_id ?? '');
    setEditMaxTeachers(
      community.max_teachers != null
        ? String(community.max_teachers)
        : String(MAX_TEACHERS_DEFAULT),
    );
    setEditDescription(community.description ?? '');
  };

  const closeEditModal = () => {
    if (editSubmitting) return;
    setEditTarget(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editSubmitting || !editTarget) return;

    const trimmedName = editName.trim();
    if (trimmedName.length < 1 || trimmedName.length > NAME_MAX) {
      toast.error(`El nombre debe tener entre 1 y ${NAME_MAX} caracteres.`);
      return;
    }

    const requiresGeneration = selectedSchool?.has_generations === true;
    if (requiresGeneration && !editGenerationId) {
      toast.error('Esta escuela utiliza generaciones; debes seleccionar una.');
      return;
    }

    const parsedMax = Number(editMaxTeachers);
    if (
      !Number.isInteger(parsedMax) ||
      parsedMax < MAX_TEACHERS_MIN ||
      parsedMax > MAX_TEACHERS_MAX
    ) {
      toast.error(
        `La capacidad debe ser un número entero entre ${MAX_TEACHERS_MIN} y ${MAX_TEACHERS_MAX}.`,
      );
      return;
    }

    if (editDescription.length > DESCRIPTION_MAX) {
      toast.error(`La descripción debe tener máximo ${DESCRIPTION_MAX} caracteres.`);
      return;
    }

    const body: Record<string, unknown> = {};
    if (trimmedName !== editTarget.name) body.name = trimmedName;
    if (parsedMax !== editTarget.max_teachers) body.max_teachers = parsedMax;

    const normalizedDescription = editDescription.length === 0 ? null : editDescription;
    if (normalizedDescription !== (editTarget.description ?? null)) {
      body.description = normalizedDescription;
    }

    if (showGenerationField) {
      const normalizedGeneration = editGenerationId === '' ? null : editGenerationId;
      if (normalizedGeneration !== editTarget.generation_id) {
        body.generation_id = normalizedGeneration;
      }
    }

    if (Object.keys(body).length === 0) {
      toast.error('No hay cambios para guardar.');
      return;
    }

    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/admin/growth-communities/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 200) {
        toast.success('Comunidad actualizada.');
        setEditTarget(null);
        await fetchCommunities(selectedSchoolId);
        return;
      }

      let payload: {
        error?: string;
        message?: string;
        conflicting_member_count?: number;
      } = {};
      try {
        payload = await res.json();
      } catch {
        // ignore
      }

      if (payload.error === 'school_id_immutable') {
        console.log('school_id_immutable returned by PATCH; UI should never send school_id', payload);
        toast.error(payload.message ?? 'Error al actualizar la comunidad');
      } else if (payload.error === 'members_have_other_generation') {
        toast.error(
          `Algunos miembros pertenecen a otra generación. No se puede cambiar la generación. (Conflictos: ${payload.conflicting_member_count ?? 0})`,
        );
      } else if (payload.error === 'duplicate_name') {
        toast.error('Ya existe una comunidad con ese nombre.');
      } else if (payload.error === 'generation_invalid') {
        toast.error('La generación seleccionada no es válida para esta escuela.');
      } else if (payload.error === 'generation_required') {
        toast.error('Esta escuela utiliza generaciones; debes seleccionar una.');
      } else {
        toast.error(payload.message ?? payload.error ?? 'Error al actualizar la comunidad');
      }
    } catch {
      toast.error('Error de red al actualizar la comunidad');
    } finally {
      setEditSubmitting(false);
    }
  };

  const openDeleteModal = async (community: CommunityRow) => {
    setDeleteTarget(community);
    setDeleteBlockers(null);
    setDeleteDeletable(false);
    setDeletePreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/growth-communities/${community.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      let payload: {
        deletable?: boolean;
        error?: string;
        blockers?: DeleteBlocker[];
        message?: string;
      } = {};
      try {
        payload = await res.json();
      } catch {
        // ignore
      }
      if (res.status === 200 && payload.deletable === true) {
        setDeleteDeletable(true);
        setDeleteBlockers([]);
      } else if (res.status === 409 && payload.error === 'has_dependencies') {
        setDeleteDeletable(false);
        setDeleteBlockers(payload.blockers ?? []);
      } else {
        toast.error(payload.message ?? payload.error ?? 'Error al cargar la comunidad');
        setDeleteTarget(null);
      }
    } catch {
      toast.error('Error de red al cargar la comunidad');
      setDeleteTarget(null);
    } finally {
      setDeletePreviewLoading(false);
    }
  };

  const closeDeleteModal = () => {
    if (deleteSubmitting) return;
    setDeleteTarget(null);
    setDeleteBlockers(null);
    setDeleteDeletable(false);
  };

  const handleDeleteConfirm = async () => {
    if (deleteSubmitting || !deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`/api/admin/growth-communities/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      let payload: {
        deleted?: boolean;
        error?: string;
        blockers?: DeleteBlocker[];
        message?: string;
      } = {};
      try {
        payload = await res.json();
      } catch {
        // ignore
      }
      if (res.status === 200 && payload.deleted === true) {
        toast.success('Comunidad eliminada');
        setDeleteTarget(null);
        setDeleteBlockers(null);
        setDeleteDeletable(false);
        await fetchCommunities(selectedSchoolId);
      } else if (res.status === 409 && payload.error === 'has_dependencies') {
        setDeleteDeletable(false);
        setDeleteBlockers(payload.blockers ?? []);
      } else {
        toast.error('Error al eliminar la comunidad.');
      }
    } catch {
      toast.error('Error al eliminar la comunidad.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

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
        title="Comunidades de crecimiento"
        subtitle="Gestiona los miembros de cada comunidad"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {role === 'admin' && (
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1">
                <label
                  htmlFor="filter-school"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Colegio
                </label>
                <select
                  id="filter-school"
                  value={selectedSchoolId}
                  onChange={(e) => setSelectedSchoolId(e.target.value)}
                  className="w-full sm:w-96 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent bg-white"
                >
                  <option value="">Selecciona un colegio</option>
                  {schools.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:self-end">
                <button
                  type="button"
                  onClick={openCreateModal}
                  disabled={!canCreate}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white bg-brand_primary hover:bg-brand_primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Crear comunidad
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-gray-700">
              {selectedSchoolId
                ? `${communities.length} comunidad(es)`
                : 'Selecciona un colegio para ver sus comunidades'}
            </span>
            {role === 'equipo_directivo' && (
              <button
                type="button"
                onClick={openCreateModal}
                disabled={!canCreate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white bg-brand_primary hover:bg-brand_primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-4 w-4" />
                Crear comunidad
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                    Nombre
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                    ID
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                    Generación
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                    Capacidad
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-700">
                    Miembros
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-gray-700">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!selectedSchoolId ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      —
                    </td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      Cargando...
                    </td>
                  </tr>
                ) : communities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      Este colegio no tiene comunidades
                    </td>
                  </tr>
                ) : (
                  communities.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-900">{c.name}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.id}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                        {c.generation_id ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {c.max_teachers ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {c.member_count}
                        {c.max_teachers != null ? ` / ${c.max_teachers}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            aria-label="Editar comunidad"
                            title="Editar comunidad"
                            className="inline-flex items-center justify-center p-1.5 rounded-md text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <Link
                            href={`/admin/growth-communities/${c.id}/members`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-brand_primary bg-brand_accent/30 hover:bg-brand_accent/50 transition-colors"
                          >
                            Gestionar miembros
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => openDeleteModal(c)}
                            aria-label="Eliminar comunidad"
                            title="Eliminar comunidad"
                            className="inline-flex items-center justify-center p-1.5 rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-community-title"
        >
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleCreateSubmit}>
              <div className="px-5 py-4 border-b border-gray-100">
                <h2
                  id="create-community-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  Crear comunidad
                </h2>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div>
                  <label
                    htmlFor="cc-name"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="cc-name"
                    type="text"
                    required
                    minLength={1}
                    maxLength={NAME_MAX}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  />
                </div>

                {showGenerationField && (
                  <div>
                    <label
                      htmlFor="cc-generation"
                      className="block text-xs font-medium text-gray-600 mb-1"
                    >
                      Generación <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="cc-generation"
                      required
                      value={formGenerationId}
                      onChange={(e) => setFormGenerationId(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent bg-white"
                    >
                      <option value="">Selecciona una generación</option>
                      {generations.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="cc-max"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Capacidad máxima
                  </label>
                  <input
                    id="cc-max"
                    type="number"
                    min={MAX_TEACHERS_MIN}
                    max={MAX_TEACHERS_MAX}
                    step={1}
                    value={formMaxTeachers}
                    onChange={(e) => setFormMaxTeachers(e.target.value)}
                    className="w-full sm:w-40 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Entre {MAX_TEACHERS_MIN} y {MAX_TEACHERS_MAX} (por defecto {MAX_TEACHERS_DEFAULT}).
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="cc-description"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Descripción
                  </label>
                  <textarea
                    id="cc-description"
                    rows={3}
                    maxLength={DESCRIPTION_MAX}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {formDescription.length} / {DESCRIPTION_MAX}
                  </p>
                </div>
              </div>

              <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={submitting}
                  className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3 py-2 rounded-md text-sm font-medium text-white bg-brand_primary hover:bg-brand_primary/90 disabled:bg-gray-300 transition-colors"
                >
                  {submitting ? 'Creando...' : 'Crear comunidad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-community-title"
        >
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleEditSubmit}>
              <div className="px-5 py-4 border-b border-gray-100">
                <h2
                  id="edit-community-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  Editar comunidad
                </h2>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div>
                  <label
                    htmlFor="ec-name"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="ec-name"
                    type="text"
                    required
                    minLength={1}
                    maxLength={NAME_MAX}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  />
                </div>

                {showGenerationField && (
                  <div>
                    <label
                      htmlFor="ec-generation"
                      className="block text-xs font-medium text-gray-600 mb-1"
                    >
                      Generación <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="ec-generation"
                      required
                      value={editGenerationId}
                      onChange={(e) => setEditGenerationId(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent bg-white"
                    >
                      <option value="">Selecciona una generación</option>
                      {generations.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="ec-max"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Capacidad máxima
                  </label>
                  <input
                    id="ec-max"
                    type="number"
                    min={MAX_TEACHERS_MIN}
                    max={MAX_TEACHERS_MAX}
                    step={1}
                    value={editMaxTeachers}
                    onChange={(e) => setEditMaxTeachers(e.target.value)}
                    className="w-full sm:w-40 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Entre {MAX_TEACHERS_MIN} y {MAX_TEACHERS_MAX} (por defecto {MAX_TEACHERS_DEFAULT}).
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="ec-description"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Descripción
                  </label>
                  <textarea
                    id="ec-description"
                    rows={3}
                    maxLength={DESCRIPTION_MAX}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {editDescription.length} / {DESCRIPTION_MAX}
                  </p>
                </div>
              </div>

              <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={editSubmitting}
                  className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-3 py-2 rounded-md text-sm font-medium text-white bg-brand_primary hover:bg-brand_primary/90 disabled:bg-gray-300 transition-colors"
                >
                  {editSubmitting ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-community-title"
        >
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2
                id="delete-community-title"
                className="text-lg font-semibold text-gray-900"
              >
                Eliminar comunidad
              </h2>
              <p className="mt-1 text-sm text-gray-600">{deleteTarget.name}</p>
            </div>

            <div className="px-5 py-4 space-y-3">
              {deletePreviewLoading ? (
                <p className="text-sm text-gray-500">Comprobando dependencias...</p>
              ) : deleteDeletable ? (
                <p className="text-sm text-gray-700">
                  Esta comunidad no tiene miembros ni dependencias. ¿Confirmas la eliminación?
                </p>
              ) : deleteBlockers && deleteBlockers.length > 0 ? (
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    No se puede eliminar esta comunidad. Debes resolver primero:
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-700 list-disc list-inside">
                    {deleteBlockers.map((b) => (
                      <li key={b.kind}>
                        {(BLOCKER_LABELS[b.kind] ?? b.kind)}: {b.count}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-gray-500">—</p>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              {!deletePreviewLoading && deleteDeletable ? (
                <>
                  <button
                    type="button"
                    onClick={closeDeleteModal}
                    disabled={deleteSubmitting}
                    className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteConfirm}
                    disabled={deleteSubmitting}
                    className="px-3 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-300 transition-colors"
                  >
                    {deleteSubmitting ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default GrowthCommunitiesIndexPage;
