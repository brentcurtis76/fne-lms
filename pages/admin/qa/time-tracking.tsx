/**
 * QA Time Tracking Page (Admin Only)
 *
 * Displays tester time logs for billing purposes.
 * Shows active hours (excluding idle time) per tester per day.
 */

import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  Clock,
  ArrowLeft,
  Download,
  Calendar,
  User,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';

interface TimeLogEntry {
  tester_id: string;
  tester_email: string;
  tester_name: string;
  log_date: string;
  total_active_seconds: number;
  tests_started: number;
  tests_completed: number;
  tests_passed: number;
  tests_failed: number;
}

interface TimeLogSummary {
  total_active_seconds: number;
  total_active_hours: number;
  total_tests_started: number;
  total_tests_completed: number;
  total_tests_passed: number;
  total_tests_failed: number;
}

const formatSeconds = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString + 'T12:00:00');
  return date.toLocaleDateString('es-CL', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const QATimeTrackingPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Data state
  const [entries, setEntries] = useState<TimeLogEntry[]>([]);
  const [summary, setSummary] = useState<TimeLogSummary | null>(null);

  // Filter state
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [testerFilter, setTesterFilter] = useState<string>('');
  const [testers, setTesters] = useState<{ id: string; name: string; email: string }[]>([]);

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

  // Set default date range (last 30 days)
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  }, []);

  // Fetch testers list
  useEffect(() => {
    const fetchTesters = async () => {
      if (!user || hasPermission === false) return;

      const { data } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, can_run_qa_tests')
        .or('can_run_qa_tests.eq.true');

      if (data) {
        setTesters(
          data.map((p) => ({
            id: p.id,
            email: p.email,
            name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email,
          }))
        );
      }
    };

    fetchTesters();
  }, [user, hasPermission, supabase]);

  // Fetch time tracking data
  const fetchTimeTracking = useCallback(async () => {
    if (!user || hasPermission === false) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (testerFilter) params.append('tester_id', testerFilter);

      const response = await fetch(`/api/qa/time-tracking?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar datos');
      }

      const data = await response.json();
      setEntries(data.entries || []);
      setSummary(data.summary || null);
    } catch (error: any) {
      console.error('Error fetching time tracking:', error);
      toast.error(error.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [user, hasPermission, startDate, endDate, testerFilter]);

  useEffect(() => {
    if (user && hasPermission === true && startDate && endDate) {
      fetchTimeTracking();
    }
  }, [user, hasPermission, startDate, endDate, testerFilter, fetchTimeTracking]);

  // Export to CSV
  const handleExportCSV = () => {
    if (entries.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    const headers = [
      'Fecha',
      'Tester',
      'Email',
      'Tiempo Activo (segundos)',
      'Tiempo Activo (horas)',
      'Pruebas Completadas',
      'Pasaron',
      'Fallaron',
    ];

    const rows = entries.map((entry) => [
      entry.log_date,
      entry.tester_name,
      entry.tester_email,
      entry.total_active_seconds.toString(),
      (entry.total_active_seconds / 3600).toFixed(2),
      entry.tests_completed.toString(),
      entry.tests_passed.toString(),
      entry.tests_failed.toString(),
    ]);

    // Add summary row
    if (summary) {
      rows.push([]);
      rows.push(['TOTAL', '', '', summary.total_active_seconds.toString(), summary.total_active_hours.toFixed(2), summary.total_tests_completed.toString(), summary.total_tests_passed.toString(), summary.total_tests_failed.toString()]);
    }

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qa-time-tracking-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('CSV exportado');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Loading state
  if (loading && hasPermission === null) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand_primary" />
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
              Solo administradores pueden ver el registro de horas.
            </p>
            <Link
              href="/qa"
              className="px-6 py-2 bg-brand_primary text-white rounded-lg shadow hover:bg-brand_gray_dark transition-colors"
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
        icon={<Clock />}
        title="Registro de Horas QA"
        subtitle="Tiempo activo de testers para facturación"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back Link */}
        <div className="mb-6">
          <Link
            href="/admin/qa"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Panel QA
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Desde
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand_accent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Hasta
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand_accent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Tester
              </label>
              <select
                value={testerFilter}
                onChange={(e) => setTesterFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_accent"
              >
                <option value="">Todos los testers</option>
                {testers.map((tester) => (
                  <option key={tester.id} value={tester.id}>
                    {tester.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleExportCSV}
              disabled={entries.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_gray_dark transition-colors disabled:opacity-50 ml-auto"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <Clock className="w-4 h-4" />
                Tiempo Activo Total
              </div>
              <div className="text-2xl font-bold text-brand_primary">
                {summary.total_active_hours.toFixed(1)}h
              </div>
              <div className="text-xs text-gray-500">
                {formatSeconds(summary.total_active_seconds)}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <CheckCircle className="w-4 h-4" />
                Pruebas Completadas
              </div>
              <div className="text-2xl font-bold text-brand_primary">
                {summary.total_tests_completed}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Pasaron
              </div>
              <div className="text-2xl font-bold text-green-600">
                {summary.total_tests_passed}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <XCircle className="w-4 h-4 text-red-500" />
                Fallaron
              </div>
              <div className="text-2xl font-bold text-red-600">
                {summary.total_tests_failed}
              </div>
            </div>
          </div>
        )}

        {/* Data Table */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-brand_primary mx-auto mb-4" />
            <p className="text-gray-500">Cargando datos...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center bg-white p-12 rounded-xl shadow-lg">
            <Clock className="mx-auto h-16 w-16 text-brand_gray_medium" />
            <h3 className="mt-4 text-xl font-semibold text-brand_primary">
              No hay registros de tiempo
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              No se encontraron registros de tiempo para el período seleccionado.
            </p>
          </div>
        ) : (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      Fecha
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      Tester
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Tiempo Activo
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Completadas
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Pasaron
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Fallaron
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {entries.map((entry, index) => (
                  <tr key={`${entry.tester_id}-${entry.log_date}-${index}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatDate(entry.log_date)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {entry.tester_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {entry.tester_email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-brand_primary">
                        {formatSeconds(entry.total_active_seconds)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {(entry.total_active_seconds / 3600).toFixed(2)}h
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm text-gray-900">
                        {entry.tests_completed}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {entry.tests_passed}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        {entry.tests_failed}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default QATimeTrackingPage;
