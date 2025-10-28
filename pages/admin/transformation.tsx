import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '../../components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { Building, ChevronRight, RefreshCw } from 'lucide-react';
import { assignTransformationAccess, revokeTransformationAccess } from '../../lib/transformation/accessControl';

interface GrowthCommunity {
  id: string;
  name: string;
  school_id: number;
  school_name: string;
  has_access: boolean;
  assessment_count: number;
}

export default function TransformationAccessManagement() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [communities, setCommunities] = useState<GrowthCommunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    community: GrowthCommunity;
    action: 'assign' | 'revoke';
  } | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchCommunities();
    }
  }, [isAdmin]);

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      router.push('/login');
      return;
    }

    // Check if user is admin
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    const hasAdminRole = userRoles?.some(r => r.role_type === 'admin');

    if (!hasAdminRole) {
      toast.error('No tienes permisos para acceder a esta página');
      router.push('/');
      return;
    }

    setIsAdmin(true);
  }

  async function fetchCommunities() {
    try {
      setLoading(true);

      // Fetch all growth communities with their access status
      const { data: communitiesData, error: communitiesError } = await supabase
        .from('growth_communities')
        .select(`
          id,
          name,
          school_id,
          schools!inner(name)
        `)
        .order('name');

      if (communitiesError) throw communitiesError;

      // Fetch transformation access records
      const { data: accessData, error: accessError } = await supabase
        .from('growth_community_transformation_access')
        .select('growth_community_id, is_active')
        .eq('is_active', true);

      if (accessError) throw accessError;

      // Fetch assessment counts
      const { data: assessmentCounts, error: assessmentError } = await supabase
        .from('transformation_assessments')
        .select('growth_community_id, status')
        .in('status', ['in_progress', 'completed']);

      if (assessmentError) throw assessmentError;

      // Map to access set for quick lookup
      const accessSet = new Set(accessData?.map(a => a.growth_community_id) || []);

      // Count assessments per community
      const countMap = new Map<string, number>();
      assessmentCounts?.forEach(a => {
        countMap.set(a.growth_community_id, (countMap.get(a.growth_community_id) || 0) + 1);
      });

      const transformedCommunities: GrowthCommunity[] = communitiesData?.map(c => ({
        id: c.id,
        name: c.name,
        school_id: c.school_id,
        school_name: (c.schools as any)?.name || 'Sin escuela',
        has_access: accessSet.has(c.id),
        assessment_count: countMap.get(c.id) || 0
      })) || [];

      setCommunities(transformedCommunities);
    } catch (error) {
      console.error('Error fetching communities:', error);
      toast.error('Error al cargar comunidades de crecimiento');
    } finally {
      setLoading(false);
    }
  }

  function handleToggleClick(community: GrowthCommunity, newState: boolean) {
    setPendingAction({
      community,
      action: newState ? 'assign' : 'revoke'
    });
    setShowConfirmModal(true);
  }

  async function confirmAction() {
    if (!pendingAction) return;

    const { community, action } = pendingAction;

    try {
      setTogglingId(community.id);
      setShowConfirmModal(false);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sesión expirada');
        return;
      }

      if (action === 'assign') {
        const result = await assignTransformationAccess(
          supabase,
          community.id,
          session.user.id,
          `Asignado manualmente por admin desde UI`
        );

        if (!result.success) {
          throw new Error(result.error);
        }

        toast.success(`Acceso asignado a ${community.name}`);
      } else {
        const result = await revokeTransformationAccess(
          supabase,
          community.id,
          session.user.id,
          `Revocado manualmente por admin desde UI`
        );

        if (!result.success) {
          throw new Error(result.error);
        }

        toast.success(`Acceso revocado para ${community.name}`);

        if (community.assessment_count > 0) {
          toast(`${community.assessment_count} assessment(s) archivado(s)`, {
            icon: '📁',
            duration: 5000
          });
        }
      }

      // Refresh list
      await fetchCommunities();

    } catch (error: any) {
      console.error('Error toggling access:', error);
      toast.error(error.message || 'Error al cambiar acceso');
    } finally {
      setTogglingId(null);
      setPendingAction(null);
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="min-h-screen bg-gray-50 p-6">
          <div className="max-w-6xl mx-auto">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-64 bg-white rounded-lg"></div>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Vías de Transformación</h1>
            <p className="text-gray-600 mt-1">
              Gestiona qué comunidades de crecimiento tienen acceso a las evaluaciones de transformación
            </p>
          </div>

          {/* Info Card */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-blue-800">Importante</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Al revocar acceso, los assessments activos se archivarán automáticamente</li>
                    <li>Los assessments archivados NO se reactivarán si vuelves a asignar acceso</li>
                    <li>Actualmente solo "Personalización" está disponible de las 7 vías</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Communities Table */}
          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Comunidad de Crecimiento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Escuela
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assessments
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acceso
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {communities.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                        No se encontraron comunidades de crecimiento
                      </td>
                    </tr>
                  ) : (
                    communities.map((community) => (
                      <tr key={community.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {community.name}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center text-sm text-gray-500">
                            <Building className="w-4 h-4 mr-1" />
                            {community.school_name}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {community.assessment_count > 0 ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {community.assessment_count} activo{community.assessment_count !== 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="text-gray-400">Sin assessments</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleToggleClick(community, !community.has_access)}
                            disabled={togglingId === community.id}
                            className={`
                              relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                              transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                              ${community.has_access ? 'bg-blue-600' : 'bg-gray-200'}
                              ${togglingId === community.id ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                          >
                            <span
                              className={`
                                pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                                transition duration-200 ease-in-out
                                ${community.has_access ? 'translate-x-5' : 'translate-x-0'}
                              `}
                            />
                          </button>
                          {togglingId === community.id && (
                            <RefreshCw className="w-4 h-4 animate-spin inline-block ml-2 text-gray-400" />
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Comunidades</dt>
                      <dd className="text-lg font-semibold text-gray-900">{communities.length}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Con Acceso</dt>
                      <dd className="text-lg font-semibold text-gray-900">
                        {communities.filter(c => c.has_access).length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Assessments</dt>
                      <dd className="text-lg font-semibold text-gray-900">
                        {communities.reduce((sum, c) => sum + c.assessment_count, 0)}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && pendingAction && (
        <div className="fixed z-50 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowConfirmModal(false)}></div>

            <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
              <div>
                <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${
                  pendingAction.action === 'assign' ? 'bg-green-100' : 'bg-yellow-100'
                }`}>
                  {pendingAction.action === 'assign' ? (
                    <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-6 w-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                </div>
                <div className="mt-3 text-center sm:mt-5">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    {pendingAction.action === 'assign' ? 'Asignar Acceso' : 'Revocar Acceso'}
                  </h3>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      {pendingAction.action === 'assign' ? (
                        <>¿Deseas asignar acceso a Vías de Transformación para <strong>{pendingAction.community.name}</strong>?</>
                      ) : (
                        <>
                          ¿Estás seguro de revocar el acceso para <strong>{pendingAction.community.name}</strong>?
                          {pendingAction.community.assessment_count > 0 && (
                            <span className="block mt-2 text-yellow-600 font-medium">
                              ⚠️ Esto archivará {pendingAction.community.assessment_count} assessment(s) activo(s)
                            </span>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                <button
                  type="button"
                  onClick={confirmAction}
                  className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 sm:col-start-2 sm:text-sm ${
                    pendingAction.action === 'assign'
                      ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                      : 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
                  }`}
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmModal(false);
                    setPendingAction(null);
                  }}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:col-start-1 sm:text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
