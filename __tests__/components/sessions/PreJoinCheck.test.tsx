// @vitest-environment jsdom
/**
 * Z3-3 [C8] — the preflight a user sees before the embedded meeting mounts.
 *
 * The claim under test is what the person standing at a school machine reads, so every
 * assertion below is against rendered es-CL copy rather than against a returned state:
 * three device answers that must be told apart, and an engine the browser either has
 * or does not.
 *
 * Synthetic navigator only — nothing here touches a real device.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import PreJoinCheck from '../../../components/sessions/PreJoinCheck';

function setNavigator(values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(window.navigator, key, { value, configurable: true });
  }
}

/** jsdom has no media stack at all; every test states the one it wants. */
function withPermission(state: 'granted' | 'denied' | 'prompt') {
  setNavigator({
    mediaDevices: { getUserMedia: vi.fn() },
    permissions: { query: vi.fn().mockResolvedValue({ state }) },
  });
}

const noop = () => {};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PreJoinCheck [C8]', () => {
  it('distinguishes a granted permission', async () => {
    withPermission('granted');
    render(<PreJoinCheck onContinue={noop} onUseLink={noop} busy={false} />);

    await waitFor(() =>
      expect(screen.getByTestId('meet-prejoin-camera')).toHaveTextContent('Permiso concedido')
    );
    expect(screen.getByTestId('meet-prejoin-microphone')).toHaveTextContent('Permiso concedido');
  });

  it('distinguishes a denied permission, and says the meeting is still joinable', async () => {
    withPermission('denied');
    render(<PreJoinCheck onContinue={noop} onUseLink={noop} busy={false} />);

    const camera = await screen.findByTestId('meet-prejoin-camera');
    await waitFor(() => expect(camera).toHaveTextContent('Permiso bloqueado'));
    // A blocked camera is a meeting joined with the camera off — never a refusal.
    expect(camera).toHaveTextContent('Puedes entrar igual');
    expect(screen.getByTestId('meet-prejoin-continue')).toBeEnabled();
  });

  it('distinguishes a browser with no media stack at all as unavailable', async () => {
    setNavigator({ mediaDevices: undefined });
    render(<PreJoinCheck onContinue={noop} onUseLink={noop} busy={false} />);

    await waitFor(() =>
      expect(screen.getByTestId('meet-prejoin-camera')).toHaveTextContent(
        'No disponible en este navegador'
      )
    );
    expect(screen.getByTestId('meet-prejoin-microphone')).toHaveTextContent(
      'No disponible en este navegador'
    );
  });

  it('distinguishes a browser that will prompt from one that already answered', async () => {
    withPermission('prompt');
    render(<PreJoinCheck onContinue={noop} onUseLink={noop} busy={false} />);

    await waitFor(() =>
      expect(screen.getByTestId('meet-prejoin-camera')).toHaveTextContent('Se pedirá permiso')
    );
  });

  it('reports the video engine separately from the devices', async () => {
    withPermission('granted');
    render(<PreJoinCheck onContinue={noop} onUseLink={noop} busy={false} />);

    expect(screen.getByTestId('meet-prejoin-engine')).toHaveTextContent('Compatible');
  });

  it('never asks for a device to find out what the answer is', async () => {
    const getUserMedia = vi.fn();
    setNavigator({
      mediaDevices: { getUserMedia },
      permissions: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
    });
    render(<PreJoinCheck onContinue={noop} onUseLink={noop} busy={false} />);

    await waitFor(() =>
      expect(screen.getByTestId('meet-prejoin-camera')).toHaveTextContent('Permiso concedido')
    );
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('offers both exits, and stands them down while a join is in flight', async () => {
    withPermission('granted');
    const onContinue = vi.fn();
    const onUseLink = vi.fn();
    const { rerender } = render(
      <PreJoinCheck onContinue={onContinue} onUseLink={onUseLink} busy={false} />
    );

    fireEvent.click(screen.getByTestId('meet-prejoin-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('meet-prejoin-use-link'));
    expect(onUseLink).toHaveBeenCalledTimes(1);

    rerender(<PreJoinCheck onContinue={onContinue} onUseLink={onUseLink} busy />);
    expect(screen.getByTestId('meet-prejoin-continue')).toBeDisabled();
    expect(screen.getByTestId('meet-prejoin-use-link')).toBeDisabled();
  });
});
