import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useUser, useSupabaseClient, useSession } from '@supabase/auth-helpers-react';
import { isFeatureEnabled } from '../../lib/featureFlags';
import MainLayout from '../../components/layout/MainLayout';
import { supabase } from '../../lib/supabase';

interface PermissionMatrix {
  [role: string]: {
    [permission: string]: boolean;
  };
}

interface PermissionCatalogItem {
  key: string;
  name?: string;
  description?: string;
  category?: string;
}

interface RolesPermissionsResponse {
  permissions: PermissionMatrix;
  roles?: string[];
  permission_catalog?: PermissionCatalogItem[];
  is_mock: boolean;
  test_mode: boolean;
  test_run_id?: string | null;
  error?: string;
  note?: string;
}

export default function RoleManagement() {
  const router = useRouter();
  const user = useUser();
  const session = useSession();
  const supabaseClient = useSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [permissions, setPermissions] = useState<PermissionMatrix>({});
  const [roles, setRoles] = useState<string[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionCatalogItem[]>([]);
  const [testMode, setTestMode] = useState(false);
  const [isMock, setIsMock] = useState(false);
  const [testRunId, setTestRunId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingChange, setPendingChange] = useState<any>(null);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  useEffect(() => {
    // Check feature flag
    if (!isFeatureEnabled('FEATURE_SUPERADMIN_RBAC')) {
      router.push('/404');
      return;
    }

    if (session && user) {
      checkAccess();
      fetchUserProfile();
    }
  }, [user, session]);

  const fetchUserProfile = async () => {
    if (!user) return;

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profile) {
        setCurrentUser({
          ...user,
          ...profile
        });
        setAvatarUrl(profile.avatar_url || '');
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const checkAccess = async () => {
    if (!user || !session) {
      router.push('/login');
      return;
    }

    try {
      // Check if user is superadmin
      const response = await fetch('/api/admin/auth/is-superadmin', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        console.error('Failed to check superadmin status:', response.status);
        router.push('/dashboard');
        return;
      }

      const data = await response.json();
      setIsSuperadmin(data.is_superadmin);
      setIsAdmin(data.is_superadmin); // Superadmins are also admins

      if (data.is_superadmin) {
        loadPermissions();
      } else {
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Error checking access:', error);
      router.push('/dashboard');
    }
  };

  const loadPermissions = async () => {
    try {
      const response = await fetch('/api/admin/roles/permissions', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      if (response.ok) {
        const data: RolesPermissionsResponse = await response.json();
        setPermissions(data.permissions || {});
        setRoles(data.roles || Object.keys(data.permissions));
        setPermissionCatalog(data.permission_catalog || []);
        setTestMode(data.test_mode || false);
        setIsMock(data.is_mock || false);
        setTestRunId(data.test_run_id || null);
      }
    } catch (error) {
      console.error('Error loading permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionToggle = async (role: string, permission: string, currentValue: boolean) => {
    if (!isSuperadmin || isMock) return;

    // Prepare dry-run request
    const changeRequest = {
      role_type: role,
      permission_key: permission,
      granted: !currentValue,
      reason: `Cambio manual por ${currentUser?.email || 'superadmin'}`,
      dry_run: true
    };

    try {
      const response = await fetch('/api/admin/roles/permissions/overlay', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(changeRequest)
      });

      if (response.ok) {
        const preview = await response.json();
        setPendingChange({
          ...changeRequest,
          preview,
          dry_run: false
        });
        setShowConfirmModal(true);
      } else {
        const error = await response.json();
        setToast({ message: error.error || 'Error al preparar cambio', type: 'error' });
      }
    } catch (error) {
      console.error('Error in permission toggle:', error);
      setToast({ message: 'Error de conexión', type: 'error' });
    }
  };

  const handleConfirmChange = async () => {
    if (!pendingChange) return;

    try {
      const response = await fetch('/api/admin/roles/permissions/overlay', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(pendingChange)
      });

      if (response.ok) {
        const result = await response.json();
        setTestRunId(result.test_run_id);
        setTestMode(true);
        setToast({ 
          message: `Permiso ${pendingChange.granted ? 'otorgado' : 'revocado'} (Test ID: ${result.test_run_id?.slice(0, 8)}...)`, 
          type: 'success' 
        });
        // Reload permissions to show updated state
        await loadPermissions();
      } else {
        const error = await response.json();
        setToast({ message: error.error || 'Error al aplicar cambio', type: 'error' });
      }
    } catch (error) {
      console.error('Error applying change:', error);
      setToast({ message: 'Error de conexión', type: 'error' });
    } finally {
      setShowConfirmModal(false);
      setPendingChange(null);
    }
  };

  const handleCleanup = async () => {
    if (!testRunId) return;

    if (!confirm(`¿Limpiar todos los cambios de prueba (ID: ${testRunId.slice(0, 8)}...)?`)) {
      return;
    }

    try {
      const response = await fetch('/api/admin/test-runs/cleanup', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          test_run_id: testRunId,
          confirm: true
        })
      });

      if (response.ok) {
        const result = await response.json();
        setToast({ 
          message: `${result.deleted_count} cambios eliminados exitosamente`, 
          type: 'success' 
        });
        setTestMode(false);
        setTestRunId(null);
        // Reload permissions to show baseline state
        await loadPermissions();
      } else {
        const error = await response.json();
        setToast({ message: error.error || 'Error al limpiar cambios', type: 'error' });
      }
    } catch (error) {
      console.error('Error in cleanup:', error);
      setToast({ message: 'Error de conexión', type: 'error' });
    }
  };

  if (loading) {
    return (
      <MainLayout 
        user={currentUser} 
        currentPage="rbac"
        pageTitle="Gestión de Roles y Permisos"
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!isSuperadmin) {
    return null;
  }

  // Use roles from API response, fallback to keys from permissions
  const displayRoles = roles.length > 0 ? roles : Object.keys(permissions);
  
  // Build permissions list from catalog if available, otherwise from matrix
  const allPermissions = permissionCatalog.length > 0
    ? permissionCatalog.map(p => p.key)
    : displayRoles.length > 0 
      ? [...new Set(displayRoles.flatMap(role => Object.keys(permissions[role] || {})))]
      : [];

  return (
    <MainLayout 
      user={currentUser} 
      currentPage="rbac"
      pageTitle="Gestión de Roles y Permisos"
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <div className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">
              Gestión de Roles y Permisos
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Fase 0 - Modo Solo Lectura
            </p>
          </div>

          {/* Dev mode banner */}
          {isMock && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mx-6 mt-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    <strong>Modo de Desarrollo</strong> - Usando datos de prueba
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Test mode indicator */}
          {testMode && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mx-6 mt-4">
              <div className="flex justify-between items-center">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-blue-700">
                      <strong>Modo de Prueba Activo</strong> - Los cambios son temporales
                      {testRunId && <span className="ml-2 text-xs">(ID: {testRunId.slice(0, 8)}...)</span>}
                    </p>
                  </div>
                </div>
                {testRunId && (
                  <button
                    onClick={handleCleanup}
                    className="ml-4 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Limpiar cambios de prueba
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Info for non-test mode */}
          {!testMode && isSuperadmin && !isMock && (
            <div className="bg-gray-50 border-l-4 border-gray-400 p-4 mx-6 mt-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-gray-700">
                    <strong>Modo de Prueba Inactivo</strong> - Haz clic en un permiso para activar el modo de prueba automáticamente
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Permission matrix */}
          <div className="px-6 py-4">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rol
                    </th>
                    {allPermissions.map(permission => {
                      // Use display name from catalog if available
                      const catalogItem = permissionCatalog.find(p => p.key === permission);
                      const displayName = catalogItem?.name || permission.replace(/_/g, ' ');
                      
                      return (
                        <th key={permission} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {displayName}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayRoles.map(role => (
                    <tr key={role}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {role.replace(/_/g, ' ').charAt(0).toUpperCase() + role.replace(/_/g, ' ').slice(1)}
                      </td>
                      {allPermissions.map(permission => {
                        const isGranted = permissions[role] && permissions[role][permission];
                        const canToggle = isSuperadmin && (testMode || !isMock);
                        
                        return (
                          <td key={permission} className="px-6 py-4 whitespace-nowrap text-center">
                            {canToggle ? (
                              <button
                                onClick={() => handlePermissionToggle(role, permission, isGranted)}
                                className="focus:outline-none hover:opacity-75 transition-opacity"
                                title={`Cambiar permiso: ${permission}`}
                              >
                                {isGranted ? (
                                  <span className="text-green-600">
                                    <svg className="h-5 w-5 inline" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  </span>
                                ) : (
                                  <span className="text-gray-400">
                                    <svg className="h-5 w-5 inline" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                  </span>
                                )}
                              </button>
                            ) : (
                              <>
                                {isGranted ? (
                                  <span className="text-green-600">
                                    <svg className="h-5 w-5 inline" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  </span>
                                ) : (
                                  <span className="text-gray-400">
                                    <svg className="h-5 w-5 inline" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Info footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              <strong>Nota:</strong> Esta es una vista de solo lectura. Los cambios de permisos se habilitarán en la Fase 1.
            </p>
          </div>
        </div>
      </div>
    </div>

    {/* Confirmation Modal */}
    {showConfirmModal && pendingChange && (
      <div className="fixed z-10 inset-0 overflow-y-auto">
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div className="fixed inset-0 transition-opacity" aria-hidden="true">
            <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
          </div>
          <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
          <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 sm:mx-0 sm:h-10 sm:w-10">
                  <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Confirmar cambio de permiso
                  </h3>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      <strong>Rol:</strong> {pendingChange.role_type}<br/>
                      <strong>Permiso:</strong> {pendingChange.permission_key}<br/>
                      <strong>Acción:</strong> {pendingChange.granted ? 'Otorgar' : 'Revocar'}<br/>
                      <strong>Modo:</strong> Prueba (temporal, 24 horas)
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                onClick={handleConfirmChange}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Aplicar cambio
              </button>
              <button
                type="button"
                onClick={() => {setShowConfirmModal(false); setPendingChange(null);}}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Toast Notification */}
    {toast && (
      <div className={`fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg ${
        toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
      }`}>
        <div className="flex items-center">
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-4 text-white hover:text-gray-200"
          >
            ✕
          </button>
        </div>
      </div>
    )}
    </MainLayout>
  );
}