import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StrengthsWeaknessesProps {
  strongestModule: string | null;
  weakestModule: string | null;
}

const StrengthsWeaknesses: React.FC<StrengthsWeaknessesProps> = ({
  strongestModule,
  weakestModule,
}) => {
  if (!strongestModule && !weakestModule) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
      {strongestModule && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-green-800">Fortaleza</div>
            <div className="text-green-700">{strongestModule}</div>
          </div>
        </div>
      )}
      {weakestModule && weakestModule !== strongestModule && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <TrendingDown className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-yellow-800">Área de mejora</div>
            <div className="text-yellow-700">{weakestModule}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StrengthsWeaknesses;
