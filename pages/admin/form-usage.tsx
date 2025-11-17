import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '../../components/layout/MainLayout';
import { getUserPrimaryRole } from '../../utils/roleUtils';
import { getMonthlyFormStats } from '../../lib/formSubmissionTracker';
import { useSupabaseClient } from '@supabase/auth-helpers-react';

interface FormStats {
  total: number;
  remaining: number;
  percentage: number;
  resetDate: string;
  submissions: Array<{
    id: string;
    submission_date: string;
    sender_name: string;
    sender_email: string;
  }>;
}

export default function FormUsage() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [stats, setStats] = useState<FormStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminAndLoadStats();
  }, []);

  const checkAdminAndLoadStats = async () => {
    try {
      // Check if user is admin
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        router.push('/');
        return;
      }
      const role = await getUserPrimaryRole(session.user.id);
      if (role !== 'admin') {
        router.push('/');
        return;
      }
      setIsAdmin(true);

      // Load stats
      const formStats = await getMonthlyFormStats();
      if (formStats) {
        setStats(formStats);
      }
    } catch (error) {
      console.error('Error loading form stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-600';
    if (percentage >= 80) return 'bg-orange-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getUsageTextColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 80) return 'text-orange-600';
    if (percentage >= 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-3xl font-bold mb-8">Uso del Formulario de Contacto</h1>

        {stats && (
          <>
            {/* Usage Alert */}
            {stats.total >= 45 && (
              <div className="mb-6 bg-red-50 border-l-4 border-red-600 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      ⚠️ Límite Próximo a Alcanzarse
                    </h3>
                    <p className="mt-2 text-sm text-red-700">
                      Has usado {stats.total} de 50 emails gratuitos. Quedan solo {stats.remaining} envíos.
                      <br />
                      <a href="https://formspree.io/forms/mblkwada/settings/billing" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                        Actualiza tu plan de Formspree aquí →
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm font-medium text-gray-500 mb-1">Emails Enviados</div>
                <div className={`text-3xl font-bold ${getUsageTextColor(stats.percentage)}`}>
                  {stats.total}
                </div>
                <div className="text-sm text-gray-400 mt-1">de 50</div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm font-medium text-gray-500 mb-1">Emails Restantes</div>
                <div className="text-3xl font-bold text-gray-900">
                  {stats.remaining}
                </div>
                <div className="text-sm text-gray-400 mt-1">este mes</div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm font-medium text-gray-500 mb-1">Uso del Mes</div>
                <div className={`text-3xl font-bold ${getUsageTextColor(stats.percentage)}`}>
                  {stats.percentage.toFixed(0)}%
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div 
                    className={`h-2 rounded-full ${getUsageColor(stats.percentage)}`}
                    style={{ width: `${Math.min(stats.percentage, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm font-medium text-gray-500 mb-1">Reinicio de Límite</div>
                <div className="text-xl font-bold text-gray-900">
                  {stats.resetDate}
                </div>
                <div className="text-sm text-gray-400 mt-1">próximo reinicio</div>
              </div>
            </div>

            {/* Recent Submissions */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold">Envíos Recientes</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fecha
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nombre
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stats.submissions.slice(0, 10).map((submission) => (
                      <tr key={submission.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(submission.submission_date).toLocaleString('es-CL')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {submission.sender_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {submission.sender_email}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Upgrade Info */}
            <div className="mt-8 bg-blue-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">
                Información del Plan
              </h3>
              <p className="text-blue-700">
                Actualmente estás usando el plan gratuito de Formspree (50 emails/mes).
              </p>
              <p className="text-blue-700 mt-2">
                Si necesitas más envíos, considera actualizar a:
              </p>
              <ul className="mt-2 space-y-1 text-blue-700">
                <li>• <strong>Gold ($8/mes):</strong> 1,000 envíos mensuales</li>
                <li>• <strong>Platinum ($40/mes):</strong> 5,000 envíos mensuales</li>
              </ul>
              <a 
                href="https://formspree.io/forms/mblkwada/settings/billing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Actualizar Plan en Formspree →
              </a>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}