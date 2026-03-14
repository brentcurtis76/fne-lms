import React from 'react';
import { MATURITY_LEVELS, ENTITY_LABELS } from '@/types/assessment-builder';
import type { ModuleResult } from './types';
import ModuleResultCard from './ModuleResultCard';

interface ObjectiveScore {
  objectiveId: string;
  objectiveName: string;
  objectiveScore: number;
  objectiveWeight: number;
  modules: ModuleResult[];
}

interface DetailedResultsProps {
  objectiveScores?: ObjectiveScore[] | null;
  moduleScores: ModuleResult[];
  expandedModules: Set<string>;
  onToggleModule: (moduleId: string) => void;
}

const DetailedResults: React.FC<DetailedResultsProps> = ({
  objectiveScores,
  moduleScores,
  expandedModules,
  onToggleModule,
}) => {
  if (objectiveScores && objectiveScores.length > 0) {
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-gray-800">Detalle por {ENTITY_LABELS.objective}</h3>
        {objectiveScores.map((objective) => {
          const objLevel = Math.round(objective.objectiveScore / 25);
          const objLevelInfo = MATURITY_LEVELS[objLevel] || MATURITY_LEVELS[0];

          return (
            <div key={objective.objectiveId} className="space-y-3">
              {/* Objective header */}
              <div className="bg-brand_primary/5 border border-brand_primary/20 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-base font-semibold text-gray-800">{objective.objectiveName}</h4>
                  <p className="text-sm text-gray-500">
                    {objective.modules.length} {objective.modules.length === 1 ? ENTITY_LABELS.module.toLowerCase() : ENTITY_LABELS.modules.toLowerCase()}
                    {' · Peso: '}{objective.objectiveWeight}%
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-brand_primary">
                    {Math.round(objective.objectiveScore)}%
                  </div>
                  <div className={`text-xs px-2 py-0.5 rounded ${objLevelInfo.bgColor} ${objLevelInfo.textColor}`}>
                    {objLevelInfo.label}
                  </div>
                </div>
              </div>

              {/* Module cards under this objective */}
              <div className="space-y-3 ml-4">
                {objective.modules.map((module) => (
                  <ModuleResultCard
                    key={module.moduleId}
                    module={module}
                    isExpanded={expandedModules.has(module.moduleId)}
                    onToggle={onToggleModule}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-800">Detalle por {ENTITY_LABELS.module}</h3>
      <div className="space-y-4">
        {moduleScores.map((module) => (
          <ModuleResultCard
            key={module.moduleId}
            module={module}
            isExpanded={expandedModules.has(module.moduleId)}
            onToggle={onToggleModule}
          />
        ))}
      </div>
    </div>
  );
};

export default DetailedResults;
