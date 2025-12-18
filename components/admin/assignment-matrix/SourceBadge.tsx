import React from 'react';
import { AssignmentSource } from '../../../types/assignment-matrix';

interface SourceBadgeProps {
  source: AssignmentSource;
  sourceLPNames?: string[];
  showTooltip?: boolean;
}

/**
 * Renders a badge indicating the source of an assignment
 * Uses the 4-state model from the plan
 */
export function SourceBadge({ source, sourceLPNames = [], showTooltip = true }: SourceBadgeProps) {
  const getBadgeConfig = () => {
    switch (source) {
      case 'asignacion_directa':
        return {
          label: 'Directa',
          bgColor: 'bg-blue-100',
          textColor: 'text-blue-700',
          borderColor: 'border-blue-200',
          tooltip: 'Asignación directa'
        };
      case 'ruta':
        const lpName = sourceLPNames[0] || 'Ruta';
        const truncatedName = lpName.length > 20 ? lpName.slice(0, 20) + '...' : lpName;
        return {
          label: `LP: ${truncatedName}`,
          bgColor: 'bg-purple-100',
          textColor: 'text-purple-700',
          borderColor: 'border-purple-200',
          tooltip: `Vía ruta de aprendizaje: ${lpName}`
        };
      case 'directa_y_ruta':
        const multiLPName = sourceLPNames[0] || 'Ruta';
        return {
          label: 'Directa + LP',
          bgColor: 'bg-indigo-100',
          textColor: 'text-indigo-700',
          borderColor: 'border-indigo-200',
          tooltip: `Asignación directa + ${multiLPName}`
        };
      case 'inscripcion_otro':
        return {
          label: 'Inscripción',
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-600',
          borderColor: 'border-gray-200',
          tooltip: 'Fuente inferida - sin registro de asignación'
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.bgColor} ${config.textColor} ${config.borderColor}`}
      title={showTooltip ? config.tooltip : undefined}
    >
      {config.label}
    </span>
  );
}

/**
 * Badge for showing multiple sources (overlap indicator)
 */
interface OverlapBadgeProps {
  sourceCount: number;
}

export function OverlapBadge({ sourceCount }: OverlapBadgeProps) {
  if (sourceCount <= 1) return null;

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200"
      title={`Este curso tiene ${sourceCount} fuentes de asignación`}
    >
      <svg
        className="h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      </svg>
      {sourceCount} fuentes
    </span>
  );
}

export default SourceBadge;
