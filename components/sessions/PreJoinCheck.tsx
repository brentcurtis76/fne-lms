import React, { useEffect, useState } from 'react';
import { Loader2, Video } from 'lucide-react';
import {
  readDevicePermission,
  supportsWebAssembly,
  type DevicePermission,
} from '../../lib/meet/embed-capabilities';

/**
 * The preflight a user sees before the embedded meeting mounts (Z3-3, plan §15).
 *
 * It exists so a school machine fails INFORMATIVELY. Without it, a browser that
 * cannot run the video engine, or one whose camera the school image has blocked at
 * the OS level, shows a black rectangle and the person in the room has nothing to
 * report except "no funciona".
 *
 * Two properties keep it honest:
 *
 *  - **It never asks for a device.** Every reading below comes from the Permissions
 *    API or from a feature test; nothing here calls `getUserMedia`. A preflight that
 *    lit the camera to find out whether it could would be worse than the failure it
 *    prevents, and the SDK prompts at join time anyway.
 *  - **Nothing it reads can BLOCK the join.** A denied camera is a meeting joined
 *    with the camera off, not a meeting refused — so every reading is advice, and the
 *    only button that decides anything is the one the user presses. The escape hatch
 *    beside it asks the server for the link path instead, which is what this same
 *    person received before the embed existed.
 *
 * All copy es-CL. The SDK's own chrome is es-ES (§20) — a different thing.
 */

interface PreJoinCheckProps {
  /** Mount the embed and join. */
  onContinue: () => void;
  /** Take the link path instead — a second request carrying the fallback intent. */
  onUseLink: () => void;
  /** A join is already in flight; both controls stand down. */
  busy: boolean;
}

type CheckTone = 'ok' | 'warn' | 'fail' | 'pending';

interface CheckRow {
  id: string;
  label: string;
  value: string;
  note: string;
  tone: CheckTone;
}

const TONE_LABEL: Record<CheckTone, string> = {
  ok: 'Listo',
  warn: 'Atención',
  fail: 'Falla',
  pending: 'Revisando',
};

const TONE_CLASS: Record<CheckTone, string> = {
  ok: 'bg-green-100 text-green-800',
  warn: 'bg-amber-100 text-amber-800',
  fail: 'bg-red-100 text-red-800',
  pending: 'bg-gray-100 text-gray-500',
};

/** One reading per device, worded for whoever is standing at the machine. */
function describeDevice(
  device: 'camera' | 'microphone',
  permission: DevicePermission | null
): CheckRow {
  const label = device === 'camera' ? 'Cámara' : 'Micrófono';
  const noun = device === 'camera' ? 'la cámara' : 'el micrófono';
  const base = { id: device, label };

  if (permission === null) {
    return { ...base, value: 'Revisando…', note: '', tone: 'pending' };
  }

  switch (permission) {
    case 'granted':
      return {
        ...base,
        value: 'Permiso concedido',
        note: `Este navegador ya tiene permiso para usar ${noun}.`,
        tone: 'ok',
      };
    case 'denied':
      return {
        ...base,
        value: 'Permiso bloqueado',
        note: `Puedes entrar igual, pero sin ${noun}. Para habilitarlo, revisa el candado de la barra de direcciones.`,
        tone: 'warn',
      };
    case 'prompt':
      return {
        ...base,
        value: 'Se pedirá permiso',
        note: `El navegador va a preguntar por ${noun} al entrar. Acepta para que te vean y te escuchen.`,
        tone: 'ok',
      };
    case 'unavailable':
      return {
        ...base,
        value: 'No disponible en este navegador',
        note: 'Este equipo no puede entregar audio ni video a la página. Conviene abrir Zoom en otra pestaña.',
        tone: 'fail',
      };
    default:
      return {
        ...base,
        value: 'No se pudo revisar',
        note: `Este navegador no informa el estado del permiso. Se pedirá ${noun} al entrar.`,
        tone: 'warn',
      };
  }
}

const PreJoinCheck: React.FC<PreJoinCheckProps> = ({ onContinue, onUseLink, busy }) => {
  const [camera, setCamera] = useState<DevicePermission | null>(null);
  const [microphone, setMicrophone] = useState<DevicePermission | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Both reads are independent; neither can reject (see `readDevicePermission`).
    Promise.all([readDevicePermission('camera'), readDevicePermission('microphone')]).then(
      ([cameraState, microphoneState]) => {
        if (cancelled) return;
        setCamera(cameraState);
        setMicrophone(microphoneState);
      }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const engineAvailable = supportsWebAssembly();

  const rows: CheckRow[] = [
    describeDevice('camera', camera),
    describeDevice('microphone', microphone),
    {
      id: 'engine',
      label: 'Motor de video',
      value: engineAvailable ? 'Compatible' : 'No compatible',
      note: engineAvailable
        ? 'Este navegador puede mostrar la reunión dentro de GENERA.'
        : 'Este navegador no puede mostrar la reunión aquí. Abre Zoom en otra pestaña.',
      tone: engineAvailable ? 'ok' : 'fail',
    },
  ];

  return (
    <section
      data-testid="meet-prejoin-check"
      className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4"
    >
      <h3 className="text-sm font-semibold text-gray-900">Revisión antes de entrar</h3>
      <p className="mt-1 text-xs text-gray-600">
        La reunión se abre dentro de esta misma página. Esto revisa que el equipo esté listo.
      </p>

      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            data-testid={`meet-prejoin-${row.id}`}
            className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-white p-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">{row.label}</p>
              <p className="text-sm text-gray-700">{row.value}</p>
              {row.note ? <p className="mt-0.5 text-xs text-gray-500">{row.note}</p> : null}
            </div>
            <span
              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[row.tone]}`}
            >
              {TONE_LABEL[row.tone]}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onContinue}
          disabled={busy}
          data-testid="meet-prejoin-continue"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand_primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand_gray_dark focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Video className="h-4 w-4" aria-hidden="true" />
          )}
          Entrar a la reunión
        </button>
        <button
          type="button"
          onClick={onUseLink}
          disabled={busy}
          data-testid="meet-prejoin-use-link"
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 disabled:opacity-50"
        >
          Abrir Zoom en otra pestaña
        </button>
      </div>
    </section>
  );
};

export default PreJoinCheck;
