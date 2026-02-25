/**
 * /reporte-horas — School Hours Report page
 *
 * - equipo_directivo: auto-detects their school_id from user_roles and shows report
 * - admin: shows school selector dropdown to pick any school
 * - Others: redirect to /dashboard
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '../components/layout/MainLayout';
import SchoolHoursReport from '../components/hours/SchoolHoursReport';
import { getUserPrimaryRole } from '../utils/roleUtils';
import { BarChart3 } from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface SchoolOption {
  id: number;
  name: string;
}

const ReporteHorasPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);

  // For equipo_directivo — auto-resolved school
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [schoolName, setSchoolName] = useState<string>('');

  // For admin — school selector
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const initializeAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push('/login');
        return;
      }

      setUser(session.user);

      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setAvatarUrl(profileData.avatar_url ?? '');
      }

      const userRole = await getUserPrimaryRole(session.user.id);
      const isAdminUser = userRole === 'admin';
      setIsAdmin(isAdminUser);

      // RBAC: only admin and equipo_directivo
      if (!isAdminUser && userRole !== 'equipo_directivo') {
        router.push('/dashboard');
        return;
      }

      if (isAdminUser) {
        // Load school list for admin
        const { data: schoolsData } = await supabase
          .from('schools')
          .select('id, name')
          .order('name');
        setSchools((schoolsData ?? []) as SchoolOption[]);
        if (schoolsData && schoolsData.length > 0) {
          setSelectedSchoolId(schoolsData[0].id);
        }
      } else {
        // equipo_directivo: resolve school_id from user_roles
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('school_id, schools(name)')
          .eq('user_id', session.user.id)
          .eq('is_active', true)
          .not('school_id', 'is', null)
          .limit(1);

        if (roleData && roleData.length > 0) {
          const role = roleData[0] as unknown as { school_id: number; schools: { name: string } | null };
          setSchoolId(role.school_id);
          setSchoolName(role.schools?.name ?? '');
        } else {
          // No school assigned — redirect
          router.push('/dashboard');
          return;
        }
      }
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand_primary" />
        <span className="text-sm text-gray-500">Cargando...</span>
      </div>
    );
  }

  if (!user) return null;

  // Determine which school_id to show
  const effectiveSchoolId = isAdmin ? selectedSchoolId : schoolId;
  const effectiveSchoolName = isAdmin
    ? schools.find((s) => s.id === selectedSchoolId)?.name ?? ''
    : schoolName;

  return (
    <MainLayout
      user={user}
      currentPage="reporte-horas"
      isAdmin={isAdmin}
      avatarUrl={avatarUrl}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-brand_primary/10 rounded-lg">
            <BarChart3 className="h-6 w-6 text-brand_primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reporte de Horas</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Seguimiento del uso de horas contratadas por escuela.
            </p>
          </div>
        </div>

        {/* Admin: school selector */}
        {isAdmin && (
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex items-center gap-3">
              <label htmlFor="school-selector" className="text-sm font-medium text-gray-700">Escuela:</label>
              <select
                id="school-selector"
                value={selectedSchoolId ?? ''}
                onChange={(e) => setSelectedSchoolId(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent flex-1 max-w-xs"
              >
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Report */}
        {effectiveSchoolId !== null ? (
          <SchoolHoursReport
            schoolId={effectiveSchoolId}
            isAdmin={isAdmin}
            schoolName={effectiveSchoolName}
          />
        ) : (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            {isAdmin
              ? 'Seleccione una escuela para ver el reporte.'
              : 'No se encontró una escuela asignada a su cuenta.'}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default ReporteHorasPage;
