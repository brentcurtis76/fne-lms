import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from 'recharts';
import { ENTITY_LABELS } from '@/types/assessment-builder';
import type { ModuleResult } from './types';

interface ResultsChartsProps {
  moduleScores: ModuleResult[];
}

const ResultsCharts: React.FC<ResultsChartsProps> = ({ moduleScores }) => {
  const moduleChartData = moduleScores.map((m) => ({
    name: m.moduleName.length > 15 ? m.moduleName.substring(0, 15) + '...' : m.moduleName,
    score: Math.round(m.moduleScore),
    fullName: m.moduleName,
  }));

  const radarData = moduleScores.map((m) => ({
    subject: m.moduleName.length > 12 ? m.moduleName.substring(0, 12) + '...' : m.moduleName,
    score: m.moduleScore,
    fullMark: 100,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Bar chart */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Puntuación por {ENTITY_LABELS.module}</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={moduleChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number) => [`${value}%`, 'Puntuación']}
                labelFormatter={(label) => {
                  const item = moduleChartData.find((d) => d.name === label);
                  return item?.fullName || label;
                }}
              />
              <Bar dataKey="score" fill="#fbbf24" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Radar chart */}
      {moduleScores.length >= 3 && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Perfil de Competencias</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} />
                <Radar
                  name="Puntuación"
                  dataKey="score"
                  stroke="#f59e0b"
                  fill="#fbbf24"
                  fillOpacity={0.3}
                />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsCharts;
