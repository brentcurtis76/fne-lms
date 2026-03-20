import { useState } from 'react';
import Image from 'next/image';
import { ChevronDown, ChevronUp, GraduationCap, Briefcase, Star } from 'lucide-react';
import type { SnapshotConsultant } from '@/lib/propuestas-web/snapshot';

interface ConsultantCardProps {
  consultant: SnapshotConsultant;
  variant: 'fne' | 'international' | 'advisor';
}

export default function ConsultantCard({ consultant, variant }: ConsultantCardProps) {
  const [expanded, setExpanded] = useState(false);

  const borderClass =
    variant === 'fne'
      ? 'border-[#0a0a0a]'
      : variant === 'international'
        ? 'border-[#fbbf24]'
        : '';

  const cardClass =
    variant === 'advisor'
      ? 'bg-[#0a0a0a] text-white rounded-2xl p-6'
      : `bg-white border-2 ${borderClass} rounded-2xl p-6`;

  const nameClass = variant === 'advisor' ? 'text-white' : 'text-[#0a0a0a]';
  const titleClass = variant === 'advisor' ? 'text-white/60' : 'text-gray-500';
  const bioClass = variant === 'advisor' ? 'text-white/80' : 'text-gray-600';
  const toggleClass = variant === 'advisor' ? 'text-[#fbbf24]' : 'text-[#0a0a0a]';
  const detailLabelClass = variant === 'advisor' ? 'text-[#fbbf24]' : 'text-[#0a0a0a]';
  const detailTextClass = variant === 'advisor' ? 'text-white/70' : 'text-gray-600';

  const hasDetails =
    (consultant.formacion && consultant.formacion.length > 0) ||
    (consultant.experiencia && consultant.experiencia.length > 0) ||
    (consultant.especialidades && consultant.especialidades.length > 0);

  return (
    <div className={cardClass}>
      <div className="flex flex-col items-center text-center">
        {consultant.fotoPath ? (
          <div className="relative w-24 h-24 rounded-full overflow-hidden mb-4">
            <Image
              src={consultant.fotoPath}
              alt={consultant.nombre}
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center mb-4">
            <span className="text-2xl font-bold text-gray-400">
              {consultant.nombre
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)}
            </span>
          </div>
        )}

        <h3 className={`text-lg font-bold ${nameClass}`}>{consultant.nombre}</h3>
        <p className={`text-sm ${titleClass} mb-3`}>{consultant.titulo}</p>
        <p className={`text-sm ${bioClass} leading-relaxed`}>{consultant.bio}</p>

        {hasDetails && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className={`mt-4 flex items-center gap-1 text-sm font-medium ${toggleClass} hover:opacity-80 transition-opacity`}
            >
              {expanded ? 'Ver menos' : 'Ver más'}
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {expanded && (
              <div className="mt-4 w-full text-left space-y-4">
                {consultant.formacion && consultant.formacion.length > 0 && (
                  <div>
                    <div className={`flex items-center gap-2 mb-2 ${detailLabelClass}`}>
                      <GraduationCap size={16} />
                      <span className="text-sm font-semibold uppercase tracking-wider">
                        Formación
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {consultant.formacion.map((f, i) => (
                        <li key={i} className={`text-sm ${detailTextClass}`}>
                          {f.degree} — {f.institution} ({f.year})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {consultant.experiencia && consultant.experiencia.length > 0 && (
                  <div>
                    <div className={`flex items-center gap-2 mb-2 ${detailLabelClass}`}>
                      <Briefcase size={16} />
                      <span className="text-sm font-semibold uppercase tracking-wider">
                        Experiencia
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {consultant.experiencia.map((e, i) => (
                        <li key={i} className={`text-sm ${detailTextClass}`}>
                          {e.cargo} en {e.empresa}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {consultant.especialidades && consultant.especialidades.length > 0 && (
                  <div>
                    <div className={`flex items-center gap-2 mb-2 ${detailLabelClass}`}>
                      <Star size={16} />
                      <span className="text-sm font-semibold uppercase tracking-wider">
                        Especialidades
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {consultant.especialidades.map((s, i) => (
                        <span
                          key={i}
                          className={`text-xs px-3 py-1 rounded-full ${
                            variant === 'advisor'
                              ? 'bg-white/10 text-white/80'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
