// @vitest-environment jsdom
/**
 * The join section's passcode requirement (Z0B-2r1, Sol R1 finding ⑧).
 *
 * The passcode field used to be optional — placeholder "si la reunión no tiene clave,
 * déjalo vacío" — and `client.join()` omitted `password` when it was blank. A
 * passcode-less Zoom meeting is the configuration §5 forbids for a school surface, so
 * the field instrument should not be able to walk into one, let alone normalise it for
 * the consultores running the protocol.
 *
 * Asserted through the rendered control rather than the handler, because "required in
 * the UI" is the claim.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { restoreBrowserFacts } from '../../helpers/browser-facts';

// The page's capability probes read a pile of browser APIs on mount. jsdom supplies
// most; these are the ones it does not, and an absent API is a legitimate 'fail'
// reading rather than a crash — but the probes must not throw during render.
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(), enumerateDevices: vi.fn().mockResolvedValue([]) },
  });
});

// Both installs above have to come back out, and they need different tools:
// `vi.unstubAllGlobals()` reverts `vi.stubGlobal` and nothing else, so it cannot
// touch the `defineProperty`'d `mediaDevices`. Every jsdom suite in the run
// shares one `window`, so anything left here is inherited by the next file.
afterEach(() => {
  vi.unstubAllGlobals();
  restoreBrowserFacts();
});

import MeetDiagPage from '../../../pages/meet/diag';

describe('/meet/diag join section — passcode is required', () => {
  function renderAvailable() {
    return render(<MeetDiagPage joinAvailable />);
  }

  it('renders the join controls when the server says the feature is configured', async () => {
    renderAvailable();
    await waitFor(() => expect(screen.getByTestId('diag-join-meeting-number')).toBeInTheDocument());
    expect(screen.getByTestId('diag-join-passcode')).toBeInTheDocument();
  });

  it('marks the passcode input required', async () => {
    renderAvailable();
    const passcode = await screen.findByTestId('diag-join-passcode');
    expect(passcode).toBeRequired();
    expect(passcode).toHaveAttribute('aria-required', 'true');
  });

  it('no longer tells the tester an empty passcode is fine', async () => {
    renderAvailable();
    const passcode = await screen.findByTestId('diag-join-passcode');
    expect(passcode.getAttribute('placeholder')).not.toMatch(/vacío/i);
    expect(passcode.getAttribute('placeholder')).toMatch(/obligatoria/i);
  });

  it('disables the join button while the passcode is empty', async () => {
    renderAvailable();
    const button = await screen.findByTestId('diag-join-button');
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByTestId('diag-join-meeting-number'), {
      target: { value: '90210042001' },
    });
    // Meeting number alone is not enough.
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByTestId('diag-join-passcode'), { target: { value: 'clave123' } });
    expect(button).toBeEnabled();
  });

  it('treats whitespace as empty', async () => {
    renderAvailable();
    const button = await screen.findByTestId('diag-join-button');
    fireEvent.change(screen.getByTestId('diag-join-passcode'), { target: { value: '   ' } });
    expect(button).toBeDisabled();
  });

  it('renders the placeholder block, not the form, when the server says unconfigured', async () => {
    render(<MeetDiagPage joinAvailable={false} />);
    await waitFor(() => expect(screen.getByTestId('diag-join-placeholder')).toBeInTheDocument());
    expect(screen.queryByTestId('diag-join-meeting-number')).not.toBeInTheDocument();
    expect(screen.queryByTestId('diag-join-passcode')).not.toBeInTheDocument();
    expect(screen.queryByTestId('diag-join-button')).not.toBeInTheDocument();
  });
});
