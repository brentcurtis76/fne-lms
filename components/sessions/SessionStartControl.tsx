import React from 'react';
import { AlertTriangle, Play, RefreshCw } from 'lucide-react';
import type { SessionMeetingPublicStatus } from '../../lib/zoom/db-types';
import {
  managedMeetingIsReady,
  managedMeetingIsUnavailable,
} from '../../lib/utils/managed-meeting-readiness';

interface SessionStartControlProps {
  isManagedZoom: boolean;
  meetingStatus: SessionMeetingPublicStatus | null;
  meetingStatusLoading: boolean;
  meetingStatusError: boolean;
  actionInProgress: boolean;
  onStart: () => void;
}

/**
 * Keeps a managed session non-startable until Zoom provisioning has committed
 * its public projection. The API enforces the same rule as the final authority.
 */
export default function SessionStartControl({
  isManagedZoom,
  meetingStatus,
  meetingStatusLoading,
  meetingStatusError,
  actionInProgress,
  onStart,
}: SessionStartControlProps) {
  const waitingForZoom = isManagedZoom && !managedMeetingIsReady(meetingStatus);
  const zoomUnavailable = isManagedZoom && managedMeetingIsUnavailable(meetingStatus);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        data-testid="session-start-button"
        onClick={onStart}
        disabled={actionInProgress || waitingForZoom}
        className="inline-flex items-center px-4 py-2 bg-brand_accent text-brand_primary hover:bg-brand_accent_hover rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {zoomUnavailable ? (
          <AlertTriangle size={20} aria-hidden="true" className="mr-2" />
        ) : waitingForZoom ? (
          <RefreshCw
            size={20}
            aria-hidden="true"
            className={`mr-2 ${meetingStatusLoading ? 'animate-spin' : ''}`}
          />
        ) : (
          <Play size={20} aria-hidden="true" className="mr-2" />
        )}
        {zoomUnavailable
          ? 'Zoom no disponible'
          : waitingForZoom
            ? 'Preparando Zoom…'
            : isManagedZoom
              ? 'Iniciar y continuar a Zoom'
              : 'Iniciar Sesión'}
      </button>
      {isManagedZoom && !waitingForZoom && (
        <p className="max-w-xs text-right text-xs text-gray-600">
          La sesión pasará a En Progreso y luego podrás unirte a Zoom.
        </p>
      )}
      {waitingForZoom && (
        <p className="max-w-xs text-right text-xs text-amber-700" role="status">
          {zoomUnavailable
            ? 'La reunión terminó o fue cancelada. Cancela o reprograma la sesión.'
            : meetingStatusError
            ? 'No pudimos verificar la reunión. Reintentaremos automáticamente.'
            : 'La sesión se podrá iniciar cuando Zoom confirme la reunión.'}
        </p>
      )}
    </div>
  );
}
