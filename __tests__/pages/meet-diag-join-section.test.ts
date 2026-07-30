import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';

import MeetDiagPage from '@/pages/meet/diag';

/**
 * /meet/diag test-join section — SERVER RENDER (Z0B-2 item 6; prop updated in Z0B-2r1).
 *
 * The requirement locked in here: a consultora who opens this page on a school machine
 * must get a working diagnostic EVEN IF the deployment cannot do the join. In that case
 * the join block shows the "disponible próximamente" placeholder and everything else
 * still renders. A crash here would strand a field visit, so it is asserted rather than
 * assumed — and asserted at the server render, because that is the first thing the
 * school machine receives.
 *
 * **Updated in Z0B-2r1 (Sol R1 finding ⑧).** The prop was `sdkClientId: string | null`,
 * derived from `NEXT_PUBLIC_ZOOM_SDK_CLIENT_ID` — a different env contract from the one
 * `/api/meet/diag-signature` enforces. It is now `joinAvailable: boolean`, computed
 * server-side from `isDiagJoinConfigured()` (the SDK pair AND a non-empty meeting
 * allowlist), which is the same predicate the API's first gate uses.
 *
 * Division of labour, so none of these three files repeats another:
 *  - THIS file: what the server render contains for each value of `joinAvailable`.
 *  - `pages/meet/diag-ssr.test.ts`: how `getServerSideProps` computes that value across
 *    partial configurations.
 *  - `pages/meet/diag-join-passcode.test.tsx`: the interactive passcode requirement,
 *    under jsdom.
 *
 * (The previous version of this comment said the repo "has no jsdom dependency and no
 * DOM test environment configured". That was wrong when written — other suites use
 * `// @vitest-environment jsdom` — and the passcode file now does too.)
 */

describe('/meet/diag — join section gating (server render)', () => {
  const unavailable = () => renderToStaticMarkup(createElement(MeetDiagPage, { joinAvailable: false }));
  const available = () => renderToStaticMarkup(createElement(MeetDiagPage, { joinAvailable: true }));

  it('renders the placeholder and no join controls when the join is unavailable', () => {
    const html = unavailable();

    expect(html).toContain('Prueba de conexión: disponible próximamente.');
    expect(html).toContain('data-testid="diag-join-placeholder"');
    // The controls must not exist at all — a disabled-but-present button would
    // invite a tester to press it and report a failure that is not a failure.
    expect(html).not.toContain('data-testid="diag-join-button"');
    expect(html).not.toContain('data-testid="diag-join-meeting-number"');
  });

  it('still renders the rest of the diagnostic when the join is unavailable', () => {
    const html = unavailable();

    // The parts of the instrument that must survive an unconfigured deployment.
    expect(html).toContain('data-testid="diag-media-probe-button"');
    expect(html).toContain('data-testid="diag-copy-button"');
    expect(html).toContain('data-testid="diag-report-json"');
    expect(html).toContain('Diagnóstico del equipo');
  });

  it('renders the join controls when the server says the join is available', () => {
    const html = available();

    expect(html).toContain('data-testid="diag-join-meeting-number"');
    expect(html).toContain('data-testid="diag-join-passcode"');
    expect(html).toContain('data-testid="diag-join-button"');
    expect(html).toContain('data-testid="diag-join-sdk-root"');
    expect(html).not.toContain('data-testid="diag-join-placeholder"');
  });

  it('marks the passcode required in the server render, and starts the button disabled', () => {
    // Rendered state, not interaction: the very first paint must already say the
    // passcode is mandatory (Sol R1 ⑧) rather than waiting for a client hydration.
    const html = available();

    expect(html).toMatch(/data-testid="diag-join-passcode"[^>]*required|required[^>]*data-testid="diag-join-passcode"/);
    expect(html).toContain('Obligatoria');
    expect(html).not.toContain('déjalo vacío');
    expect(html).toMatch(/<button[^>]*disabled[^>]*data-testid="diag-join-button"|data-testid="diag-join-button"[^>]*disabled/);
  });

  it('always reports the time-to-join probe in the copyable JSON', () => {
    // The B1 threshold is the embed gate, so an unmeasured reading and a blank
    // column are different facts. The row exists before any join is attempted.
    const html = unavailable();

    expect(html).toContain('diag-row-test-join');
    expect(html).toContain('Tiempo hasta entrar a la reunión');
    expect(html).toContain('Sin medir');
  });

  it('puts no Zoom credential into the server-rendered page, either way', () => {
    // The page never receives the SDK key now: the join gets it from the API
    // response. So nothing credential-shaped can reach the HTML from props.
    for (const html of [unavailable(), available()]) {
      expect(html).not.toContain('ZOOM_SDK');
      expect(html).not.toContain('sdkClientId');
    }
  });
});
