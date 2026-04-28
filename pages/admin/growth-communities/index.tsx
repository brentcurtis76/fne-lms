import React, { useState, useEffect, useCallback } from 'react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { Users, ArrowRight } from 'lucide-react';
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
  member_count: number;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
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

  return { props: {} };
};

const GrowthCommunitiesIndexPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<User | null>(null);
  const [schools, setSchools] = useState<SchoolLite[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [loading, setLoading] = useState(false);

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
          .select('id, name, generation_id, max_teachers')
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
        };
        const raw = (comms ?? []) as RawCommunity[];

        const counts = await Promise.all(
          raw.map(async (c) => {
            const { count } = await supabase
              .from('user_roles')
              .select('id', { count: 'exact', head: true })
              .eq('community_id', c.id)
              .eq('is_active', true);
            return count ?? 0;
          })
        );

        const enriched: CommunityRow[] = raw.map((c, i) => ({
          id: c.id,
          name: c.name,
          generation_id: c.generation_id,
          max_teachers: c.max_teachers,
          member_count: counts[i],
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <MainLayout
      user={user}
      currentPage="growth-communities"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={true}
      onLogout={handleLogout}
    >
      <ResponsiveFunctionalPageHeader
        icon={<Users />}
        title="Comunidades de crecimiento"
        subtitle="Gestiona los miembros de cada comunidad"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow p-4 mb-6">
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

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-700">
              {selectedSchoolId
                ? `${communities.length} comunidad(es)`
                : 'Selecciona un colegio para ver sus comunidades'}
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
                        <Link
                          href={`/admin/growth-communities/${c.id}/members`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-brand_primary bg-brand_accent/30 hover:bg-brand_accent/50 transition-colors"
                        >
                          Gestionar miembros
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default GrowthCommunitiesIndexPage;
