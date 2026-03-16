import React from 'react';
import {
  Award,
  Target,
  BarChart3,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { MATURITY_LEVELS, GenerationType } from '@/types/assessment-builder';

interface SummaryCardsProps {
  totalScore: number;
  overallLevel: number;
  overallLevelLabel: string;
  expectedLevelLabel: string;
  meetsExpectations: boolean;
  transformationYear: number;
  generationType: GenerationType;
  indicatorsAboveExpectation: number;
  totalIndicators: number;
}

const SummaryCards: React.FC<SummaryCardsProps> = ({
  totalScore,
  overallLevel,
  overallLevelLabel,
  expectedLevelLabel,
  meetsExpectations,
  transformationYear,
  generationType,
  indicatorsAboveExpectation,
  totalIndicators,
}) => {
  const maturityLevel = MATURITY_LEVELS.find((l) => l.value === overallLevel);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {/* Overall score */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-500">Puntuación Total</span>
          <Award className={`w-5 h-5 ${maturityLevel?.textColor || 'text-gray-500'}`} />
        </div>
        <div className="text-3xl font-bold text-brand_primary mb-2">
          {Math.round(totalScore)}%
        </div>
        <div
          className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
            maturityLevel?.bgColor || 'bg-gray-100'
          } ${maturityLevel?.textColor || 'text-gray-700'}`}
        >
          {overallLevelLabel}
        </div>
      </div>

      {/* Meets expectations */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Expectativa Año {transformationYear}</span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                generationType === 'GT'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
              title={generationType === 'GT' ? 'Generación Tractor' : 'Generación Innova'}
            >
              {generationType}
            </span>
          </div>
          <Target className="w-5 h-5 text-gray-500" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          {meetsExpectations ? (
            <CheckCircle className="w-8 h-8 text-green-500" />
          ) : (
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
          )}
          <span className="text-xl font-semibold">
            {meetsExpectations ? 'Cumple' : 'En desarrollo'}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          Nivel esperado: {expectedLevelLabel}
        </p>
      </div>

      {/* Indicator stats */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-500">Indicadores</span>
          <BarChart3 className="w-5 h-5 text-gray-500" />
        </div>
        <div className="text-3xl font-bold text-brand_primary mb-2">
          {indicatorsAboveExpectation}/{totalIndicators}
        </div>
        <p className="text-sm text-gray-500">
          sobre la expectativa
        </p>
      </div>
    </div>
  );
};

export default SummaryCards;
