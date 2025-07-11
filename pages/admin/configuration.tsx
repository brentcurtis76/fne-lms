import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import MainLayout from '../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../components/layout/FunctionalPageHeader';
import { Bell, Settings, Users, Palette, CheckCircle, XCircle, Loader2, RefreshCw, UserCog } from 'lucide-react';
import UserPreferences from '../../components/configuration/UserPreferences';
import FeedbackPermissionsManager from '../../components/admin/FeedbackPermissionsManager';

interface NotificationType {
  id: string;
  name: string;
  description: string;
  category: string;
  default_enabled: boolean;
  created_at: string;
}

interface TabItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const tabs: TabItem[] = [
  { id: 'notifications', label: 'Notificaciones', icon: <Bell className="w-5 h-5" /> },
  { id: 'system', label: 'Sistema General', icon: <Settings className="w-5 h-5" /> },
  { id: 'users', label: 'Usuarios y Permisos', icon: <Users className="w-5 h-5" /> },
  { id: 'customization', label: 'Personalización', icon: <Palette className="w-5 h-5" /> },
  { id: 'preferences', label: 'Preferencias de Usuario', icon: <UserCog className="w-5 h-5" /> },
];

export default function Configuration() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('notifications');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Notification types state
  const [notificationTypes, setNotificationTypes] = useState<NotificationType[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  useEffect(() => {
    checkUserAuth();
  }, [router]);

  // Fetch notification types when notifications tab is active and user is admin
  useEffect(() => {
    if (activeTab === 'notifications' && isAdmin && notificationTypes.length === 0) {
      console.log('🔄 Active tab changed to notifications, fetching data...');
      fetchNotificationTypes();
    }
  }, [activeTab, isAdmin]);

  const checkUserAuth = async () => {
    try {
      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }

      setCurrentUser(session.user);

      // Get user metadata and check for admin role
      const { data: userData, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        console.error('Error fetching user data:', userError);
        // Don't immediately redirect on user error, try profile check
      }

      // Check if user has admin role from user metadata
      const adminFromMetadata = userData?.user?.user_metadata?.role === 'admin';
      
      // Check user_roles table for admin role
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', session.user.id)
        .eq('is_active', true);
        
      const hasAdminRoleInDB = userRoles?.some(role => role.role_type === 'admin') || false;
      
      if (!hasAdminRoleInDB && !adminFromMetadata) {
        console.error('User is not an admin');
        router.push('/dashboard');
        return;
      }
      
      // User is admin if either metadata or user_roles indicates admin
      const isAdminUser = adminFromMetadata || hasAdminRoleInDB;
      
      // Allow all authenticated users to access configuration for preferences tab
      // Only restrict admin-only tabs
      setIsAdmin(isAdminUser);
      
      // Load notification types after successful auth
      if (activeTab === 'notifications') {
        await fetchNotificationTypes();
      }
    } catch (error) {
      console.error('Authentication error:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const fetchNotificationTypes = async () => {
    console.log('🔍 Starting fetchNotificationTypes...');
    
    setNotificationsLoading(true);
    setNotificationsError(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('📋 Session check:', session ? 'Session found' : 'No session');
      
      if (!session) {
        setNotificationsError('No session found');
        return;
      }

      console.log('🌐 Making API request to /api/admin/notification-types...');
      const response = await fetch('/api/admin/notification-types', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('📊 API Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API request failed:', response.status, errorText);
        throw new Error(`Failed to fetch notification types: ${response.status}`);
      }

      const result = await response.json();
      console.log('📦 API Result:', result);
      
      if (result.success && result.data) {
        console.log(`✅ Setting ${result.data.length} notification types`);
        setNotificationTypes(result.data);
      } else {
        console.error('❌ API returned unsuccessful result:', result);
        setNotificationsError(result.error || 'Failed to load notification types');
      }
    } catch (error) {
      console.error('❌ Error fetching notification types:', error);
      setNotificationsError(`Error loading notification types: ${error.message}`);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'courses':
        return 'bg-blue-100 text-blue-800';
      case 'assignments':
        return 'bg-green-100 text-green-800';
      case 'messaging':
        return 'bg-purple-100 text-purple-800';
      case 'social':
        return 'bg-pink-100 text-pink-800';
      case 'feedback':
        return 'bg-orange-100 text-orange-800';
      case 'system':
        return 'bg-gray-100 text-gray-800';
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'workspace':
        return 'bg-indigo-100 text-indigo-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryLabel = (category: string): string => {
    switch (category) {
      case 'courses':
        return 'Cursos';
      case 'assignments':
        return 'Tareas';
      case 'messaging':
        return 'Mensajería';
      case 'social':
        return 'Social';
      case 'feedback':
        return 'Retroalimentación';
      case 'system':
        return 'Sistema';
      case 'admin':
        return 'Administración';
      case 'workspace':
        return 'Espacio de Trabajo';
      default:
        return category.charAt(0).toUpperCase() + category.slice(1);
    }
  };

  const filterNotificationsBySearch = (types: NotificationType[]): NotificationType[] => {
    if (!searchQuery.trim()) return types;
    
    const query = searchQuery.toLowerCase();
    return types.filter(type => {
      return (
        type.name.toLowerCase().includes(query) ||
        type.description.toLowerCase().includes(query) ||
        getCategoryLabel(type.category).toLowerCase().includes(query) ||
        type.id.toLowerCase().includes(query)
      );
    });
  };

  const renderTabContent = () => {
    const commonContent = (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="bg-gray-50 rounded-full p-6 mb-4">
          <Settings className="w-12 h-12 text-gray-400" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Próximamente
        </h3>
        <p className="text-gray-600 max-w-md">
          Esta sección estará disponible pronto. Estamos trabajando para ofrecerte 
          las mejores herramientas de configuración.
        </p>
      </div>
    );

    // Check if current tab requires admin access
    const adminOnlyTabs = ['notifications', 'system', 'users', 'customization'];
    if (adminOnlyTabs.includes(activeTab) && !isAdmin) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="bg-gray-50 rounded-full p-6 mb-4">
            <Settings className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Acceso Restringido
          </h3>
          <p className="text-gray-600 max-w-md">
            Esta sección requiere permisos de administrador.
          </p>
        </div>
      );
    }

    switch (activeTab) {
      case 'notifications':
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Configuración de Notificaciones
                </h3>
                <p className="text-gray-600 mb-6">
                  Gestiona los tipos de notificaciones disponibles en el sistema.
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    console.log('🔄 Manual refresh clicked');
                    fetchNotificationTypes();
                  }}
                  disabled={notificationsLoading}
                  className="flex items-center space-x-2 px-3 py-2 bg-[#00365b] text-white rounded hover:bg-[#004a7a] disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${notificationsLoading ? 'animate-spin' : ''}`} />
                  <span>Actualizar</span>
                </button>
              </div>
            </div>
            
            {notificationsError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <XCircle className="h-5 w-5 text-red-500 mr-2" />
                  <span className="text-red-700">{notificationsError}</span>
                </div>
              </div>
            )}

            {notificationsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#00365b]" />
                <span className="ml-2 text-gray-600">Cargando tipos de notificación...</span>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900">
                    Tipos de Notificación ({filterNotificationsBySearch(notificationTypes).length})
                  </h4>
                </div>
                
                {notificationTypes.length === 0 ? (
                  <div className="px-6 py-8 text-center">
                    <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No se encontraron tipos de notificación</p>
                  </div>
                ) : filterNotificationsBySearch(notificationTypes).length === 0 ? (
                  <div className="px-6 py-8 text-center">
                    <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No se encontraron tipos de notificación que coincidan con la búsqueda</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Tipo
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Descripción
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Categoría
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Estado
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filterNotificationsBySearch(notificationTypes).map((type) => (
                          <tr key={type.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {type.name}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {type.id}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900 max-w-xs">
                                {type.description}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(type.category)}`}>
                                {getCategoryLabel(type.category)}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {type.default_enabled ? (
                                  <>
                                    <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                                    <span className="text-sm text-green-700">Activo</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-4 w-4 text-red-500 mr-1" />
                                    <span className="text-sm text-red-700">Inactivo</span>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start">
                <Bell className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-blue-900 mb-1">
                    Configuración Avanzada
                  </h4>
                  <p className="text-sm text-blue-700">
                    La gestión de preferencias de usuario individuales estará disponible en una futura actualización. 
                    Por ahora, puedes visualizar todos los tipos de notificación disponibles en el sistema.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      case 'system':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Configuración General del Sistema
              </h3>
              <p className="text-gray-600 mb-6">
                Administra la configuración global de la plataforma.
              </p>
            </div>
            {commonContent}
          </div>
        );
      case 'users':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Usuarios y Permisos
              </h3>
              <p className="text-gray-600 mb-6">
                Configura roles, permisos y políticas de acceso.
              </p>
            </div>
            
            {/* Feedback Permissions Section */}
            <FeedbackPermissionsManager />
            
            {/* Placeholder for future permissions */}
            <div className="bg-gray-50 rounded-lg p-6 text-center">
              <p className="text-gray-600">
                Más opciones de permisos estarán disponibles próximamente
              </p>
            </div>
          </div>
        );
      case 'customization':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Personalización
              </h3>
              <p className="text-gray-600 mb-6">
                Personaliza la apariencia y marca de la plataforma.
              </p>
            </div>
            {commonContent}
          </div>
        );
      case 'preferences':
        return <UserPreferences userId={currentUser?.id} />;
      default:
        return commonContent;
    }
  };

  if (loading) {
    return (
      <MainLayout 
        user={currentUser} 
        currentPage="configuration"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
      >
        <div className="flex items-center justify-center min-h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00365b]"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout 
      user={currentUser} 
      currentPage="configuration"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
    >
      <ResponsiveFunctionalPageHeader
        icon={<Settings />}
        title="Configuración del Sistema"
        subtitle="Administra la configuración general de la plataforma FNE"
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Buscar configuraciones..."
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-10">
          <nav className="-mb-px flex space-x-12 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center space-x-3 whitespace-nowrap py-6 px-2 border-b-2 font-medium text-base transition-colors
                  ${activeTab === tab.id
                    ? 'border-[#fdb933] text-[#00365b]'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
          {renderTabContent()}
        </div>
      </div>
    </MainLayout>
  );
}