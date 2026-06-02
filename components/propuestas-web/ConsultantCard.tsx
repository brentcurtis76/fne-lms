import { useState } from 'react';
import Image from 'next/image';
import { Briefcase, ChevronDown, ChevronUp, GraduationCap, Star } from 'lucide-react';
import type { SnapshotConsultant } from '@/lib/propuestas-web/snapshot';

interface ConsultantCardProps {
  consultant: SnapshotConsultant;
  variant: 'fne' | 'international' | 'advisor';
}

function initialsForName(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function ConsultantCard({ consultant, variant }: ConsultantCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isDark = variant === 'advisor';

  const hasDetails =
    (consultant.formacion && consultant.formacion.length > 0) ||
    (consultant.experiencia && consultant.experiencia.length > 0) ||
    (consultant.especialidades && consultant.especialidades.length > 0);

  return (
    <article className={`pw-person ${isDark ? 'pw-person--dark' : ''}`}>
      <div className="pw-person__top">
        {consultant.fotoPath ? (
          <div className="pw-person__portrait">
            <Image
              src={consultant.fotoPath}
              alt={consultant.nombre}
              fill
              className="object-cover"
              sizes="78px"
            />
          </div>
        ) : (
          <div className="pw-person__initials">
            <span>{initialsForName(consultant.nombre)}</span>
          </div>
        )}

        <div>
          <h3 className="pw-person__name">{consultant.nombre}</h3>
          <p className="pw-person__title">{consultant.titulo}</p>
        </div>
      </div>

      <p className="pw-person__bio">{consultant.bio}</p>

      {hasDetails && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="pw-person__toggle"
          >
            {expanded ? 'Ver menos' : 'Ver más'}
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expanded && (
            <div className="pw-person__details">
              {consultant.formacion && consultant.formacion.length > 0 && (
                <div>
                  <div className="pw-detail-label">
                    <GraduationCap size={15} />
                    <span>Formación</span>
                  </div>
                  <ul className="space-y-1">
                    {consultant.formacion.map((item, index) => (
                      <li key={index} className="text-sm leading-relaxed">
                        {item.degree} — {item.institution} ({item.year})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {consultant.experiencia && consultant.experiencia.length > 0 && (
                <div>
                  <div className="pw-detail-label">
                    <Briefcase size={15} />
                    <span>Experiencia</span>
                  </div>
                  <ul className="space-y-1">
                    {consultant.experiencia.map((item, index) => (
                      <li key={index} className="text-sm leading-relaxed">
                        {item.cargo} en {item.empresa}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {consultant.especialidades && consultant.especialidades.length > 0 && (
                <div>
                  <div className="pw-detail-label">
                    <Star size={15} />
                    <span>Especialidades</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {consultant.especialidades.map((item, index) => (
                      <span key={index} className="pw-chip">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}
