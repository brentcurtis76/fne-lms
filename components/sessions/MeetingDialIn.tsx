import React from 'react';
import { Phone } from 'lucide-react';
import type { JoinDialIn } from '../../lib/utils/meeting-dial-in';

/**
 * The audio fallback for a managed session: the phone numbers, meeting number and
 * passcode a participant needs to complete the call without the platform (plan §187,
 * chunk Z2-4e).
 *
 * Rendered from the join response, never from `getServerSideProps` — these are the
 * same credentials `join_url` carries, and they reach the page the same way it does:
 * per click, through the §5 opening, after the join policy has run. They are never
 * part of the page's HTML until the caller has been authorized for this session.
 *
 * `null` in, nothing out. A tenant without an audio plan is the common case and it
 * must render nothing at all — no heading, no "no disponible" box, which would be a
 * worse answer than silence on a phone-sized screen.
 *
 * Laid out for the audience it is for: this is what someone reads on a small screen,
 * on old school hardware, while holding a phone. Everything stacks, nothing is a
 * table, and the values that get keyed into a keypad are large, monospaced and
 * selectable.
 */

interface MeetingDialInProps {
  dialIn: JoinDialIn | null;
}

/** `Chile (Santiago)` / `Chile` / `` — the label, from whatever Zoom actually sent. */
function locationLabel(entry: JoinDialIn['numbers'][number]): string {
  if (entry.country_name && entry.city) return `${entry.country_name} (${entry.city})`;
  return entry.country_name ?? entry.city ?? '';
}

const MeetingDialIn: React.FC<MeetingDialInProps> = ({ dialIn }) => {
  if (!dialIn) {
    return null;
  }

  return (
    <section
      data-testid="meet-dial-in"
      className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-brand_primary">
        <Phone className="h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden="true" />
        Unirse por teléfono
      </h2>
      <p className="mt-1 text-xs text-gray-600">
        Si la conexión a internet falla, puedes llamar a uno de estos números y luego
        marcar el número de la reunión y la clave.
      </p>

      <ul data-testid="meet-dial-in-numbers" className="mt-3 space-y-2">
        {dialIn.numbers.map((entry) => (
          <li key={`${entry.number}-${entry.type ?? ''}`} className="text-sm text-gray-700">
            <span className="block select-all break-all font-mono text-base text-gray-900">
              {entry.number}
            </span>
            {locationLabel(entry) && (
              <span className="block text-xs text-gray-500">{locationLabel(entry)}</span>
            )}
          </li>
        ))}
      </ul>

      <dl className="mt-3 space-y-2 border-t border-gray-200 pt-3 text-sm">
        <div>
          <dt className="text-xs text-gray-500">Número de la reunión</dt>
          <dd
            data-testid="meet-dial-in-meeting-number"
            className="select-all break-all font-mono text-base text-gray-900"
          >
            {dialIn.meeting_number}
          </dd>
        </div>
        {dialIn.passcode && (
          <div>
            <dt className="text-xs text-gray-500">Clave de la reunión</dt>
            <dd
              data-testid="meet-dial-in-passcode"
              className="select-all break-all font-mono text-base text-gray-900"
            >
              {dialIn.passcode}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
};

export default MeetingDialIn;
