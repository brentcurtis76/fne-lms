import React from 'react';
import { CheckCircle } from 'lucide-react';
import { MATURITY_LEVELS } from '@/types/assessment-builder';

interface ProfundidadInputProps {
  value?: number;
  descriptors: Record<number, string | undefined>;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const ProfundidadInput: React.FC<ProfundidadInputProps> = ({ value, descriptors, onChange, disabled }) => (
  <div className="space-y-2">
    {MATURITY_LEVELS.map((level) => {
      const isSelected = value === level.value;
      const descriptor = descriptors[level.value];

      return (
        <button
          key={level.value}
          type="button"
          onClick={() => onChange(level.value)}
          disabled={disabled}
          className={`w-full p-3 rounded-lg text-left transition-all ${
            isSelected
              ? `${level.bgColor} ring-2 ring-offset-1 ring-${level.color}-500`
              : 'bg-gray-50 hover:bg-gray-100'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center gap-3">
            <span className={`font-semibold ${isSelected ? level.textColor : 'text-gray-700'}`}>
              {level.value}. {level.label}
            </span>
            {isSelected && <CheckCircle className="w-4 h-4 text-green-600" />}
          </div>
          {descriptor && (
            <p className={`text-sm mt-1 ${isSelected ? level.textColor : 'text-gray-500'}`}>
              {descriptor}
            </p>
          )}
        </button>
      );
    })}
  </div>
);

export default ProfundidadInput;
