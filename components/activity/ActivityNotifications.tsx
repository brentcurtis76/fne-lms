/**
 * ActivityNotifications Component
 * Notification preferences modal for activity subscriptions
 * Phase 5 of Collaborative Workspace System for Genera
 */

import React, { useState, useCallback, useEffect } from 'react';
import { 
  X, 
  Bell, 
  BellOff, 
  Mail, 
  Smartphone, 
  Clock, 
  Filter,
  Save,
  Settings,
  Volume2,
  VolumeX,
  Moon,
  Sun,
  Zap
} from 'lucide-react';
import {
  ActivityNotificationsProps,
  ActivitySubscription,
  ActivityType,
  EntityType,
  NotificationMethod,
  ACTIVITY_TYPE_CONFIG,
  IMPORTANCE_LEVELS
} from '../../types/activity';

const ActivityNotifications: React.FC<ActivityNotificationsProps> = ({
  subscription,
  onSubscriptionUpdate,
  availableTypes,
  availableEntities,
  isOpen,
  onClose
}) => {
  const [localSubscription, setLocalSubscription] = useState<Partial<ActivitySubscription>>(subscription);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'types' | 'methods' | 'schedule'>('types');

  // Update local state when subscription changes
  useEffect(() => {
    setLocalSubscription(subscription);
  }, [subscription]);

  // Handle save
  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      await onSubscriptionUpdate(localSubscription);
      onClose();
    } catch (error) {
      console.error('Error saving subscription:', error);
    } finally {
      setSaving(false);
    }
  }, [localSubscription, onSubscriptionUpdate, onClose]);

  // Handle activity type toggle
  const handleActivityTypeToggle = useCallback((activityType: ActivityType) => {
    setLocalSubscription(prev => ({
      ...prev,
      activity_types: prev.activity_types?.includes(activityType)
        ? prev.activity_types.filter(t => t !== activityType)
        : [...(prev.activity_types || []), activityType]
    }));
  }, []);

  // Handle entity type toggle
  const handleEntityTypeToggle = useCallback((entityType: EntityType) => {
    setLocalSubscription(prev => ({
      ...prev,
      entity_types: prev.entity_types?.includes(entityType)
        ? prev.entity_types.filter(t => t !== entityType)
        : [...(prev.entity_types || []), entityType]
    }));
  }, []);

  // Handle notification method toggle
  const handleNotificationMethodToggle = useCallback((method: NotificationMethod) => {
    setLocalSubscription(prev => ({
      ...prev,
      notification_methods: prev.notification_methods?.includes(method)
        ? prev.notification_methods.filter(m => m !== method)
        : [...(prev.notification_methods || []), method]
    }));
  }, []);

  // Handle field updates
  const handleFieldUpdate = useCallback((field: keyof ActivitySubscription, value: any) => {
    setLocalSubscription(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  // Handle quick presets
  const handlePreset = useCallback((preset: 'all' | 'important' | 'minimal' | 'off') => {
    switch (preset) {
      case 'all':
        setLocalSubscription(prev => ({
          ...prev,
          activity_types: availableTypes,
          entity_types: availableEntities,
          notification_methods: ['in_app', 'email'],
          importance_threshold: 1,
          is_enabled: true
        }));
        break;
      case 'important':
        setLocalSubscription(prev => ({
          ...prev,
          activity_types: availableTypes.filter(type => 
            ACTIVITY_TYPE_CONFIG[type]?.generates_notification && 
            ACTIVITY_TYPE_CONFIG[type]?.default_importance >= 3
          ),
          notification_methods: ['in_app'],
          importance_threshold: 3,
          is_enabled: true
        }));
        break;
      case 'minimal':
        setLocalSubscription(prev => ({
          ...prev,
          activity_types: ['meeting_created', 'task_assigned', 'document_uploaded'],
          notification_methods: ['in_app'],
          importance_threshold: 4,
          is_enabled: true
        }));
        break;
      case 'off':
        setLocalSubscription(prev => ({
          ...prev,
          is_enabled: false
        }));
        break;
    }
  }, [availableTypes, availableEntities]);

  if (!isOpen) return null;

  const notificationMethodOptions = [
    {
      id: 'in_app' as NotificationMethod,
      label: 'En la aplicación',
      description: 'Notificaciones dentro de la plataforma',
      icon: <Bell className="w-4 h-4" />
    },
    {
      id: 'email' as NotificationMethod,
      label: 'Correo electrónico',
      description: 'Notificaciones por email',
      icon: <Mail className="w-4 h-4" />
    },
    {
      id: 'push' as NotificationMethod,
      label: 'Push (móvil)',
      description: 'Notificaciones push en dispositivos móviles',
      icon: <Smartphone className="w-4 h-4" />
    }
  ];

  // Group activity types by category
  const activityTypesByCategory = {
    meeting: availableTypes.filter(type => ACTIVITY_TYPE_CONFIG[type]?.category === 'meeting'),
    document: availableTypes.filter(type => ACTIVITY_TYPE_CONFIG[type]?.category === 'document'),
    message: availableTypes.filter(type => ACTIVITY_TYPE_CONFIG[type]?.category === 'message'),
    user: availableTypes.filter(type => ACTIVITY_TYPE_CONFIG[type]?.category === 'user'),
    system: availableTypes.filter(type => ACTIVITY_TYPE_CONFIG[type]?.category === 'system')
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative inline-block w-full max-w-4xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#0a0a0a] bg-opacity-10 rounded-lg">
                <Bell className="w-6 h-6 text-[#0a0a0a]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#0a0a0a]">
                  Preferencias de Notificaciones
                </h3>
                <p className="text-sm text-gray-600">
                  Configura qué actividades quieres recibir y cómo
                </p>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick presets */}
          <div className="py-4 border-b border-gray-200">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Configuraciones Rápidas</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <button
                onClick={() => handlePreset('all')}
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-[#fbbf24] hover:bg-[#fbbf24] hover:bg-opacity-5 transition-colors text-left"
              >
                <Volume2 className="w-4 h-4 text-blue-600" />
                <div>
                  <div className="text-sm font-medium">Todo</div>
                  <div className="text-xs text-gray-600">Todas las notificaciones</div>
                </div>
              </button>
              
              <button
                onClick={() => handlePreset('important')}
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-[#fbbf24] hover:bg-[#fbbf24] hover:bg-opacity-5 transition-colors text-left"
              >
                <Zap className="w-4 h-4 text-yellow-600" />
                <div>
                  <div className="text-sm font-medium">Importante</div>
                  <div className="text-xs text-gray-600">Solo actividades importantes</div>
                </div>
              </button>
              
              <button
                onClick={() => handlePreset('minimal')}
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-[#fbbf24] hover:bg-[#fbbf24] hover:bg-opacity-5 transition-colors text-left"
              >
                <BellOff className="w-4 h-4 text-gray-600" />
                <div>
                  <div className="text-sm font-medium">Mínimal</div>
                  <div className="text-xs text-gray-600">Solo lo esencial</div>
                </div>
              </button>
              
              <button
                onClick={() => handlePreset('off')}
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-red-300 hover:bg-red-50 transition-colors text-left"
              >
                <VolumeX className="w-4 h-4 text-red-600" />
                <div>
                  <div className="text-sm font-medium">Desactivar</div>
                  <div className="text-xs text-gray-600">Sin notificaciones</div>
                </div>
              </button>
            </div>
          </div>

          {/* Master toggle */}
          <div className="py-4 border-b border-gray-200">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-[#0a0a0a]" />
                <div>
                  <div className="font-medium text-gray-900">Notificaciones Activadas</div>
                  <div className="text-sm text-gray-600">Activar o desactivar todas las notificaciones</div>
                </div>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={localSubscription.is_enabled || false}
                  onChange={(e) => handleFieldUpdate('is_enabled', e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-12 h-6 rounded-full transition-colors ${
                  localSubscription.is_enabled ? 'bg-[#fbbf24]' : 'bg-gray-200'
                }`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                    localSubscription.is_enabled ? 'translate-x-6' : 'translate-x-0.5'
                  } mt-0.5`} />
                </div>
              </div>
            </label>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('types')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'types'
                    ? 'border-[#fbbf24] text-[#0a0a0a]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Tipos de Actividad
              </button>
              <button
                onClick={() => setActiveTab('methods')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'methods'
                    ? 'border-[#fbbf24] text-[#0a0a0a]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Métodos de Notificación
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'schedule'
                    ? 'border-[#fbbf24] text-[#0a0a0a]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Horarios y Frecuencia
              </button>
            </nav>
          </div>

          {/* Tab content */}
          <div className="py-6 max-h-96 overflow-y-auto">
            {/* Activity types tab */}
            {activeTab === 'types' && (
              <div className="space-y-6">
                {Object.entries(activityTypesByCategory).map(([category, types]) => (
                  <div key={category} className="space-y-3">
                    <h4 className="font-medium text-gray-900 capitalize">
                      {category === 'meeting' ? 'Reuniones' :
                       category === 'document' ? 'Documentos' :
                       category === 'message' ? 'Mensajes' :
                       category === 'user' ? 'Usuarios' : 'Sistema'}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {types.map((type) => {
                        const config = ACTIVITY_TYPE_CONFIG[type];
                        return (
                          <label
                            key={type}
                            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-[#fbbf24] cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={localSubscription.activity_types?.includes(type) || false}
                              onChange={() => handleActivityTypeToggle(type)}
                              disabled={!localSubscription.is_enabled}
                              className="rounded border-gray-300 text-[#fbbf24] focus:ring-[#fbbf24] disabled:opacity-50"
                            />
                            <div className="flex items-center gap-2 flex-1">
                              <span role="img" aria-label={config?.label || type}>
                                {config?.icon || '📝'}
                              </span>
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {config?.label || type}
                                </div>
                                {config?.generates_notification && (
                                  <div className="text-xs text-gray-500">
                                    Importancia: {config.default_importance}/5
                                  </div>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Notification methods tab */}
            {activeTab === 'methods' && (
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-4">Métodos de Notificación</h4>
                  <div className="space-y-3">
                    {notificationMethodOptions.map((method) => (
                      <label
                        key={method.id}
                        className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-[#fbbf24] cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={localSubscription.notification_methods?.includes(method.id) || false}
                          onChange={() => handleNotificationMethodToggle(method.id)}
                          disabled={!localSubscription.is_enabled}
                          className="rounded border-gray-300 text-[#fbbf24] focus:ring-[#fbbf24] disabled:opacity-50"
                        />
                        <div className="flex items-center gap-3 flex-1">
                          <div className="p-2 bg-gray-50 rounded-lg">
                            {method.icon}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {method.label}
                            </div>
                            <div className="text-xs text-gray-500">
                              {method.description}
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-4">Umbral de Importancia</h4>
                  <div className="space-y-2">
                    <label className="block text-sm text-gray-700">
                      Solo notificar actividades con importancia mínima de:
                    </label>
                    <select
                      value={localSubscription.importance_threshold || 1}
                      onChange={(e) => handleFieldUpdate('importance_threshold', parseInt(e.target.value))}
                      disabled={!localSubscription.is_enabled}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent disabled:opacity-50"
                    >
                      {IMPORTANCE_LEVELS.map((level) => (
                        <option key={level.score} value={level.score}>
                          {level.score} - {level.label} ({level.description})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Schedule tab */}
            {activeTab === 'schedule' && (
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-4">Resúmenes Periódicos</h4>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localSubscription.daily_digest || false}
                        onChange={(e) => handleFieldUpdate('daily_digest', e.target.checked)}
                        disabled={!localSubscription.is_enabled}
                        className="rounded border-gray-300 text-[#fbbf24] focus:ring-[#fbbf24] disabled:opacity-50"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Resumen Diario</div>
                        <div className="text-xs text-gray-500">Recibe un resumen de actividades cada día</div>
                      </div>
                    </label>
                    
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localSubscription.weekly_digest || false}
                        onChange={(e) => handleFieldUpdate('weekly_digest', e.target.checked)}
                        disabled={!localSubscription.is_enabled}
                        className="rounded border-gray-300 text-[#fbbf24] focus:ring-[#fbbf24] disabled:opacity-50"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Resumen Semanal</div>
                        <div className="text-xs text-gray-500">Recibe un resumen de actividades cada semana</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-4">Horario Silencioso</h4>
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">
                      No recibir notificaciones durante estas horas (opcional)
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Desde</label>
                        <input
                          type="time"
                          value={localSubscription.quiet_hours_start || ''}
                          onChange={(e) => handleFieldUpdate('quiet_hours_start', e.target.value)}
                          disabled={!localSubscription.is_enabled}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Hasta</label>
                        <input
                          type="time"
                          value={localSubscription.quiet_hours_end || ''}
                          onChange={(e) => handleFieldUpdate('quiet_hours_end', e.target.value)}
                          disabled={!localSubscription.is_enabled}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              {localSubscription.activity_types?.length || 0} tipos de actividad seleccionados
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-[#0a0a0a] text-white rounded-lg hover:bg-[#0a0a0a]/90 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Guardando...' : 'Guardar Preferencias'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivityNotifications;