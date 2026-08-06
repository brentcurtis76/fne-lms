// @vitest-environment jsdom
/**
 * The managed-session join control (Z2-2b, plan §5/§8).
 *
 * Every branch of the join opening's contract is asserted here against the
 * rendered DOM, because "what the user is told" is the claim: the button posts
 * and renders what comes back, and it must not invent copy of its own for any
 * answer the server already words in es-CL.
 *
 * Synthetic ids and URLs only.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockReplace, mockAsPath } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockAsPath: { value: '/meet/session/3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22' },
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ replace: mockReplace, asPath: mockAsPath.value }),
}));

import JoinMeetingButton from '../../../components/sessions/JoinMeetingButton';

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const JOIN_URL = 'https://zoom.example.test/j/90210042001?pwd=synthetic';

/** The wire shape: `sendApiResponse` wraps every success in `{ data }`. */
function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ data }) };
}

function fail(status: number, error: string) {
  return { ok: false, status, json: async () => ({ error }) };
}

const mockFetch = vi.fn();
const mockOpen = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockAsPath.value = `/meet/session/${SESSION_ID}`;
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('open', mockOpen);
});

function clickJoin() {
  fireEvent.click(screen.getByTestId('meet-join-button'));
}

describe('JoinMeetingButton', () => {
  it('posts to the join opening for this session and nothing else', async () => {
    mockFetch.mockResolvedValue(ok({ mode: 'link', join_url: JOIN_URL, role: 'participant' }));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(mockFetch).toHaveBeenCalledWith(`/api/meet/session/${SESSION_ID}/join`, {
      method: 'POST',
    });
  });

  it('opens the link in a new tab, and never renders it into the page', async () => {
    mockFetch.mockResolvedValue(ok({ mode: 'link', join_url: JOIN_URL, role: 'host' }));
    const { container } = render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    await waitFor(() =>
      expect(mockOpen).toHaveBeenCalledWith(JOIN_URL, '_blank', 'noopener,noreferrer')
    );
    expect(container.innerHTML).not.toContain(JOIN_URL);
    expect(container.innerHTML).not.toContain('zoom.example.test');
  });

  it('shows the §8 pending wording and keeps the button available to retry', async () => {
    mockFetch.mockResolvedValue(ok({ mode: 'pending' }));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    expect(await screen.findByTestId('meet-join-pending')).toHaveTextContent(
      'Enlace en preparación'
    );
    expect(mockOpen).not.toHaveBeenCalled();
    expect(screen.getByTestId('meet-join-button')).toBeEnabled();

    // Retrying once provisioning lands takes the link path.
    mockFetch.mockResolvedValue(ok({ mode: 'link', join_url: JOIN_URL, role: 'participant' }));
    clickJoin();
    await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(1));
  });

  it('renders a 403 message verbatim rather than substituting its own copy', async () => {
    const serverMessage = 'No estás en la lista de asistentes de esta sesión';
    mockFetch.mockResolvedValue(fail(403, serverMessage));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    expect(await screen.findByTestId('meet-join-error')).toHaveTextContent(serverMessage);
  });

  it('distinguishes the second 403 by rendering that message verbatim too', async () => {
    const serverMessage = 'No estás asignado como facilitador de esta sesión';
    mockFetch.mockResolvedValue(fail(403, serverMessage));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    expect(await screen.findByTestId('meet-join-error')).toHaveTextContent(serverMessage);
  });

  it('renders the 410 closed-meeting message from the server', async () => {
    mockFetch.mockResolvedValue(fail(410, 'Esta reunión ya no está disponible'));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    expect(await screen.findByTestId('meet-join-error')).toHaveTextContent(
      'Esta reunión ya no está disponible'
    );
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('renders the 503 kill-switch message from the server', async () => {
    mockFetch.mockResolvedValue(
      fail(503, 'Las videollamadas están temporalmente deshabilitadas')
    );
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    expect(await screen.findByTestId('meet-join-error')).toHaveTextContent(
      'Las videollamadas están temporalmente deshabilitadas'
    );
  });

  it('bounces a 401 to login carrying the current path, like the page SSR does', async () => {
    mockFetch.mockResolvedValue(fail(401, 'Autenticación requerida'));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        `/login?next=${encodeURIComponent(`/meet/session/${SESSION_ID}`)}`
      )
    );
    expect(screen.queryByTestId('meet-join-error')).toBeNull();
  });

  it('sends a 404 to the not-found page, keeping the denial indistinguishable', async () => {
    mockFetch.mockResolvedValue(fail(404, 'Sesión no encontrada'));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/404'));
    // The 404 body is never surfaced — it would tell the caller the denial came
    // from the join policy rather than from the session not existing.
    expect(screen.queryByTestId('meet-join-error')).toBeNull();
  });

  it('falls back to its own copy only when the request itself fails', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    expect(await screen.findByTestId('meet-join-error')).toHaveTextContent(
      'No pudimos preparar el acceso a la reunión'
    );
  });

  it('disables the button while a request is in flight', async () => {
    let release: (value: unknown) => void = () => {};
    mockFetch.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    await waitFor(() => expect(screen.getByTestId('meet-join-button')).toBeDisabled());
    release(ok({ mode: 'pending' }));
    await waitFor(() => expect(screen.getByTestId('meet-join-button')).toBeEnabled());
  });
});

/**
 * Z2-4e [G5] [G4] — the school-outage audio fallback.
 *
 * The dial-in details arrive on the same per-click response the link does and are
 * rendered from state, never from props: the assertions below are about what a
 * participant can actually read off the screen while holding a phone.
 */
describe('JoinMeetingButton — dial-in fallback', () => {
  const DIAL_IN = {
    numbers: [
      { number: '+56 2 5555 0130', country_name: 'Chile', city: 'Santiago', type: 'toll' },
      { number: '+56 32 5555 0131', country_name: 'Chile' },
    ],
    meeting_number: '90210042001',
    passcode: 'SYNTH0142',
  };

  const linkWithDialIn = () =>
    ok({ mode: 'link', join_url: JOIN_URL, role: 'participant', dial_in: DIAL_IN });

  it('renders every number, the meeting number and the passcode [G5]', async () => {
    mockFetch.mockResolvedValue(linkWithDialIn());
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    expect(await screen.findByTestId('meet-dial-in')).toBeInTheDocument();
    expect(screen.getByText('+56 2 5555 0130')).toBeInTheDocument();
    expect(screen.getByText('+56 32 5555 0131')).toBeInTheDocument();
    expect(screen.getByTestId('meet-dial-in-meeting-number')).toHaveTextContent('90210042001');
    expect(screen.getByTestId('meet-dial-in-passcode')).toHaveTextContent('SYNTH0142');
  });

  it('labels a number with whatever location Zoom sent, and omits the label when it sent none', async () => {
    mockFetch.mockResolvedValue(linkWithDialIn());
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    expect(await screen.findByText('Chile (Santiago)')).toBeInTheDocument();
    expect(screen.getByText('Chile')).toBeInTheDocument();
  });

  it('renders nothing at all when the response carries no dial_in [G4]', async () => {
    mockFetch.mockResolvedValue(ok({ mode: 'link', join_url: JOIN_URL, role: 'host' }));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    await waitFor(() => expect(mockOpen).toHaveBeenCalled());
    // No empty heading, no "no disponible" box — silence is the right answer.
    expect(screen.queryByTestId('meet-dial-in')).toBeNull();
    expect(screen.queryByText(/teléfono/i)).toBeNull();
  });

  it('renders nothing for a pending answer', async () => {
    mockFetch.mockResolvedValue(ok({ mode: 'pending' }));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    await screen.findByTestId('meet-join-pending');
    expect(screen.queryByTestId('meet-dial-in')).toBeNull();
  });

  it('drops a block that arrives without a meeting number rather than showing half of it', async () => {
    mockFetch.mockResolvedValue(
      ok({
        mode: 'link',
        join_url: JOIN_URL,
        role: 'host',
        dial_in: { numbers: DIAL_IN.numbers },
      })
    );
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    await waitFor(() => expect(mockOpen).toHaveBeenCalled());
    expect(screen.queryByTestId('meet-dial-in')).toBeNull();
  });

  it('omits the passcode row when the meeting has none, keeping the numbers', async () => {
    mockFetch.mockResolvedValue(
      ok({
        mode: 'link',
        join_url: JOIN_URL,
        role: 'host',
        dial_in: { numbers: DIAL_IN.numbers, meeting_number: DIAL_IN.meeting_number },
      })
    );
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    expect(await screen.findByTestId('meet-dial-in-meeting-number')).toBeInTheDocument();
    expect(screen.queryByTestId('meet-dial-in-passcode')).toBeNull();
  });

  it('a block from an earlier join never survives a later denial', async () => {
    mockFetch.mockResolvedValue(linkWithDialIn());
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    await screen.findByTestId('meet-dial-in');

    // The meeting is cancelled between the two clicks.
    mockFetch.mockResolvedValue(fail(410, 'Esta reunión ya no está disponible'));
    clickJoin();

    await screen.findByTestId('meet-join-error');
    expect(screen.queryByTestId('meet-dial-in')).toBeNull();
  });

  it('is not in the DOM before anything is clicked', () => {
    mockFetch.mockResolvedValue(linkWithDialIn());
    const { container } = render(<JoinMeetingButton sessionId={SESSION_ID} />);

    // The whole point of fetching per click: none of this is in the served HTML.
    expect(container.innerHTML).not.toContain(DIAL_IN.passcode);
    expect(container.innerHTML).not.toContain(DIAL_IN.meeting_number);
    expect(screen.queryByTestId('meet-dial-in')).toBeNull();
  });
});
