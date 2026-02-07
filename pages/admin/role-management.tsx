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

interface PermissionAction {
  base: string;
  scopes: string[];
  label: string;
}

interface PermissionCategory {
  name: string;
  actions: PermissionAction[];
  unscopedPermissions?: string[]; // Permissions without scope variants
}

// Organize permissions by category with scope-aware structure
const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    name: 'Dashboard & Core',
    actions: [
      { base: 'view_reports', scopes: ['school', 'generation', 'community', 'network', 'all'], label: 'Ver Reportes' }
    ],
    unscopedPermissions: ['view_dashboard']
  },
  {
    name: 'Learning Paths',
    actions: [
      { base: 'view_learning_paths', scopes: ['own', 'school', 'all'], label: 'Ver' },
      { base: 'create_learning_paths', scopes: ['school', 'all'], label: 'Crear' },
      { base: 'edit_learning_paths', scopes: ['own', 'school', 'all'], label: 'Editar' },
      { base: 'delete_learning_paths', scopes: ['own', 'school', 'all'], label: 'Eliminar' },
      { base: 'assign_learning_paths', scopes: ['all'], label: 'Asignar' }
    ]
  },
  {
    name: 'Courses & Content',
    actions: [
      { base: 'view_courses', scopes: ['own', 'school', 'all'], label: 'Ver' },
      { base: 'create_courses', scopes: ['school', 'all'], label: 'Crear' },
      { base: 'edit_courses', scopes: ['own', 'school', 'all'], label: 'Editar' },
      { base: 'delete_courses', scopes: ['own', 'school', 'all'], label: 'Eliminar' },
      { base: 'manage_course_content', scopes: ['all'], label: 'Gestionar Contenido' }
    ]
  },
  {
    name: 'News & Articles',
    actions: [
      { base: 'view_news', scopes: ['all'], label: 'Ver' },
      { base: 'create_news', scopes: ['all'], label: 'Crear' },
      { base: 'edit_news', scopes: ['own', 'school', 'all'], label: 'Editar' },
      { base: 'delete_news', scopes: ['own', 'school', 'all'], label: 'Eliminar' },
      { base: 'publish_news', scopes: ['own', 'school', 'all'], label: 'Publicar' }
    ]
  },
  {
    name: 'Events',
    actions: [
      { base: 'view_events', scopes: ['all'], label: 'Ver' },
      { base: 'create_events', scopes: ['school', 'all'], label: 'Crear' },
      { base: 'edit_events', scopes: ['own', 'school', 'all'], label: 'Editar' },
      { base: 'delete_events', scopes: ['own', 'school', 'all'], label: 'Eliminar' }
    ]
  },
  {
    name: 'User Management',
    actions: [
      { base: 'view_users', scopes: ['own', 'school', 'network', 'all'], label: 'Ver' },
      { base: 'create_users', scopes: ['school', 'all'], label: 'Crear' },
      { base: 'edit_users', scopes: ['own', 'school', 'all'], label: 'Editar' },
      { base: 'delete_users', scopes: ['school', 'all'], label: 'Eliminar' },
      { base: 'manage_user_roles', scopes: ['all'], label: 'Gestionar Roles' }
    ]
  },
  {
    name: 'Schools & Organizations',
    actions: [
      { base: 'view_schools', scopes: ['network', 'all'], label: 'Ver' },
      { base: 'create_schools', scopes: ['all'], label: 'Crear' },
      { base: 'edit_schools', scopes: ['own', 'network', 'all'], label: 'Editar' },
      { base: 'delete_schools', scopes: ['all'], label: 'Eliminar' },
      { base: 'manage_generations', scopes: ['school', 'all'], label: 'Gestionar Generaciones' },
      { base: 'manage_communities', scopes: ['school', 'all'], label: 'Gestionar Comunidades' }
    ]
  },
  {
    name: 'Consultants',
    actions: [
      { base: 'view_consultants', scopes: ['all'], label: 'Ver' },
      { base: 'create_consultants', scopes: ['all'], label: 'Crear' },
      { base: 'edit_consultants', scopes: ['all'], label: 'Editar' },
      { base: 'delete_consultants', scopes: ['all'], label: 'Eliminar' },
      { base: 'assign_consultants', scopes: ['school', 'all'], label: 'Asignar' }
    ]
  },
  {
    name: 'Financial Management',
    actions: [
      { base: 'view_expense_reports', scopes: ['own', 'school', 'all'], label: 'Ver Informes de Gastos' },
      { base: 'create_expense_reports', scopes: ['own', 'school', 'all'], label: 'Crear Informes de Gastos' },
      { base: 'edit_expense_reports', scopes: ['own', 'school', 'all'], label: 'Editar Informes de Gastos' },
      { base: 'approve_expense_reports', scopes: ['school', 'all'], label: 'Aprobar Informes de Gastos' },
      { base: 'view_cash_flow', scopes: ['school', 'all'], label: 'Ver Flujo de Caja' }
    ]
  },
  {
    name: 'Contracts & Internships',
    actions: [
      { base: 'view_contracts', scopes: ['own', 'school', 'all'], label: 'Ver Contratos' },
      { base: 'create_contracts', scopes: ['school', 'all'], label: 'Crear Contratos' },
      { base: 'edit_contracts', scopes: ['own', 'school', 'all'], label: 'Editar Contratos' },
      { base: 'delete_contracts', scopes: ['own', 'school', 'all'], label: 'Eliminar Contratos' },
      { base: 'view_internship_proposals', scopes: ['own', 'school', 'all'], label: 'Ver Propuestas de Pasantías' },
      { base: 'create_internship_proposals', scopes: ['school', 'all'], label: 'Crear Propuestas de Pasantías' },
      { base: 'edit_internship_proposals', scopes: ['own', 'school', 'all'], label: 'Editar Propuestas de Pasantías' },
      { base: 'approve_internship_proposals', scopes: ['school', 'all'], label: 'Aprobar Propuestas de Pasantías' }
    ]
  },
  {
    name: 'Workspace & Collaboration',
    actions: [
      { base: 'view_workspace', scopes: ['own', 'school'], label: 'Ver Workspace' },
      { base: 'create_workspace_content', scopes: ['school', 'all'], label: 'Crear Contenido' },
      { base: 'edit_workspace_content', scopes: ['own', 'all'], label: 'Editar Contenido' },
      { base: 'manage_group_assignments', scopes: ['school', 'all'], label: 'Gestionar Tareas de Grupo' }
    ]
  },
  {
    name: 'System Administration',
    actions: [],
    unscopedPermissions: ['manage_permissions', 'view_audit_logs', 'manage_system_settings', 'manage_networks', 'supervise_network_schools']
  }
];

const SCOPE_LABELS: {[key: string]: string} = {
  own: 'Propio',
  school: 'Colegio',
  generation: 'Generación',
  community: 'Comunidad',
  network: 'Red',
  all: 'Todos'
};

export default function RoleManagement() {
  const router = useRouter();
  const user = useUser();
  const session = useSession();
  const supabaseClient = useSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [permissions, setPermissions] = useState<PermissionMatrix>({});
  const [originalPermissions, setOriginalPermissions] = useState<PermissionMatrix>({});
  const [testMode, setTestMode] = useState(false);
  const [isMock, setIsMock] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingChange, setPendingChange] = useState<{role: string, permission: string, value: boolean} | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<{[key: string]: boolean}>({});

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryName]: !prev[categoryName]
    }));
  };

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
        setOriginalPermissions(JSON.parse(JSON.stringify(data.permissions))); // Deep copy
        setTestMode(data.test_mode);
        setIsMock(data.is_mock);
      }
    } catch (error) {
      console.error('Error loading permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (role: string, permission: string) => {
    const currentValue = permissions[role][permission];
    const newValue = !currentValue;

    // Check if this is a dangerous change (removing critical admin permissions)
    const criticalPermissions = [
      'manage_user_roles_all',
      'manage_permissions',
      'manage_system_settings'
    ];

    if (role === 'admin' && currentValue === true && criticalPermissions.includes(permission)) {
      setPendingChange({ role, permission, value: newValue });
      setShowConfirmModal(true);
      return;
    }

    applyPermissionChange(role, permission, newValue);
  };

  const applyPermissionChange = (role: string, permission: string, value: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [permission]: value
      }
    }));
    setHasChanges(true);
  };

  const handleConfirmDangerousChange = () => {
    if (pendingChange) {
      applyPermissionChange(pendingChange.role, pendingChange.permission, pendingChange.value);
    }
    setShowConfirmModal(false);
    setPendingChange(null);
  };

  const handleCancelChange = () => {
    setShowConfirmModal(false);
    setPendingChange(null);
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      // Calculate changes
      const changes: Array<{role_type: string, permission_key: string, granted: boolean}> = [];

      Object.keys(permissions).forEach(role => {
        Object.keys(permissions[role]).forEach(permission => {
          if (permissions[role][permission] !== originalPermissions[role][permission]) {
            changes.push({
              role_type: role,
              permission_key: permission,
              granted: permissions[role][permission]
            });
          }
        });
      });

      const response = await fetch('/api/admin/roles/permissions/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ changes })
      });

      if (response.ok) {
        setOriginalPermissions(JSON.parse(JSON.stringify(permissions)));
        setHasChanges(false);
        alert('Cambios guardados exitosamente');
      } else {
        const error = await response.json();
        alert(`Error al guardar: ${error.error}`);
      }
    } catch (error) {
      console.error('Error saving permissions:', error);
      alert('Error al guardar cambios');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelChanges = () => {
    setPermissions(JSON.parse(JSON.stringify(originalPermissions)));
    setHasChanges(false);
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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand_primary mx-auto"></div>
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
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Gestión de Roles y Permisos
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Fase 3 - Edición Completa
              </p>
            </div>
            {hasChanges && (
              <div className="flex gap-3">
                <button
                  onClick={handleCancelChanges}
                  disabled={saving}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveChanges}
                  disabled={saving}
                  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-brand_primary hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            )}
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
            <div className="bg-brand_beige border-l-4 border-brand_accent p-4 mx-6 mt-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-brand_accent" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-brand_primary">
                    <strong>Modo de Prueba Activo</strong> - Los cambios son temporales
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Permission matrix by category with scope toggles */}
          <div className="px-6 py-4">
            {/* Role Selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Seleccionar Rol para Editar
              </label>
              <select
                value={roles[0] || ''}
                onChange={(e) => {
                  // Scroll to role section or similar
                }}
                className="block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand_accent focus:border-brand_accent"
              >
                {roles.map(role => (
                  <option key={role} value={role}>
                    {role.replace(/_/g, ' ').charAt(0).toUpperCase() + role.replace(/_/g, ' ').slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-4">
              {roles.map(role => (
                <div key={role} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Role Header */}
                  <button
                    onClick={() => toggleCategory(role)}
                    className="w-full px-6 py-4 bg-brand_beige hover:bg-amber-100 flex justify-between items-center transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <svg
                        className={`h-5 w-5 text-brand_primary transition-transform ${expandedCategories[role] ? 'transform rotate-90' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="text-lg font-semibold text-gray-900">
                        {role.replace(/_/g, ' ').charAt(0).toUpperCase() + role.replace(/_/g, ' ').slice(1)}
                      </span>
                    </div>
                  </button>

                  {/* Role Content - Categories */}
                  {expandedCategories[role] && (
                    <div className="bg-white p-6 space-y-6">
                      {PERMISSION_CATEGORIES.map(category => (
                        <div key={`${role}-${category.name}`}>
                          <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-200">
                            {category.name}
                          </h3>

                          {/* Scoped Actions */}
                          {category.actions.map(action => (
                            <div key={action.base} className="mb-3 flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded">
                              <span className="text-sm text-gray-700 min-w-[200px]">{action.label}</span>
                              <div className="flex gap-2">
                                {action.scopes.map(scope => {
                                  const permissionKey = `${action.base}_${scope}`;
                                  const hasPermission = permissions[role]?.[permissionKey];

                                  return (
                                    <button
                                      key={scope}
                                      onClick={() => togglePermission(role, permissionKey)}
                                      className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                        hasPermission
                                          ? 'bg-brand_primary text-white hover:bg-gray-800'
                                          : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                      }`}
                                      title={`${hasPermission ? 'Desactivar' : 'Activar'} ${SCOPE_LABELS[scope]}`}
                                    >
                                      {SCOPE_LABELS[scope]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}

                          {/* Unscoped Permissions */}
                          {category.unscopedPermissions && category.unscopedPermissions.length > 0 && (
                            <div className="space-y-2 mt-2">
                              {category.unscopedPermissions.map(permission => {
                                const hasPermission = permissions[role]?.[permission];
                                return (
                                  <div key={permission} className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded">
                                    <span className="text-sm text-gray-700">
                                      {permission.replace(/_/g, ' ').charAt(0).toUpperCase() + permission.replace(/_/g, ' ').slice(1)}
                                    </span>
                                    <button
                                      onClick={() => togglePermission(role, permission)}
                                      className={`px-4 py-1 text-xs font-medium rounded transition-colors ${
                                        hasPermission
                                          ? 'bg-brand_accent text-white hover:bg-amber-400'
                                          : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                      }`}
                                    >
                                      {hasPermission ? 'Otorgado' : 'Denegado'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Expand/Collapse All */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  const allExpanded = roles.every(role => expandedCategories[role]);
                  const newState = roles.reduce((acc, role) => ({
                    ...acc,
                    [role]: !allExpanded
                  }), {});
                  setExpandedCategories(newState);
                }}
                className="text-sm text-brand_primary hover:text-gray-700 font-medium"
              >
                {Object.values(expandedCategories).some(v => v) ? 'Colapsar Todos' : 'Expandir Todos'}
              </button>
            </div>
          </div>

          {/* Info footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                <strong>Nota:</strong> Haz clic en los botones de alcance para cambiar permisos. Los cambios se guardan cuando presionas &quot;Guardar Cambios&quot;.
              </p>
              <div className="text-xs text-gray-500 space-y-1">
                <p><strong>Alcances:</strong></p>
                <ul className="list-disc list-inside ml-2">
                  <li><strong>Propio:</strong> Solo acceso a registros propios</li>
                  <li><strong>Colegio:</strong> Acceso a registros del colegio asignado</li>
                  <li><strong>Generación:</strong> Acceso a registros de la generación asignada</li>
                  <li><strong>Comunidad:</strong> Acceso a registros de la comunidad asignada</li>
                  <li><strong>Red:</strong> Acceso a registros de toda la red asignada</li>
                  <li><strong>Todos:</strong> Acceso a todos los registros del sistema</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Confirmation Modal for Dangerous Changes */}
    {showConfirmModal && (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
        <div className="relative bg-white rounded-lg shadow-xl max-w-md mx-auto p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-medium text-gray-900">
                Advertencia: Cambio Crítico
              </h3>
              <div className="mt-2 text-sm text-gray-500">
                <p>
                  Estás a punto de remover un permiso crítico del rol Admin ({pendingChange?.permission.replace(/_/g, ' ')}).
                  Esto podría bloquear el acceso a funciones esenciales del sistema.
                </p>
                <p className="mt-2 font-semibold">
                  ¿Estás seguro que deseas continuar?
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={handleCancelChange}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmDangerousChange}
              className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700"
            >
              Sí, Continuar
            </button>
          </div>
        </div>
      </div>
    )}
    </MainLayout>
  );
}