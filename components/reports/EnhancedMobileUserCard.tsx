import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface EnhancedMobileUserCardProps {
  user: {
    user_id: string;
    user_name: string;
    user_email: string;
    user_role: string;
    school_name?: string;
    generation_name?: string;
    community_name?: string;
    total_courses_enrolled: number;
    completed_courses: number;
    courses_in_progress: number;
    total_lessons_completed: number;
    completion_percentage: number;
    total_time_spent_minutes: number;
    average_quiz_score?: number;
    last_activity_date?: string;
  };
  onUserClick: (userId: string) => void;
  formatTime: (minutes: number) => string;
  formatDate: (date?: string) => string;
  className?: string;
}

export default function EnhancedMobileUserCard({
  user,
  onUserClick,
  formatTime,
  formatDate,
  className = ""
}: EnhancedMobileUserCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 60) return 'bg-[#fdb933]';
    if (percentage >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getActivityStatus = (lastActivity?: string) => {
    if (!lastActivity) return { status: 'Nunca', color: 'text-red-500', dot: 'bg-red-500' };
    
    const date = new Date(lastActivity);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));
    
    if (diffDays === 0) return { status: 'Hoy', color: 'text-green-500', dot: 'bg-green-500' };
    if (diffDays === 1) return { status: 'Ayer', color: 'text-green-500', dot: 'bg-green-500' };
    if (diffDays <= 7) return { status: `${diffDays}d`, color: 'text-yellow-500', dot: 'bg-yellow-500' };
    if (diffDays <= 30) return { status: `${diffDays}d`, color: 'text-orange-500', dot: 'bg-orange-500' };
    return { status: `${diffDays}d`, color: 'text-red-500', dot: 'bg-red-500' };
  };

  const activityStatus = getActivityStatus(user.last_activity_date);

  return (
    <motion.div
      layout
      className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${className}`}
      whileHover={{ scale: 1.02, boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)" }}
      transition={{ duration: 0.2 }}
    >
      {/* Header - Always Visible */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-900 truncate">
                {user.user_name}
              </h3>
              <div className={`w-2 h-2 rounded-full ${activityStatus.dot}`}></div>
            </div>
            <p className="text-xs text-gray-500 truncate mb-2">{user.user_email}</p>
            
            {/* Progress Bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span>Progreso</span>
                <span className="font-medium">{user.completion_percentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <motion.div
                  className={`h-2 rounded-full ${getProgressColor(user.completion_percentage)}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, user.completion_percentage)}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-blue-50 rounded p-2">
                <div className="text-xs font-semibold text-blue-600">{user.completed_courses}</div>
                <div className="text-xs text-blue-500">Completados</div>
              </div>
              <div className="bg-green-50 rounded p-2">
                <div className="text-xs font-semibold text-green-600">{user.total_lessons_completed}</div>
                <div className="text-xs text-green-500">Lecciones</div>
              </div>
              <div className="bg-orange-50 rounded p-2">
                <div className="text-xs font-semibold text-orange-600">{formatTime(user.total_time_spent_minutes)}</div>
                <div className="text-xs text-orange-500">Tiempo</div>
              </div>
            </div>
          </div>

          {/* Expand Button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="ml-2 p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label={isExpanded ? "Colapsar" : "Expandir"}
          >
            <motion.svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </motion.svg>
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="border-t border-gray-100 overflow-hidden"
          >
            <div className="p-4 space-y-4">
              {/* Organization Info */}
              {(user.school_name || user.generation_name || user.community_name) && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Organización</h4>
                  <div className="space-y-1">
                    {user.school_name && (
                      <div className="flex items-center text-sm">
                        <span className="text-gray-400 mr-2">🏫</span>
                        <span>{user.school_name}</span>
                      </div>
                    )}
                    {user.generation_name && (
                      <div className="flex items-center text-sm">
                        <span className="text-gray-400 mr-2">📚</span>
                        <span>{user.generation_name}</span>
                      </div>
                    )}
                    {user.community_name && (
                      <div className="flex items-center text-sm">
                        <span className="text-gray-400 mr-2">👥</span>
                        <span>{user.community_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Detailed Stats */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Estadísticas Detalladas</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded p-3">
                    <div className="text-sm font-semibold text-gray-900">{user.total_courses_enrolled}</div>
                    <div className="text-xs text-gray-500">Cursos Inscritos</div>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <div className="text-sm font-semibold text-gray-900">{user.courses_in_progress}</div>
                    <div className="text-xs text-gray-500">En Progreso</div>
                  </div>
                  {user.average_quiz_score && (
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-sm font-semibold text-gray-900">{user.average_quiz_score}%</div>
                      <div className="text-xs text-gray-500">Promedio Quiz</div>
                    </div>
                  )}
                  <div className="bg-gray-50 rounded p-3">
                    <div className={`text-sm font-semibold ${activityStatus.color}`}>
                      {formatDate(user.last_activity_date)}
                    </div>
                    <div className="text-xs text-gray-500">Última Actividad</div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2">
                <button
                  onClick={() => onUserClick(user.user_id)}
                  className="w-full bg-[#00365b] text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-[#00365b]/90 transition-colors active:scale-95"
                >
                  Ver Detalles Completos
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}