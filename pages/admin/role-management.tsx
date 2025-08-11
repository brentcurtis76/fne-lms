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

export default function RoleManagement() {
  const router = useRouter();
  const user = useUser();
  const session = useSession();
  const supabaseClient = useSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [permissions, setPermissions] = useState<PermissionMatrix>({});
  const [testMode, setTestMode] = useState(false);
  const [isMock, setIsMock] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

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
        const data = await response.json();
        setPermissions(data.permissions);
        setTestMode(data.test_mode);
        setIsMock(data.is_mock);
      }
    } catch (error) {
      console.error('Error loading permissions:', error);
    } finally {
      setLoading(false);
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

  const roles = Object.keys(permissions);
  const allPermissions = roles.length > 0 
    ? [...new Set(roles.flatMap(role => Object.keys(permissions[role])))]
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
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    <strong>Modo de Prueba Activo</strong> - Los cambios son temporales
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
                    {allPermissions.map(permission => (
                      <th key={permission} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {permission.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {roles.map(role => (
                    <tr key={role}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {role.replace(/_/g, ' ').charAt(0).toUpperCase() + role.replace(/_/g, ' ').slice(1)}
                      </td>
                      {allPermissions.map(permission => (
                        <td key={permission} className="px-6 py-4 whitespace-nowrap text-center">
                          {permissions[role][permission] ? (
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
                        </td>
                      ))}
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
    </MainLayout>
  );
}