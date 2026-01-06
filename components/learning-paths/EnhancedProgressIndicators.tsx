import React from 'react';
import { 
  Clock, 
  TrendingUp, 
  Award, 
  Users, 
  Target, 
  Zap, 
  Calendar,
  BarChart3,
  Flame,
  BookOpen,
  Coffee,
  Timer,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Trophy,
  Activity
} from 'lucide-react';

interface EnhancedProgressData {
  userProgress: {
    status: string;
    overallProgress: number;
    totalTimeSpent: number;
    totalSessions: number;
    avgSessionMinutes: number;
    currentCourse: number;
    daysSinceLastActivity: number;
    isAtRisk: boolean;
    completionStreak: number;
    startDate: string;
  };
  pathBenchmarks?: {
    avgCompletionRate: number;
    avgCompletionTimeDays: number;
    totalEnrolledUsers: number;
    engagementScore: number;
  };
  insights: {
    paceAnalysis: any;
    engagementLevel: any;
    timeForecasting: any;
    recommendations: any[];
    milestones: any;
    peerComparison: any;
    sessionPattern: any;
    motivationalMetrics: any;
  };
}

interface Props {
  data: EnhancedProgressData;
  pathName: string;
}

export default function EnhancedProgressIndicators({ data, pathName }: Props) {
  const { userProgress, pathBenchmarks, insights } = data;

  return (
    <div className="space-y-6">
      {/* Main Progress Overview */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-navy-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Tu Progreso Inteligente
          </h3>
          {userProgress.isAtRisk && (
            <div className="flex items-center gap-2 text-orange-600 bg-orange-50 px-3 py-1 rounded-full text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Necesita atención</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Pace Analysis */}
          <div className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className={`w-5 h-5 ${insights.paceAnalysis.color}`} />
              <span className="font-medium text-gray-900">Ritmo de Aprendizaje</span>
            </div>
            <p className={`text-sm ${insights.paceAnalysis.color} font-medium`}>
              {insights.paceAnalysis.message}
            </p>
            {insights.paceAnalysis.status !== 'insufficient_data' && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Progreso esperado</span>
                  <span>{insights.paceAnalysis.expectedProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${Math.min(100, insights.paceAnalysis.expectedProgress)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Engagement Level */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Flame className={`w-5 h-5 ${insights.engagementLevel.color}`} />
              <span className="font-medium text-gray-900">Nivel de Compromiso</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-sm font-medium ${insights.engagementLevel.color}`}>
                {insights.engagementLevel.level === 'high' ? 'Alto' : 
                 insights.engagementLevel.level === 'moderate' ? 'Moderado' : 'Bajo'}
              </span>
              <span className="text-sm text-gray-600">
                ({insights.engagementLevel.score}/100)
              </span>
            </div>
            <p className="text-xs text-gray-600">
              {insights.engagementLevel.recentSessionCount} sesiones recientes
              • {insights.engagementLevel.totalRecentTimeHours}h total
            </p>
          </div>

          {/* Time Forecasting */}
          <div className="bg-gradient-to-br from-amber-50 to-amber-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-amber-600" />
              <span className="font-medium text-gray-900">Predicción</span>
            </div>
            {insights.timeForecasting.estimatedDaysRemaining ? (
              <>
                <p className="text-sm text-amber-600 font-medium">
                  {insights.timeForecasting.estimatedDaysRemaining} días restantes
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Finalización: {new Date(insights.timeForecasting.estimatedCompletionDate).toLocaleDateString('es-ES')}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-600">
                {insights.timeForecasting.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Milestones & Achievements */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-navy-900 mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-600" />
          Logros y Hitos
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {insights.milestones.milestones.map((milestone: any, index: number) => (
            <div 
              key={index}
              className={`text-center p-3 rounded-lg transition-all ${
                milestone.unlocked 
                  ? 'bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-200' 
                  : 'bg-gray-50 border border-gray-200 opacity-60'
              }`}
            >
              <div className="text-2xl mb-1">{milestone.icon}</div>
              <p className={`text-sm font-medium ${milestone.unlocked ? 'text-yellow-700' : 'text-gray-500'}`}>
                {milestone.title}
              </p>
              <p className="text-xs text-gray-600">{milestone.threshold}%</p>
              {milestone.unlocked && (
                <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto mt-1" />
              )}
            </div>
          ))}
        </div>

        {insights.milestones.nextMilestone && (
          <div className="bg-gradient-to-r from-blue-50 to-slate-50 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-blue-900">
                Próximo hito: {insights.milestones.nextMilestone.title}
              </span>
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-sm text-blue-700 mb-1">
                <span>Progreso actual</span>
                <span>{userProgress.overallProgress}% / {insights.milestones.nextMilestone.threshold}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-3">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-slate-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${(userProgress.overallProgress / insights.milestones.nextMilestone.threshold) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Learning Analytics & Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Study Pattern Analysis */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-navy-900 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-slate-600" />
            Patrón de Estudio
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Consistencia</span>
              <span className={`text-sm font-medium ${
                insights.sessionPattern.consistency === 'excellent' ? 'text-green-600' :
                insights.sessionPattern.consistency === 'good' ? 'text-yellow-600' : 'text-orange-600'
              }`}>
                {insights.sessionPattern.consistency === 'excellent' ? 'Excelente' :
                 insights.sessionPattern.consistency === 'good' ? 'Buena' : 
                 insights.sessionPattern.consistency === 'insufficient_data' ? 'Calculando...' : 'Irregular'}
              </span>
            </div>
            
            {insights.sessionPattern.preferredDay && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Día preferido</span>
                <span className="text-sm font-medium text-gray-900">
                  {insights.sessionPattern.preferredDay}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Sesiones recientes</span>
              <span className="text-sm font-medium text-gray-900">
                {insights.sessionPattern.totalSessions}
              </span>
            </div>

            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
              {insights.sessionPattern.message}
            </p>
          </div>
        </div>

        {/* Motivational Metrics */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-navy-900 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-600" />
            Estadísticas Motivacionales
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-3">
              <Clock className="w-6 h-6 text-blue-600 mx-auto mb-1" />
              <p className="text-lg font-bold text-blue-900">
                {insights.motivationalMetrics.totalTimeHours}h
              </p>
              <p className="text-xs text-blue-700">Tiempo total</p>
            </div>

            <div className="text-center bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3">
              <BookOpen className="w-6 h-6 text-green-600 mx-auto mb-1" />
              <p className="text-lg font-bold text-green-900">
                {insights.motivationalMetrics.booksEquivalent}
              </p>
              <p className="text-xs text-green-700">Libros equivalentes</p>
            </div>

            <div className="text-center bg-gradient-to-br from-amber-50 to-amber-50 rounded-lg p-3">
              <Coffee className="w-6 h-6 text-amber-600 mx-auto mb-1" />
              <p className="text-lg font-bold text-amber-900">
                {insights.motivationalMetrics.coffeeBreaksEquivalent}
              </p>
              <p className="text-xs text-amber-700">Pausas de café</p>
            </div>

            <div className="text-center bg-gradient-to-br from-orange-50 to-red-50 rounded-lg p-3">
              <Timer className="w-6 h-6 text-orange-600 mx-auto mb-1" />
              <p className="text-lg font-bold text-orange-900">
                {Math.round(insights.motivationalMetrics.longestSession)}min
              </p>
              <p className="text-xs text-orange-700">Sesión más larga</p>
            </div>
          </div>

          {userProgress.completionStreak > 0 && (
            <div className="mt-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-600" />
                <span className="font-medium text-orange-900">
                  ¡Racha de {userProgress.completionStreak} días!
                </span>
              </div>
              <p className="text-sm text-orange-700 mt-1">
                ¡Mantén el impulso para seguir creciendo!
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Peer Comparison */}
      {insights.peerComparison && pathBenchmarks && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-navy-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-600" />
            Comparación con Otros Estudiantes
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center bg-gradient-to-br from-slate-50 to-blue-50 rounded-lg p-4">
              <p className="text-2xl font-bold text-slate-900">
                {insights.peerComparison.totalPeers}
              </p>
              <p className="text-sm text-slate-700">Estudiantes totales</p>
            </div>

            <div className="text-center bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4">
              <p className="text-2xl font-bold text-green-900">
                {insights.peerComparison.pathAvgCompletion}%
              </p>
              <p className="text-sm text-green-700">Promedio de finalización</p>
            </div>

            <div className="text-center bg-gradient-to-br from-yellow-50 to-orange-50 rounded-lg p-4">
              <p className="text-2xl font-bold text-yellow-900">
                {insights.peerComparison.completedPeers}
              </p>
              <p className="text-sm text-yellow-700">Han completado la ruta</p>
            </div>
          </div>

          <div className="mt-4 bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-700 text-center">
              {insights.peerComparison.message}
            </p>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {insights.recommendations.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-navy-900 mb-4 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-600" />
            Recomendaciones Personalizadas
          </h3>
          
          <div className="space-y-3">
            {insights.recommendations.slice(0, 3).map((rec: any, index: number) => (
              <div 
                key={index}
                className={`rounded-lg p-4 border-l-4 ${
                  rec.priority === 'high' ? 'bg-red-50 border-red-400' :
                  rec.priority === 'medium' ? 'bg-yellow-50 border-yellow-400' :
                  'bg-blue-50 border-blue-400'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${
                    rec.priority === 'high' ? 'text-red-600' :
                    rec.priority === 'medium' ? 'text-yellow-600' :
                    'text-blue-600'
                  }`}>
                    {rec.type === 'activity' && <Activity className="w-5 h-5" />}
                    {rec.type === 'duration' && <Clock className="w-5 h-5" />}
                    {rec.type === 'progress' && <TrendingUp className="w-5 h-5" />}
                    {rec.type === 'celebration' && <Award className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <h4 className={`font-medium mb-1 ${
                      rec.priority === 'high' ? 'text-red-900' :
                      rec.priority === 'medium' ? 'text-yellow-900' :
                      'text-blue-900'
                    }`}>
                      {rec.title}
                    </h4>
                    <p className={`text-sm ${
                      rec.priority === 'high' ? 'text-red-700' :
                      rec.priority === 'medium' ? 'text-yellow-700' :
                      'text-blue-700'
                    }`}>
                      {rec.message}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}