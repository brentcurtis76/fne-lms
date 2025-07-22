import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer 
} from 'recharts';
import { 
  Clock, 
  Users, 
  Target, 
  TrendingUp, 
  Activity,
  AlertTriangle,
  Map
} from 'lucide-react';

interface LearningPathAnalyticsProps {
  selectedPath?: string;
  dateRange?: number;
}

interface AnalyticsData {
  summary?: {
    totalPaths: number;
    totalAssignedUsers: number;
    totalCompletedUsers: number;
    averageCompletionRate: number;
    totalTimeSpentHours: number;
  };
  pathPerformance?: Array<{
    pathName: string;
    completionRate: number;
    totalUsers: number;
    engagementScore: number;
  }>;
  completionTrends?: Array<{
    date: string;
    completions: number;
    avgTimeSpent: number;
  }>;
  courseProgression?: Array<{
    courseName: string;
    sequenceOrder: number;
    completionRate: number;
    dropoffRate: number;
  }>;
  lowPerformingPaths?: Array<{
    pathName: string;
    completionRate: number;
    totalUsers: number;
  }>;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];

export default function LearningPathAnalytics({ selectedPath, dateRange = 30 }: LearningPathAnalyticsProps) {
  const [data, setData] = useState<AnalyticsData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, [selectedPath, dateRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        dateRange: dateRange.toString()
      });

      if (selectedPath) {
        params.append('pathId', selectedPath);
      }

      const response = await fetch(`/api/learning-paths/analytics?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch analytics data');
      }

      const analyticsData = await response.json();
      setData(analyticsData);
    } catch (err: any) {
      console.error('Analytics fetch error:', err);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-gray-200 h-40 rounded-lg"></div>
        <div className="animate-pulse bg-gray-200 h-60 rounded-lg"></div>
        <div className="animate-pulse bg-gray-200 h-60 rounded-lg"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        <div className="flex items-center">
          <AlertTriangle className="h-5 w-5 mr-2" />
          <span>Error al cargar analíticas: {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {data.summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <SummaryCard
            title="Rutas Totales"
            value={data.summary.totalPaths}
            icon={<Map className="h-5 w-5" />}
            color="text-blue-600"
          />
          <SummaryCard
            title="Usuarios Asignados"
            value={data.summary.totalAssignedUsers}
            icon={<Users className="h-5 w-5" />}
            color="text-green-600"
          />
          <SummaryCard
            title="Completados"
            value={data.summary.totalCompletedUsers}
            icon={<Target className="h-5 w-5" />}
            color="text-purple-600"
          />
          <SummaryCard
            title="Tasa Promedio"
            value={`${data.summary.averageCompletionRate.toFixed(1)}%`}
            icon={<TrendingUp className="h-5 w-5" />}
            color="text-orange-600"
          />
          <SummaryCard
            title="Tiempo Total"
            value={`${data.summary.totalTimeSpentHours.toFixed(1)}h`}
            icon={<Clock className="h-5 w-5" />}
            color="text-red-600"
          />
        </div>
      )}

      {/* Path Performance Chart */}
      {data.pathPerformance && data.pathPerformance.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Rendimiento por Ruta de Aprendizaje
          </h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data.pathPerformance}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="pathName" 
                angle={-45}
                textAnchor="end"
                height={100}
                fontSize={12}
              />
              <YAxis />
              <Tooltip 
                formatter={(value: any, name: string) => {
                  if (name === 'completionRate') return [`${value}%`, 'Tasa de Completación'];
                  if (name === 'totalUsers') return [value, 'Total Usuarios'];
                  if (name === 'engagementScore') return [value, 'Puntuación de Engagement'];
                  return [value, name];
                }}
              />
              <Legend />
              <Bar dataKey="completionRate" fill="#3b82f6" name="Tasa de Completación (%)" />
              <Bar dataKey="engagementScore" fill="#10b981" name="Puntuación de Engagement" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Completion Trends */}
      {data.completionTrends && data.completionTrends.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Tendencias de Completación (Últimos {dateRange} días)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.completionTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="completions" 
                stroke="#3b82f6" 
                strokeWidth={2}
                name="Completaciones"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Course Progression Funnel */}
      {data.courseProgression && data.courseProgression.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Progresión por Curso (Análisis de Embudo)
          </h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart 
              data={data.courseProgression}
              layout="horizontal"
              margin={{ left: 100 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis 
                type="category" 
                dataKey="courseName" 
                width={100}
                fontSize={12}
              />
              <Tooltip 
                formatter={(value: any) => [`${value}%`, 'Tasa de Completación']}
              />
              <Bar dataKey="completionRate" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Low Performing Paths Alert */}
      {data.lowPerformingPaths && data.lowPerformingPaths.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-1 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-lg font-medium text-amber-800 mb-2">
                Rutas con Bajo Rendimiento
              </h4>
              <p className="text-amber-700 text-sm mb-3">
                Las siguientes rutas tienen tasas de completación inferiores al 40%:
              </p>
              <ul className="space-y-2">
                {data.lowPerformingPaths.map((path, index) => (
                  <li key={index} className="text-sm text-amber-800">
                    <strong>{path.pathName}</strong>: {path.completionRate}% completación 
                    ({path.totalUsers} usuarios asignados)
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

function SummaryCard({ title, value, icon, color }: SummaryCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}