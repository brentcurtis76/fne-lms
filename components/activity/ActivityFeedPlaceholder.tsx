/**
 * Activity Feed Placeholder Component
 * Shown when activity feed system is not yet available
 */

import React from 'react';
import { Activity, AlertCircle, Clock } from 'lucide-react';

const ActivityFeedPlaceholder: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-8 mb-6">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-[#fbbf24] bg-opacity-10 rounded-full flex items-center justify-center">
            <Activity className="w-8 h-8 text-[#fbbf24]" />
          </div>
          <h2 className="text-2xl font-bold text-[#0a0a0a] mb-2">
            Feed de Actividades
          </h2>
          <p className="text-gray-600 mb-6">
            Mantente al día con todas las actividades de tu comunidad
          </p>
        </div>
      </div>

      {/* System Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="w-5 h-5 text-[#fbbf24]" />
          <h3 className="text-lg font-semibold text-[#0a0a0a]">
            Sistema en Preparación
          </h3>
        </div>
        <p className="text-gray-600 mb-4">
          El sistema de seguimiento de actividades está siendo configurado para tu comunidad.
          Esto incluye:
        </p>
        <ul className="space-y-2 text-gray-600">
          <li className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#fbbf24] rounded-full"></div>
            Timeline unificado de todas las actividades
          </li>
          <li className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#fbbf24] rounded-full"></div>
            Notificaciones personalizables
          </li>
          <li className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#fbbf24] rounded-full"></div>
            Análisis de participación y engagement
          </li>
          <li className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#fbbf24] rounded-full"></div>
            Filtros avanzados por tipo de actividad
          </li>
        </ul>
      </div>

      {/* Alternative Activities */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="w-5 h-5 text-[#0a0a0a]" />
          <h3 className="text-lg font-semibold text-[#0a0a0a]">
            Mientras Tanto
          </h3>
        </div>
        <p className="text-gray-600 mb-4">
          Puedes continuar utilizando las otras funcionalidades del espacio colaborativo:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-[#0a0a0a] mb-2">📅 Reuniones</h4>
            <p className="text-sm text-gray-600">
              Documenta reuniones y gestiona compromisos
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-[#0a0a0a] mb-2">📁 Documentos</h4>
            <p className="text-sm text-gray-600">
              Comparte y organiza archivos con tu equipo
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-[#0a0a0a] mb-2">💬 Mensajería</h4>
            <p className="text-sm text-gray-600">
              Comunícate en tiempo real con la comunidad
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivityFeedPlaceholder;