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
