import React, { useState } from 'react';
import { CheckCircle, Clock } from 'lucide-react';

interface CompletionStatusBadgeProps {
  isCompleted: boolean;
  completedByName?: string;
  completedAt?: string;
  lastUpdatedByName?: string;
  lastUpdatedAt?: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const CompletionStatusBadge: React.FC<CompletionStatusBadgeProps> = ({
  isCompleted,
  completedByName,
  completedAt,
  lastUpdatedByName,
  lastUpdatedAt,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!isCompleted) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        <Clock className="h-3 w-3" />
        Pendiente
      </span>
    );
  }

  return (
    <span
      className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 cursor-default"
      tabIndex={0}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
      role="status"
      aria-label={`Completado${completedByName ? ` por ${completedByName}` : ''}`}
    >
      <CheckCircle className="h-3 w-3" />
      Completado

      {showTooltip && (completedByName || lastUpdatedByName) && (
        <span className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg whitespace-normal">
          {completedByName && completedAt && (
            <span className="block">
              Completado por {completedByName} el {formatDate(completedAt)}.
            </span>
          )}
          {lastUpdatedByName && lastUpdatedAt && (
            <span className="block mt-0.5">
              Última modificación por {lastUpdatedByName} el {formatDate(lastUpdatedAt)}.
            </span>
          )}
          {/* Arrow */}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
        </span>
      )}
    </span>
  );
};

export default CompletionStatusBadge;
