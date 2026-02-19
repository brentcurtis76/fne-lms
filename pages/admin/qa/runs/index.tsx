/**
 * QA Test Runs List Page
 *
 * Lists all QA test runs with scenario info, tester, result, date, and duration.
 * Accessible by admins only.
 */

import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  ClipboardList,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import type { QATestRun } from '@/types/qa';

const QARunsListPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [runs, setRuns] = useState<QATestRun[]>([]);

  // Check auth and permissions
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      // Get avatar
      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }

      // Check permissions (admin only)
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      const isAdmin = roles?.some((r) => r.role_type === 'admin') || false;
      setHasPermission(isAdmin);
    };

    checkAuth();
  }, [supabase, router]);

  // Fetch all test runs — guarded by hasFetched ref to prevent re-render loops
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!user || hasPermission !== true || hasFetched.current) return;
    hasFetched.current = true;

    const fetchRuns = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('qa_test_runs')
          .select(
            `
            *,
            scenario:qa_scenarios(id, name, feature_area),
            tester:profiles(email, first_name, last_name)
          `
          )
          .order('started_at', { ascending: false })
          .limit(100);

        if (error) {
          throw error;
        }

        setRuns(data || []);
      } catch (err) {
        toast.error('Error al cargar las ejecuciones');
      } finally {
        setLoading(false);
      }
    };

    fetchRuns();
  }, [user, hasPermission, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Get result icon — using brand colors consistent with QA admin dashboard
  const getResultIcon = (result: 'pass' | 'fail' | 'partial' | null, status: string) => {
    if (status === 'in_progress') {
      return <Clock className="w-4 h-4 text-brand_accent" />;
    }
    switch (result) {
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-brand_accent" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-brand_gray_medium" />;
      case 'partial':
        return <AlertCircle className="w-4 h-4 text-brand_accent_light" />;
      default:
        return <Clock className="w-4 h-4 text-brand_gray_medium" />;
    }
  };

  // Get result badge — color-coded pill
  const getResultBadge = (result: 'pass' | 'fail' | 'partial' | null, status: string) => {
    if (status === 'in_progress') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand_accent/20 text-brand_primary">
          <Clock className="w-3 h-3" />
          En Progreso
        </span>
      );
    }
    if (status === 'aborted') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          Abortado
        </span>
      );
    }
    switch (result) {
      case 'pass':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand_accent/20 text-brand_primary">
            <CheckCircle2 className="w-3 h-3" />
            Pasó
          </span>
        );
      case 'fail':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand_gray_medium/20 text-brand_gray_dark">
            <XCircle className="w-3 h-3" />
            Falló
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand_accent_light/20 text-brand_primary">
            <AlertCircle className="w-3 h-3" />
            Parcial
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            Pendiente
          </span>
        );
    }
  };

  // Format duration from started_at / completed_at
  const formatDuration = (run: QATestRun): string => {
    if (!run.completed_at) return '—';
    const ms =
      new Date(run.completed_at).getTime() - new Date(run.started_at).getTime();
    const minutes = Math.round(ms / 60000);
    if (minutes < 1) return '< 1 min';
    return `${minutes} min`;
  };

  // Loading while checking auth
  if (loading && hasPermission === null) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_primary">Cargando...</p>
      </div>
    );
  }

  // Access denied
  if (hasPermission === false) {
    return (
      <MainLayout
        user={user}
        currentPage="qa-admin"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={false}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold text-brand_primary mb-4">
              Acceso Denegado
            </h1>
            <p className="text-gray-700 mb-6">
              Solo administradores pueden acceder al panel de QA.
            </p>
            <Link
              href="/qa"
              className="px-6 py-2 bg-brand_primary text-white rounded-lg shadow hover:bg-opacity-90 transition-colors"
            >
              Ir a Pruebas de QA
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="qa-admin"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={true}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<ClipboardList />}
        title="Todas las Ejecuciones"
        subtitle="Historial completo de pruebas QA ejecutadas"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back link */}
        <div className="mb-4">
          <Link
            href="/admin/qa"
            className="inline-flex items-center gap-2 text-sm text-brand_primary hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Panel de QA
          </Link>
        </div>

        {/* Runs table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-gray-500">Cargando ejecuciones...</p>
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <ClipboardList className="w-12 h-12 text-gray-300 mb-4" />
              <p className="text-gray-500 text-sm">
                No hay ejecuciones registradas todavía.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Escenario
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tester
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Resultado
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fecha
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Duración
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {runs.map((run) => (
                      <tr
                        key={run.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <Link
                            href={`/admin/qa/runs/${run.id}`}
                            className="flex items-center gap-2 group"
                          >
                            {getResultIcon(run.overall_result, run.status)}
                            <div>
                              <p className="font-medium text-gray-900 group-hover:text-brand_primary transition-colors">
                                {run.scenario?.name || 'Escenario eliminado'}
                              </p>
                              {run.scenario?.feature_area && (
                                <p className="text-xs text-gray-400">
                                  {run.scenario.feature_area.replace(/_/g, ' ')}
                                </p>
                              )}
                            </div>
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {run.tester?.first_name && run.tester?.last_name
                            ? `${run.tester.first_name} ${run.tester.last_name}`
                            : run.tester?.email || '—'}
                        </td>
                        <td className="px-6 py-4">
                          {getResultBadge(run.overall_result, run.status)}
                        </td>
                        <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                          {new Date(run.started_at).toLocaleDateString('es-CL', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                          {formatDuration(run)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-gray-100">
                {runs.map((run) => (
                  <Link
                    key={run.id}
                    href={`/admin/qa/runs/${run.id}`}
                    className="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="mt-0.5">
                      {getResultIcon(run.overall_result, run.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {run.scenario?.name || 'Escenario eliminado'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {run.tester?.first_name && run.tester?.last_name
                          ? `${run.tester.first_name} ${run.tester.last_name}`
                          : run.tester?.email || '—'}
                        {' · '}
                        {new Date(run.started_at).toLocaleDateString('es-CL')}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {getResultBadge(run.overall_result, run.status)}
                    </div>
                  </Link>
                ))}
              </div>

              {/* Row count */}
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-400">
                  {runs.length} ejecución{runs.length !== 1 ? 'es' : ''} (máximo 100)
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default QARunsListPage;
