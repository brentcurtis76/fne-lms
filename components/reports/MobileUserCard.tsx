import React from 'react';

interface MobileUserCardProps {
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
    activity_score?: number;
    engagement_quality?: 'high' | 'medium' | 'low' | 'passive';
    score_breakdown?: {
      lessons: number;
      time: number;
      recency: number;
      courses: number;
    };
  };
  onUserClick: (userId: string) => void;
  formatTime: (minutes: number) => string;
  formatDate: (dateString?: string) => string;
}

const MobileUserCard: React.FC<MobileUserCardProps> = ({
  user,
  onUserClick,
  formatTime,
  formatDate
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-3">
      {/* User Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 text-sm">{user.user_name}</h3>
          <p className="text-xs text-gray-500 mt-1">{user.user_email}</p>
          <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full mt-1">
            {user.user_role}
          </span>
        </div>
        <button
          onClick={() => onUserClick(user.user_id)}
          className="text-blue-600 text-sm font-medium whitespace-nowrap ml-2"
        >
          Ver Detalles
        </button>
      </div>

      {/* Organization Info */}
      {(user.school_name || user.generation_name || user.community_name) && (
        <div className="mb-3 space-y-1">
          {user.school_name && (
            <div className="flex items-center text-xs text-gray-600">
              <span className="mr-1">🏫</span>
              <span>{user.school_name}</span>
            </div>
          )}
          {user.generation_name && (
            <div className="flex items-center text-xs text-gray-600">
              <span className="mr-1">📚</span>
              <span>{user.generation_name}</span>
            </div>
          )}
          {user.community_name && (
            <div className="flex items-center text-xs text-gray-600">
              <span className="mr-1">👥</span>
              <span>{user.community_name}</span>
            </div>
          )}
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-700">Progreso General</span>
          <span className="text-xs text-gray-600">{user.completion_percentage}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, user.completion_percentage)}%` }}
          ></div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-gray-500">
            {user.total_lessons_completed} lecciones completadas
          </p>
          {/* Quality indicator */}
          {user.engagement_quality === 'passive' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
              ⚠️ Revisar
            </span>
          )}
          {user.engagement_quality === 'high' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              ✓ Activo
            </span>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-gray-50 rounded-lg p-2">
          <div className="text-lg font-semibold text-gray-900">{user.total_courses_enrolled}</div>
          <div className="text-xs text-gray-600">Cursos Inscritos</div>
          <div className="text-xs text-gray-500 mt-1">
            {user.completed_courses} completados • {user.courses_in_progress} en progreso
          </div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-2">
          <div className="text-lg font-semibold text-gray-900">
            {formatTime(user.total_time_spent_minutes)}
          </div>
          <div className="text-xs text-gray-600">Tiempo Total</div>
          {user.average_quiz_score && (
            <div className="text-xs text-gray-500 mt-1">
              Quiz: {user.average_quiz_score}%
            </div>
          )}
        </div>
      </div>

      {/* Last Activity */}
      <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
        <span>Última actividad:</span>
        <span className="font-medium">{formatDate(user.last_activity_date)}</span>
      </div>
    </div>
  );
};

export default MobileUserCard;