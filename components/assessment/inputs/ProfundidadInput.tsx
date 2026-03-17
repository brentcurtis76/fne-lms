import React from 'react';
import { CheckCircle } from 'lucide-react';
import { MATURITY_LEVELS } from '@/types/assessment-builder';

interface ProfundidadInputProps {
  value?: number;
  descriptors: Record<number, string | undefined>;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/**
 * Brand-aligned maturity level colors.
 * Maps each level to a left-border accent + subtle background that
 * uses the brand palette (black/gold) with semantic warmth.
 */
const LEVEL_STYLES: Record<number, { border: string; bg: string; selectedBg: string; text: string }> = {
  0: { border: 'border-l-gray-300',    bg: '',                         selectedBg: 'bg-gray-50',       text: 'text-gray-600' },
  1: { border: 'border-l-red-400',     bg: '',                         selectedBg: 'bg-red-50/60',     text: 'text-red-700' },
  2: { border: 'border-l-amber-400',   bg: '',                         selectedBg: 'bg-amber-50/60',   text: 'text-amber-700' },
  3: { border: 'border-l-sky-400',     bg: '',                         selectedBg: 'bg-sky-50/60',     text: 'text-sky-700' },
  4: { border: 'border-l-emerald-400', bg: '',                         selectedBg: 'bg-emerald-50/60', text: 'text-emerald-700' },
};

const ProfundidadInput: React.FC<ProfundidadInputProps> = ({ value, descriptors, onChange, disabled }) => (
  <div className="space-y-1.5">
    {MATURITY_LEVELS.map((level) => {
      const isSelected = value === level.value;
      const descriptor = descriptors[level.value];
      const style = LEVEL_STYLES[level.value] || LEVEL_STYLES[0];

      return (
        <button
          key={level.value}
          type="button"
          onClick={() => onChange(level.value)}
          disabled={disabled}
          className={`w-full px-4 py-3 text-left transition-all border-l-4 rounded-r-lg ${style.border} ${
            isSelected
              ? `${style.selectedBg} ring-1 ring-brand_primary/20`
              : 'hover:bg-brand_primary/[0.02]'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center gap-2.5">
            <span className={`text-sm font-semibold ${isSelected ? style.text : 'text-brand_primary/70'}`}>
              {level.value}. {level.label}
            </span>
            {isSelected && <CheckCircle className="w-4 h-4 text-brand_accent" />}
          </div>
          {descriptor && (
            <p className={`text-xs mt-0.5 leading-relaxed ${isSelected ? 'text-brand_primary/60' : 'text-brand_primary/40'}`}>
              {descriptor}
            </p>
          )}
        </button>
      );
    })}
  </div>
);

export default ProfundidadInput;
