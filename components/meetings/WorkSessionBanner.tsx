import React from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { WorkSessionEntry } from '../../types/meetings';
import { profileName } from '../../lib/utils/profile-name';

interface WorkSessionBannerProps {
  sessions: WorkSessionEntry[];
}

/**
 * Draft timeline banner shown at the top of MeetingDocumentationModal when
 * another user has an open work session on this draft. Renders "Iniciado
 * por {X} el {date} · Activo hace {N} · K editor(es) adicional(es)".
 *
 * Extracted from MeetingDocumentationModal for two reasons:
 * - The modal is already ~2000 lines; every chunk peeled off makes the
 *   remaining logic easier to trace.
 * - This banner has no dependency on modal state beyond the sessions list,
 *   so extracting it costs no prop drilling.
 */
export const WorkSessionBanner: React.FC<WorkSessionBannerProps> = ({ sessions }) => {
  if (sessions.length === 0) return null;

  const first = sessions[0];
  const name = profileName(first, 'Alguien');
  const startedLabel = format(new Date(first.started_at), "d 'de' MMM, HH:mm", { locale: es });
  const activityTs = first.last_heartbeat_at ?? first.started_at;
  const activeLabel = formatDistanceToNow(new Date(activityTs), { locale: es, addSuffix: false });
  const others = sessions.length - 1;

  return (
    <div className="px-6 py-3 bg-yellow-50 border-b border-yellow-200 text-sm text-yellow-900">
      <span>
        Iniciado por <strong>{name}</strong> el {startedLabel}
        {' · '}Activo hace {activeLabel}
        {others > 0 && (
          <> · {others} editor{others !== 1 ? 'es' : ''} adicional{others !== 1 ? 'es' : ''}</>
        )}
      </span>
    </div>
  );
};
