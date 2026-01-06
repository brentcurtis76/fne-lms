import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';
import { Bell, Mail, Clock, Shield, Loader2, Save, RefreshCw, Check, X } from 'lucide-react';

interface NotificationPreference {
  in_app_enabled: boolean;
  email_enabled: boolean;
  frequency: 'immediate' | 'daily' | 'weekly' | 'never';
  priority: 'high' | 'medium' | 'low';
}

interface GlobalSettings {
  email_frequency: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  weekend_quiet: boolean;
  priority_override: boolean;
  auto_group: boolean;
  max_per_hour: number;
  do_not_disturb: boolean;
  mobile_optimization: boolean;
}

interface UserPreferencesProps {
  userId: string;
}

const notificationTypes = [
  // Courses
  { key: 'course_enrolled', name: 'Inscripción en curso', category: 'courses', priority: 'high' },
  { key: 'course_completed', name: 'Curso completado', category: 'courses', priority: 'medium' },
  { key: 'course_updated', name: 'Actualización de curso', category: 'courses', priority: 'low' },
  { key: 'course_progress_update', name: 'Progreso del curso', category: 'courses', priority: 'medium' },
  
  // Assignments
  { key: 'assignment_created', name: 'Nueva tarea asignada', category: 'assignments', priority: 'high' },
  { key: 'assignment_due_reminder', name: 'Recordatorio de entrega', category: 'assignments', priority: 'high' },
  { key: 'assignment_graded', name: 'Tarea calificada', category: 'assignments', priority: 'medium' },
  
  // Messaging
  { key: 'message_received', name: 'Mensaje recibido', category: 'messaging', priority: 'high' },
  { key: 'comment_received', name: 'Comentario recibido', category: 'messaging', priority: 'medium' },
  
  // Social
  { key: 'team_member_added', name: 'Nuevo miembro del equipo', category: 'social', priority: 'medium' },
  { key: 'team_member_removed', name: 'Miembro removido del equipo', category: 'social', priority: 'medium' },
  
  // Feedback
  { key: 'feedback_received', name: 'Retroalimentación recibida', category: 'feedback', priority: 'high' },
  
  // System
  { key: 'system_update', name: 'Actualización del sistema', category: 'system', priority: 'low' },
  { key: 'general_announcement', name: 'Anuncio general', category: 'system', priority: 'medium' },
  { key: 'session_reminder', name: 'Recordatorio de sesión', category: 'system', priority: 'medium' },
  
  // Admin
  { key: 'user_management', name: 'Gestión de usuarios', category: 'admin', priority: 'high' },
  { key: 'consultant_assigned', name: 'Consultor asignado', category: 'admin', priority: 'high' },
  
  // Profile
  { key: 'profile_updated', name: 'Perfil actualizado', category: 'profile', priority: 'low' },
  { key: 'permission_granted', name: 'Permiso otorgado', category: 'profile', priority: 'medium' },
  { key: 'permission_revoked', name: 'Permiso revocado', category: 'profile', priority: 'medium' },
];

const categoryLabels: Record<string, string> = {
  courses: 'Cursos',
  assignments: 'Tareas',
  messaging: 'Mensajería',
  social: 'Social',
  feedback: 'Retroalimentación',
  system: 'Sistema',
  admin: 'Administración',
  profile: 'Perfil',
};

const priorityColors: Record<string, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
};

const priorityLabels: Record<string, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export default function UserPreferences({ userId }: UserPreferencesProps) {
  const supabase = useSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<Record<string, NotificationPreference>>({});
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    email_frequency: 'immediate',
    quiet_hours_start: '22:00',
    quiet_hours_end: '07:00',
    weekend_quiet: false,
    priority_override: true,
    auto_group: true,
    max_per_hour: 5,
    do_not_disturb: false,
    mobile_optimization: false,
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchPreferences();
  }, [userId]);

  const fetchPreferences = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/user/notification-preferences', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.preferences) {
          setPreferences(data.preferences);
        }
        if (data.global_settings) {
          setGlobalSettings(data.global_settings);
        }
      }
    } catch (error) {
      console.error('Error fetching preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePreferenceChange = (
    notificationType: string,
    field: keyof NotificationPreference,
    value: any
  ) => {
    setPreferences(prev => ({
      ...prev,
      [notificationType]: {
        ...prev[notificationType],
        [field]: value,
      },
    }));
    setHasChanges(true);
  };

  const handleGlobalSettingChange = (field: keyof GlobalSettings, value: any) => {
    setGlobalSettings(prev => ({
      ...prev,
      [field]: value,
    }));
    setHasChanges(true);
  };

  const savePreferences = async () => {
    setSaving(true);
    setSuccessMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Save notification preferences
      const response = await fetch('/api/user/notification-preferences', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferences,
          global_settings: globalSettings,
        }),
      });

      if (response.ok) {
        setHasChanges(false);
        setSuccessMessage('Preferencias guardadas exitosamente');
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleAllNotifications = (enabled: boolean) => {
    const updatedPreferences: Record<string, NotificationPreference> = {};
    
    notificationTypes.forEach(type => {
      updatedPreferences[type.key] = {
        ...preferences[type.key],
        in_app_enabled: enabled,
        email_enabled: enabled,
      };
    });
    
    setPreferences(updatedPreferences);
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#0a0a0a]" />
        <span className="ml-2 text-gray-600">Cargando preferencias...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Preferencias de Notificaciones
          </h3>
          <p className="text-gray-600">
            Personaliza cómo y cuándo recibes notificaciones de la plataforma.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {successMessage && (
            <span className="flex items-center text-green-600">
              <Check className="w-4 h-4 mr-1" />
              {successMessage}
            </span>
          )}
          <button
            onClick={savePreferences}
            disabled={!hasChanges || saving}
            className={`flex items-center space-x-2 px-4 py-2 rounded transition-colors ${
              hasChanges
                ? 'bg-[#fbbf24] text-gray-900 hover:bg-[#fdc655]'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>Guardar cambios</span>
          </button>
        </div>
      </div>

      {/* Quick Settings */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center">
          <Shield className="w-5 h-5 mr-2 text-gray-600" />
          Controles Maestros
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex items-center space-x-3 p-3 bg-white rounded border border-gray-200 cursor-pointer hover:border-gray-300">
            <input
              type="checkbox"
              checked={globalSettings.do_not_disturb}
              onChange={(e) => handleGlobalSettingChange('do_not_disturb', e.target.checked)}
              className="w-4 h-4 text-[#0a0a0a] rounded focus:ring-[#0a0a0a]"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">No Molestar</span>
              <p className="text-xs text-gray-500">Desactiva todas las notificaciones temporalmente</p>
            </div>
          </label>

          <label className="flex items-center space-x-3 p-3 bg-white rounded border border-gray-200 cursor-pointer hover:border-gray-300">
            <input
              type="checkbox"
              checked={globalSettings.mobile_optimization}
              onChange={(e) => handleGlobalSettingChange('mobile_optimization', e.target.checked)}
              className="w-4 h-4 text-[#0a0a0a] rounded focus:ring-[#0a0a0a]"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Optimización Móvil</span>
              <p className="text-xs text-gray-500">Reduce notificaciones en dispositivos móviles</p>
            </div>
          </label>

          <label className="flex items-center space-x-3 p-3 bg-white rounded border border-gray-200 cursor-pointer hover:border-gray-300">
            <input
              type="checkbox"
              checked={globalSettings.auto_group}
              onChange={(e) => handleGlobalSettingChange('auto_group', e.target.checked)}
              className="w-4 h-4 text-[#0a0a0a] rounded focus:ring-[#0a0a0a]"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Agrupación Inteligente</span>
              <p className="text-xs text-gray-500">Agrupa notificaciones similares</p>
            </div>
          </label>
        </div>

        <div className="mt-4 flex space-x-4">
          <button
            onClick={() => toggleAllNotifications(true)}
            className="text-sm text-[#0a0a0a] hover:text-[#004a7a] font-medium"
          >
            Activar todas
          </button>
          <button
            onClick={() => toggleAllNotifications(false)}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Desactivar todas
          </button>
        </div>
      </div>

      {/* Notification Matrix */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h4 className="text-sm font-medium text-gray-900">
            Configuración por Tipo de Notificación
          </h4>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo de Notificación
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  En App
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Frecuencia
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prioridad
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(
                notificationTypes.reduce((acc, type) => {
                  if (!acc[type.category]) acc[type.category] = [];
                  acc[type.category].push(type);
                  return acc;
                }, {} as Record<string, typeof notificationTypes>)
              ).map(([category, types]) => (
                <React.Fragment key={category}>
                  <tr className="bg-gray-50">
                    <td colSpan={5} className="px-6 py-2 text-sm font-medium text-gray-700">
                      {categoryLabels[category]}
                    </td>
                  </tr>
                  {types.map((type) => {
                    const pref = preferences[type.key] || {
                      in_app_enabled: true,
                      email_enabled: false,
                      frequency: 'immediate',
                      priority: type.priority,
                    };
                    
                    return (
                      <tr key={type.key} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {type.name}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => handlePreferenceChange(type.key, 'in_app_enabled', !pref.in_app_enabled)}
                            className={`w-12 h-6 rounded-full transition-colors ${
                              pref.in_app_enabled ? 'bg-[#0a0a0a]' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                                pref.in_app_enabled ? 'translate-x-6' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => handlePreferenceChange(type.key, 'email_enabled', !pref.email_enabled)}
                            className={`w-12 h-6 rounded-full transition-colors ${
                              pref.email_enabled ? 'bg-[#0a0a0a]' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                                pref.email_enabled ? 'translate-x-6' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={pref.frequency}
                            onChange={(e) => handlePreferenceChange(type.key, 'frequency', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-3 py-1 focus:outline-none focus:ring-1 focus:ring-[#0a0a0a]"
                          >
                            <option value="immediate">Inmediato</option>
                            <option value="daily">Diario</option>
                            <option value="weekly">Semanal</option>
                            <option value="never">Nunca</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityColors[pref.priority]}`}>
                            {priorityLabels[pref.priority]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="space-y-6">
        {/* Quiet Hours */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center">
            <Clock className="w-5 h-5 mr-2 text-gray-600" />
            Horarios Silenciosos
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">Desde:</label>
              <input
                type="time"
                value={globalSettings.quiet_hours_start}
                onChange={(e) => handleGlobalSettingChange('quiet_hours_start', e.target.value)}
                className="border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#0a0a0a]"
              />
              <label className="text-sm font-medium text-gray-700">Hasta:</label>
              <input
                type="time"
                value={globalSettings.quiet_hours_end}
                onChange={(e) => handleGlobalSettingChange('quiet_hours_end', e.target.value)}
                className="border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#0a0a0a]"
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={globalSettings.weekend_quiet}
                  onChange={(e) => handleGlobalSettingChange('weekend_quiet', e.target.checked)}
                  className="w-4 h-4 text-[#0a0a0a] rounded focus:ring-[#0a0a0a]"
                />
                <span className="text-sm text-gray-700">Incluir fines de semana</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={globalSettings.priority_override}
                  onChange={(e) => handleGlobalSettingChange('priority_override', e.target.checked)}
                  className="w-4 h-4 text-[#0a0a0a] rounded focus:ring-[#0a0a0a]"
                />
                <span className="text-sm text-gray-700">Permitir notificaciones prioritarias</span>
              </label>
            </div>
          </div>
        </div>

        {/* Email Settings */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center">
            <Mail className="w-5 h-5 mr-2 text-gray-600" />
            Configuración de Email
          </h4>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Frecuencia de resumen por email:</label>
              <select
                value={globalSettings.email_frequency}
                onChange={(e) => handleGlobalSettingChange('email_frequency', e.target.value)}
                className="mt-1 block w-full md:w-auto border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#0a0a0a]"
              >
                <option value="immediate">Inmediato (al momento)</option>
                <option value="daily">Resumen diario (9 AM)</option>
                <option value="weekly">Resumen semanal (Lunes 9 AM)</option>
                <option value="never">Nunca (email desactivado)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Smart Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center">
            <Bell className="w-5 h-5 mr-2 text-gray-600" />
            Filtros Inteligentes
          </h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Máximo de notificaciones por hora:
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={globalSettings.max_per_hour}
                onChange={(e) => handleGlobalSettingChange('max_per_hour', parseInt(e.target.value))}
                className="w-20 border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#0a0a0a]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <Bell className="h-5 w-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-blue-900 mb-1">
              Acerca de las preferencias
            </h4>
            <p className="text-sm text-blue-700">
              Las preferencias se aplican inmediatamente. Las notificaciones marcadas como "Alta prioridad" 
              siempre se enviarán durante los horarios silenciosos si tienes activada esa opción. 
              Los resúmenes por email se envían según la frecuencia que elijas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}