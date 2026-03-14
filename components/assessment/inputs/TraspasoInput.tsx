import React from 'react';

interface TraspasoInputProps {
  indicatorId: string;
  value?: { evidence_link?: string; improvement_suggestions?: string };
  onChange: (value: { evidence_link?: string; improvement_suggestions?: string }) => void;
  disabled?: boolean;
}

const TraspasoInput: React.FC<TraspasoInputProps> = ({ indicatorId, value, onChange, disabled }) => (
  <div className="space-y-3">
    <div>
      <label htmlFor={`evidence-link-${indicatorId}`} className="block text-sm font-medium text-gray-700 mb-1">
        Adjunte link a carpeta con evidencia de sus respuestas
      </label>
      <input
        id={`evidence-link-${indicatorId}`}
        type="url"
        value={value?.evidence_link || ''}
        onChange={(e) => onChange({ ...(value || {}), evidence_link: e.target.value })}
        disabled={disabled}
        placeholder="https://..."
        className={`block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_primary text-sm ${
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''
        }`}
      />
      <p className="mt-1 text-xs text-gray-500">
        El archivo o carpeta enlazada debe ser accesible para cualquier persona con el link (permisos de lectura pública o compartido con el equipo evaluador)
      </p>
    </div>
    <div>
      <label htmlFor={`improvement-${indicatorId}`} className="block text-sm font-medium text-gray-700 mb-1">
        Mejoras sugeridas
      </label>
      <textarea
        id={`improvement-${indicatorId}`}
        value={value?.improvement_suggestions || ''}
        onChange={(e) => onChange({ ...(value || {}), improvement_suggestions: e.target.value })}
        disabled={disabled}
        rows={3}
        placeholder="¿Con la experiencia adquirida, qué mejoras sugieres para la implementación de esta práctica?"
        className={`block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_primary text-sm ${
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''
        }`}
      />
    </div>
  </div>
);

export default TraspasoInput;
