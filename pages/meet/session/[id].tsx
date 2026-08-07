import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { Calendar, Clock, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { createServiceRoleClient } from '../../../lib/api-auth';
import JoinMeetingButton from '../../../components/sessions/JoinMeetingButton';
import { formatTime } from '../../../lib/utils/session-ui-helpers';
import {
  JOIN_NOT_AUTHORIZED_MESSAGE,
  MeetSessionView,
  resolveMeetSessionAccess,
} from '../../../lib/utils/session-meet-access';

/**
 * Meeting interstitial — the single platform surface that reveals a session's
 * legacy manual meeting link.
 *
 * Everything else (API payloads, .ics files, reminder notifications) now points
 * here instead of carrying the raw link, so access is re-checked server-side on
 * every visit rather than being frozen into an artifact that outlives the
 * viewer's permissions.
 *
 * Intentionally light: no layout chrome, and for a legacy session no
 * client-side data fetching and no state at all. School hardware is slow and
 * this page's whole job is one link.
 *
 * A platform-managed session (plan §8) is the one exception: it has no raw link
 * to render, so the join goes through `JoinMeetingButton`, which fetches the URL
 * per click from the §5 opening. Nothing about that path reaches the props — see
 * the component. The legacy branches below are untouched by it.
 *
 * This is also the surface that carries the school-outage audio fallback (plan §187,
 * chunk Z2-4e): the dial-in numbers, meeting number and passcode render inside
 * `JoinMeetingButton`, from that same per-click response, for the same reason the
 * link does. They are deliberately NOT props — `getServerSideProps` below reads
 * nothing from `zoom_internal` and must stay that way.
 *
 * WHO gets a way in is not who gets the page (plan §5, amended 2026-08-06 by owner
 * decision): page visibility is `canViewSession`, the join capability is
 * `authorizeMeetingJoin`, and the second governs the managed affordance and the raw
 * pasted link alike. A viewer the join list refuses reaches this page and finds no way
 * into the meeting — the link is not in the props, so it is not in the document either.
 * `resolveMeetSessionAccess` makes that decision; the branches below only render it.
 *
 * NOTE the tension this does not resolve: the rationale for dial-in is a school
 * internet outage, and a participant whose internet is down cannot load this page to
 * read the number. Getting it to them beforehand would mean a notification or an .ics,
 * both of which are forbidden for these values. Open product question, not a defect.
 */

type MeetSessionPageProps = {
  session: MeetSessionView;
};

/**
 * §14, same wording the join route answers its 503 with — one kill switch, one
 * sentence, whichever surface the user happens to be on.
 */
const JOIN_DISABLED_MESSAGE = 'Las videollamadas están temporalmente deshabilitadas';

/** The two refusal panels share the neutral card the no-link state already uses. */
const NOTICE_CLASSNAME =
  'mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700';

const MeetSessionPage: React.FC<MeetSessionPageProps> = ({ session }) => {
  const dateLabel = format(parseISO(session.session_date), "EEEE d 'de' MMMM 'de' yyyy", {
    locale: es,
  });

  return (
    <>
      <Head>
        <title>{`${session.title} — Reunión | GENERA`}</title>
        <meta name="robots" content="noindex" />
      </Head>

      <main className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Reunión</p>
          <h1 className="mt-1 text-xl font-semibold text-brand_primary sm:text-2xl">
            {session.title}
          </h1>

          <dl className="mt-5 space-y-3 text-sm text-gray-700">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
              <dt className="sr-only">Fecha</dt>
              <dd className="first-letter:uppercase">{dateLabel}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
              <dt className="sr-only">Horario</dt>
              <dd>
                {formatTime(session.start_time)} - {formatTime(session.end_time)}{' '}
                <span className="text-gray-500">(hora Chile)</span>
              </dd>
            </div>
          </dl>

          {session.join_access === 'denied' ? (
            <div data-testid="meet-join-denied" className={NOTICE_CLASSNAME}>
              {session.join_denial_message ?? JOIN_NOT_AUTHORIZED_MESSAGE}
            </div>
          ) : session.join_access === 'disabled' ? (
            <div data-testid="meet-join-disabled" className={NOTICE_CLASSNAME}>
              {JOIN_DISABLED_MESSAGE}
            </div>
          ) : session.is_zoom_managed ? (
            <JoinMeetingButton sessionId={session.id} />
          ) : session.meeting_link ? (
            <div className="mt-6">
              <a
                href={session.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="meet-join-link"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand_primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brand_gray_dark focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Abrir enlace de reunión
              </a>
              <p className="mt-3 text-xs text-gray-500">
                El enlace abre un servicio de reuniones externo a GENERA, en una pestaña nueva.
              </p>
            </div>
          ) : (
            <div data-testid="meet-no-link" className={NOTICE_CLASSNAME}>
              Esta sesión no tiene enlace de reunión.
            </div>
          )}

          <div className="mt-6 border-t border-gray-100 pt-4">
            <Link
              href="/dashboard"
              data-testid="meet-back-link"
              className="text-sm font-medium text-gray-600 hover:text-brand_primary"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<MeetSessionPageProps> = async (context) => {
  const supabase = createPagesServerClient(context);
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();

  const access = await resolveMeetSessionAccess({
    sessionId: context.params?.id,
    userId: authSession?.user?.id ?? null,
    service: createServiceRoleClient(),
  });

  if (access.kind === 'unauthenticated') {
    // The middleware normally bounces these before SSR runs; this is the
    // defence-in-depth copy for anything it misses. Same contract: carry the
    // destination so the join link still works after logging in. The login page
    // guards the value before navigating to it.
    return {
      redirect: {
        destination: `/login?next=${encodeURIComponent(context.resolvedUrl)}`,
        permanent: false,
      },
    };
  }

  if (access.kind === 'not-found') {
    return { notFound: true };
  }

  return { props: { session: access.session } };
};

export default MeetSessionPage;
