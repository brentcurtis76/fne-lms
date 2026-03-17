import React from 'react';

interface TraspasoInputProps {
  indicatorId: string;
  value?: { evidence_link?: string; improvement_suggestions?: string };
  onChange: (value: { evidence_link?: string; improvement_suggestions?: string }) => void;
  disabled?: boolean;
}

const TraspasoInput: React.FC<TraspasoInputProps> = ({ indicatorId, value, onChange, disabled }) => (
  <div className="space-y-4">
    <div>
      <label htmlFor={`evidence-link-${indicatorId}`} className="block text-xs font-semibold text-brand_primary/50 uppercase tracking-wider mb-1.5">
        Link a carpeta con evidencia
      </label>
      <input
        id={`evidence-link-${indicatorId}`}
        type="url"
        value={value?.evidence_link || ''}
        onChange={(e) => onChange({ ...(value || {}), evidence_link: e.target.value })}
        disabled={disabled}
        placeholder="https://..."
        className={`block w-full px-3 py-2.5 border border-brand_primary/15 rounded-lg text-sm text-brand_primary focus:outline-none focus:ring-2 focus:ring-brand_accent/50 focus:border-brand_accent placeholder:text-brand_primary/25 ${
          disabled ? 'opacity-50 cursor-not-allowed bg-brand_primary/[0.02]' : 'bg-white'
        }`}
      />
      <p className="mt-1.5 text-xs text-brand_primary/35 leading-relaxed">
        El archivo o carpeta enlazada debe ser accesible para cualquier persona con el link
      </p>
    </div>
    <div>
      <label htmlFor={`improvement-${indicatorId}`} className="block text-xs font-semibold text-brand_primary/50 uppercase tracking-wider mb-1.5">
        Mejoras sugeridas
      </label>
      <textarea
        id={`improvement-${indicatorId}`}
        value={value?.improvement_suggestions || ''}
        onChange={(e) => onChange({ ...(value || {}), improvement_suggestions: e.target.value })}
        disabled={disabled}
        rows={3}
        placeholder="¿Con la experiencia adquirida, qué mejoras sugieres para la implementación de esta práctica?"
        className={`block w-full px-3 py-2.5 border border-brand_primary/15 rounded-lg text-sm text-brand_primary focus:outline-none focus:ring-2 focus:ring-brand_accent/50 focus:border-brand_accent placeholder:text-brand_primary/25 ${
          disabled ? 'opacity-50 cursor-not-allowed bg-brand_primary/[0.02]' : 'bg-white'
        }`}
      />
    </div>
  </div>
);

export default TraspasoInput;
