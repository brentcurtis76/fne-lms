// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import LeadForm, {
  GENERIC_ERROR,
  PRE_SUBMIT_COPY,
  SUCCESS_TITLE,
  UNRENDERABLE_ERROR,
  type ProgramRequest,
} from '../../components/pasantias/LeadForm';
import { COHORT_ID } from '../../lib/pasantias/cohort-public';
import {
  CONSENT_PROCESSING_TEXT,
  PRIVACY_POLICY_LINK_LABEL,
  PRIVACY_POLICY_PATH,
} from '../../lib/pasantias/consent';
import { LEAD_FIELD_LIMITS, LEAD_VALIDATION_MESSAGES } from '../../lib/pasantias/leads';

/**
 * The lead form's client behaviour. Copy and field names the form shares with
 * the route are imported from the frozen A5 modules — a test that retyped the
 * es-CL validation sentence would go green against a form that says something
 * else. January facts the form shows (program names, audiences, document URLs)
 * are typed here from the ratified contract, independently of the module.
 *
 * D-12 (separate checkboxes, marketing unchecked, `consent` strictly boolean)
 * and C007 (exactly one program per submission, visible and focusable program
 * errors, success only after a stored response, no e-mail promise) are the
 * properties that matter.
 */

const ENDPOINT = '/api/pasantias/lead';

/** Contract §2–3, typed here: the two programs, their names and audiences. */
const PROGRAMS = {
  inspira: { name: 'Pasantía INSPIRA', audience: 'Equipos que viajan por primera vez' },
  'mirada-profunda': { name: 'INSPIRA Mirada Profunda', audience: 'Quienes ya viajaron con INSPIRA' },
} as const;

type Program = keyof typeof PROGRAMS;

/** A complete, valid set of required answers. Says nothing about the cohort. */
const VALID = {
  firstName: 'Camila',
  lastName: 'Rojas',
  email: 'camila.rojas@example.cl',
  institution: 'Colegio de Prueba',
};

/**
 * Wording that would promise an e-mail was or will be sent (contract §6,
 * DEC-07). "el mismo correo" — the address to reuse — is not a promise.
 */
const MAIL_PROMISE =
  /te (?:enviamos|enviaremos|escribiremos|llegar[áa])|recibir[áa]s|enviado a tu correo|revisa tu (?:correo|bandeja)|por correo te|te mandamos/i;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function mockFetch(response: Response | Promise<Response>) {
  const fetchMock = vi.fn().mockReturnValue(Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function postedBody(fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[call];
  return JSON.parse((init as RequestInit).body as string);
}

function programRadio(program: Program): HTMLInputElement {
  return screen.getByTestId(`pasantias-lead-program-${program}`) as HTMLInputElement;
}

async function fillRequired(
  user: ReturnType<typeof userEvent.setup>,
  program: Program | null = 'inspira'
) {
  if (program) await user.click(programRadio(program));
  await user.type(screen.getByTestId('pasantias-lead-first-name'), VALID.firstName);
  await user.type(screen.getByTestId('pasantias-lead-last-name'), VALID.lastName);
  await user.type(screen.getByTestId('pasantias-lead-email'), VALID.email);
  await user.type(screen.getByTestId('pasantias-lead-institution'), VALID.institution);
  await user.click(screen.getByTestId('pasantias-consent'));
}

describe('PasantiasLeadForm', () => {
  beforeEach(() => {
    mockFetch(jsonResponse(200, { success: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // The component reads `window.location.search` on mount, so a test that set
    // a query string must not leak it into the next one.
    window.history.replaceState({}, '', '/pasantias');
  });

  it('renders both consents as separate controls, both unchecked on first render', () => {
    render(<LeadForm />);

    const processing = screen.getByTestId('pasantias-consent') as HTMLInputElement;
    const marketing = screen.getByTestId('pasantias-marketing-optin') as HTMLInputElement;

    expect(processing).not.toBe(marketing);
    expect(processing.type).toBe('checkbox');
    expect(marketing.type).toBe('checkbox');
    expect(processing.name).toBe('consent');
    expect(marketing.name).toBe('marketingOptIn');
    expect(processing.checked).toBe(false);
    expect(marketing.checked).toBe(false);
  });

  it('renders the privacy link inside the processing sentence without breaking it', () => {
    const { container } = render(<LeadForm />);

    const link = screen.getByTestId('pasantias-consent-privacy-link');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', PRIVACY_POLICY_PATH);
    expect(link.textContent).toBe(PRIVACY_POLICY_LINK_LABEL);

    const label = container.querySelector('label[for="consent"]') as HTMLElement;
    expect(label.textContent?.replace(/\s+/g, ' ').trim()).toBe(CONSENT_PROCESSING_TEXT);
  });

  /* ------------------------------------------------- the program choice (C007) */

  it('offers both programs as one radio group, with names and audiences, none preselected', () => {
    render(<LeadForm />);

    const group = screen.getByTestId('pasantias-lead-program');
    expect(group.tagName).toBe('FIELDSET');
    expect(within(group).getByText('Programa')).toBeInTheDocument();

    for (const [program, { name, audience }] of Object.entries(PROGRAMS) as [Program, (typeof PROGRAMS)[Program]][]) {
      const radio = programRadio(program);
      expect(radio.type).toBe('radio');
      expect(radio.name).toBe('program');
      expect(radio.value).toBe(program);
      expect(radio.checked).toBe(false);
      const label = group.querySelector(`label[for="${radio.id}"]`) as HTMLElement;
      expect(label).toHaveTextContent(name);
      expect(label).toHaveTextContent(audience);
    }
    // Exactly two options: immersion and visits are not programs.
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
  });

  it('refuses to submit without a program, shows the error under the group and focuses it', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(200, { success: true }));
    render(<LeadForm />);

    await fillRequired(user, null);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('pasantias-lead-error-program')).toHaveTextContent(
      LEAD_VALIDATION_MESSAGES.programRequired
    );
    expect(programRadio('inspira')).toHaveFocus();
    expect(programRadio('inspira')).not.toHaveAttribute('aria-invalid');
    expect(programRadio('mirada-profunda')).not.toHaveAttribute('aria-invalid');
    expect(programRadio('inspira')).toHaveAttribute('aria-describedby', 'program-error');
    expect(programRadio('mirada-profunda')).toHaveAttribute('aria-describedby', 'program-error');
    expect(screen.getByTestId('pasantias-lead-program')).toHaveAttribute(
      'aria-describedby',
      'program-error'
    );
    // Choosing a program clears the error.
    await user.click(programRadio('mirada-profunda'));
    expect(screen.queryByTestId('pasantias-lead-error-program')).toBeNull();
  });

  it('does not hit the network on an empty submit, and focuses the first invalid control', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(200, { success: true }));
    render(<LeadForm />);

    await user.click(screen.getByTestId('pasantias-lead-submit'));

    expect(fetchMock).not.toHaveBeenCalled();
    for (const [testId, message] of [
      ['pasantias-lead-error-program', LEAD_VALIDATION_MESSAGES.programRequired],
      ['pasantias-lead-error-firstName', LEAD_VALIDATION_MESSAGES.firstNameRequired],
      ['pasantias-lead-error-lastName', LEAD_VALIDATION_MESSAGES.lastNameRequired],
      ['pasantias-lead-error-email', LEAD_VALIDATION_MESSAGES.emailRequired],
      ['pasantias-lead-error-institution', LEAD_VALIDATION_MESSAGES.institutionRequired],
      ['pasantias-lead-error-consent', LEAD_VALIDATION_MESSAGES.consentRequired],
    ] as const) {
      expect(screen.getByTestId(testId)).toHaveTextContent(message);
    }
    // The program group is first in the form, so it takes focus first.
    expect(programRadio('inspira')).toHaveFocus();
  });

  it('focuses the first invalid text field when the program is already chosen', async () => {
    const user = userEvent.setup();
    render(<LeadForm />);

    await user.click(programRadio('mirada-profunda'));
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    expect(screen.queryByTestId('pasantias-lead-error-program')).toBeNull();
    expect(screen.getByTestId('pasantias-lead-first-name')).toHaveFocus();
  });

  it.each(Object.keys(PROGRAMS) as Program[])(
    'posts exactly one program — %s — with the cohort and strictly boolean consents',
    async (program) => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse(200, { success: true }));
      render(<LeadForm />);

      await fillRequired(user, program);
      await user.click(screen.getByTestId('pasantias-lead-submit'));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(ENDPOINT);
      expect((init as RequestInit).method).toBe('POST');
      expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json' });

      const body = postedBody(fetchMock);
      expect(body.cohort).toBe(COHORT_ID);
      expect(body.cohort).toBe('enero-2027');
      expect(body.program).toBe(program);
      expect(Array.isArray(body.program)).toBe(false);
      expect(body.firstName).toBe(VALID.firstName);
      expect(body.email).toBe(VALID.email);
      expect(body.institution).toBe(VALID.institution);
      expect(body.consent).toBe(true);
      expect(typeof body.consent).toBe('boolean');
      expect(body.marketingOptIn).toBe(false);
    }
  );

  it('lets the visitor change the program before submitting; only the last choice is posted', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(200, { success: true }));
    render(<LeadForm />);

    await fillRequired(user, 'inspira');
    await user.click(programRadio('mirada-profunda'));
    expect(programRadio('inspira').checked).toBe(false);
    expect(programRadio('mirada-profunda').checked).toBe(true);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(postedBody(fetchMock).program).toBe('mirada-profunda');
  });

  it('moves the choice with the arrow keys, as one radio group', async () => {
    const user = userEvent.setup();
    render(<LeadForm />);

    programRadio('inspira').focus();
    await user.keyboard(' ');
    expect(programRadio('inspira').checked).toBe(true);
    await user.keyboard('{ArrowRight}');
    expect(programRadio('mirada-profunda').checked).toBe(true);
    expect(programRadio('mirada-profunda')).toHaveFocus();
  });

  it('preselects the program a page CTA requested, and the visitor can still change it', async () => {
    const user = userEvent.setup();
    const request: ProgramRequest = { program: 'mirada-profunda', nonce: 1 };
    const { rerender } = render(<LeadForm requestedProgram={request} />);

    await waitFor(() => expect(programRadio('mirada-profunda').checked).toBe(true));

    await user.click(programRadio('inspira'));
    expect(programRadio('inspira').checked).toBe(true);

    // Re-rendering with the same request does not override the visitor.
    rerender(<LeadForm requestedProgram={request} />);
    expect(programRadio('inspira').checked).toBe(true);

    // Clicking a CTA again (a new nonce) re-applies it.
    rerender(<LeadForm requestedProgram={{ program: 'mirada-profunda', nonce: 2 }} />);
    await waitFor(() => expect(programRadio('mirada-profunda').checked).toBe(true));
  });

  it('renders a 400 program error from the route against the group, keeping every answer', async () => {
    const user = userEvent.setup();
    mockFetch(
      jsonResponse(400, {
        error: 'Revisa los datos del formulario.',
        fields: { program: LEAD_VALIDATION_MESSAGES.programInvalid },
      })
    );
    render(<LeadForm />);

    await fillRequired(user, 'mirada-profunda');
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    const error = await screen.findByTestId('pasantias-lead-error-program');
    expect(error).toHaveTextContent(LEAD_VALIDATION_MESSAGES.programInvalid);
    expect(programRadio('mirada-profunda')).toHaveFocus();
    expect(programRadio('mirada-profunda').checked).toBe(true);
    expect(screen.getByTestId('pasantias-lead-email')).toHaveValue(VALID.email);
  });

  it('keeps the chosen program and every answer after a failure, and the retry posts it again', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { error: 'Error al guardar la solicitud' }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LeadForm />);

    await fillRequired(user, 'mirada-profunda');
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    expect(await screen.findByTestId('pasantias-lead-form-error')).toHaveTextContent(GENERIC_ERROR);
    expect(screen.queryByTestId('pasantias-lead-success')).toBeNull();
    expect(programRadio('mirada-profunda').checked).toBe(true);

    await user.click(screen.getByTestId('pasantias-lead-submit'));

    expect(await screen.findByTestId('pasantias-lead-success')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(postedBody(fetchMock, 1).program).toBe('mirada-profunda');
    expect(postedBody(fetchMock, 1).email).toBe(VALID.email);
  });

  /* -------------------------------------------- consents (D-12) and the body */

  it('posts marketingOptIn true only when the optional box is clicked', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(200, { success: true }));
    render(<LeadForm />);

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-marketing-optin'));
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(postedBody(fetchMock).marketingOptIn).toBe(true);
    expect(postedBody(fetchMock).consent).toBe(true);
  });

  it('refuses to submit without processing consent, even with marketing ticked', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(200, { success: true }));
    render(<LeadForm />);

    await user.click(programRadio('inspira'));
    await user.type(screen.getByTestId('pasantias-lead-first-name'), VALID.firstName);
    await user.type(screen.getByTestId('pasantias-lead-last-name'), VALID.lastName);
    await user.type(screen.getByTestId('pasantias-lead-email'), VALID.email);
    await user.type(screen.getByTestId('pasantias-lead-institution'), VALID.institution);
    await user.click(screen.getByTestId('pasantias-marketing-optin'));
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('pasantias-lead-error-consent')).toHaveTextContent(
      LEAD_VALIDATION_MESSAGES.consentRequired
    );
    expect(screen.getByTestId('pasantias-consent')).toHaveFocus();
  });

  it('ships a honeypot that is out of the tab order and posted with the body', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(200, { success: true }));
    render(<LeadForm />);

    const honeypot = screen.getByTestId('pasantias-lead-website') as HTMLInputElement;
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(postedBody(fetchMock)).toHaveProperty('website', '');
  });

  /* --------------------------------------------- truthful copy and success (C007) */

  it('promises the registration and the documents before submitting, never an e-mail', () => {
    render(<LeadForm />);

    const intro = screen.getByTestId('pasantias-lead-intro');
    expect(intro).toHaveTextContent(PRE_SUBMIT_COPY);
    expect(PRE_SUBMIT_COPY).toMatch(/registrar tu interés/);
    expect(PRE_SUBMIT_COPY).toMatch(/descargar de inmediato la ficha y el programa completo/);
    expect(PRE_SUBMIT_COPY).not.toMatch(MAIL_PROMISE);
    expect(screen.getByTestId('pasantias-lead-submit')).toHaveTextContent('Registrar mi interés');
  });

  it('shows success only after a stored response: the program, both documents, no e-mail promise', async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse(200, { success: true }));
    render(<LeadForm />);

    await fillRequired(user, 'mirada-profunda');
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    const panel = await screen.findByRole('status');
    expect(panel).toHaveAttribute('data-testid', 'pasantias-lead-success');
    expect(panel).toHaveFocus();
    expect(within(panel).getByText(SUCCESS_TITLE)).toBeInTheDocument();
    expect(SUCCESS_TITLE).toBe('Solicitud registrada');
    expect(within(panel).getByTestId('pasantias-lead-success-program')).toHaveTextContent(
      `Registramos tu interés en ${PROGRAMS['mirada-profunda'].name}`
    );
    expect(within(panel).getByTestId('pasantias-lead-ficha')).toHaveAttribute(
      'href',
      '/api/pasantias/ficha'
    );
    expect(within(panel).getByTestId('pasantias-lead-brochure')).toHaveAttribute(
      'href',
      '/api/pasantias/brochure'
    );
    expect(panel.textContent ?? '').not.toMatch(MAIL_PROMISE);
    expect(screen.queryByTestId('pasantias-lead-form')).toBeNull();
  });

  it.each([
    ['an empty body', {}],
    ['success: false', { success: false }],
    ['a truthy non-boolean', { success: 'true' }],
  ])('treats a 2xx with %s as a failure, not a registration', async (_label, body) => {
    const user = userEvent.setup();
    mockFetch(jsonResponse(200, body));
    render(<LeadForm />);

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    expect(await screen.findByTestId('pasantias-lead-form-error')).toHaveTextContent(GENERIC_ERROR);
    expect(screen.queryByTestId('pasantias-lead-success')).toBeNull();
    expect(screen.getByTestId('pasantias-lead-email')).toHaveValue(VALID.email);
  });

  it('offers the other program with the same address, and the second submission is its own consent', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(200, { success: true }));
    render(<LeadForm />);

    await fillRequired(user, 'inspira');
    await user.click(screen.getByTestId('pasantias-marketing-optin'));
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    const panel = await screen.findByTestId('pasantias-lead-success');
    const other = within(panel).getByTestId('pasantias-lead-other-program');
    expect(other).toHaveTextContent(PROGRAMS['mirada-profunda'].name);
    await user.click(other);

    // Back on the form: the other program chosen, the typed answers kept, and
    // both consents unchecked — a tick is never reused for another submission.
    expect(programRadio('mirada-profunda').checked).toBe(true);
    expect(screen.getByTestId('pasantias-lead-email')).toHaveValue(VALID.email);
    expect(screen.getByTestId('pasantias-lead-first-name')).toHaveValue(VALID.firstName);
    expect(screen.getByTestId('pasantias-consent')).not.toBeChecked();
    expect(screen.getByTestId('pasantias-marketing-optin')).not.toBeChecked();

    await user.click(screen.getByTestId('pasantias-consent'));
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const first = postedBody(fetchMock, 0);
    const second = postedBody(fetchMock, 1);
    expect([first.program, second.program]).toEqual(['inspira', 'mirada-profunda']);
    expect(second.email).toBe(first.email);
    expect([first.marketingOptIn, second.marketingOptIn]).toEqual([true, false]);
    expect(await screen.findByTestId('pasantias-lead-success-program')).toHaveTextContent(
      PROGRAMS['mirada-profunda'].name
    );
  });

  /* ----------------------------------------------------------- failure paths */

  it('renders a 400 field error against its input and keeps the other answers', async () => {
    const user = userEvent.setup();
    mockFetch(
      jsonResponse(400, {
        error: 'Revisa los datos del formulario.',
        fields: { email: LEAD_VALIDATION_MESSAGES.emailInvalid },
      })
    );
    render(<LeadForm />);

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    const error = await screen.findByTestId('pasantias-lead-error-email');
    expect(error).toHaveTextContent(LEAD_VALIDATION_MESSAGES.emailInvalid);

    const email = screen.getByTestId('pasantias-lead-email');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAttribute('aria-describedby', 'email-error');
    expect(email).toHaveValue(VALID.email);
    expect(screen.getByTestId('pasantias-lead-first-name')).toHaveValue(VALID.firstName);
    expect(screen.getByTestId('pasantias-lead-institution')).toHaveValue(VALID.institution);
    expect(programRadio('inspira').checked).toBe(true);
  });

  it('keeps every typed value on a 500 and shows one generic error', async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse(500, { error: 'Error al guardar la solicitud' }));
    render(<LeadForm />);

    await fillRequired(user);
    await user.type(screen.getByTestId('pasantias-lead-phone'), '912345678');
    await user.click(screen.getByTestId('pasantias-marketing-optin'));
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    expect(await screen.findByTestId('pasantias-lead-form-error')).toBeInTheDocument();
    expect(screen.getByTestId('pasantias-lead-form')).toBeInTheDocument();
    expect(screen.getByTestId('pasantias-lead-first-name')).toHaveValue(VALID.firstName);
    expect(screen.getByTestId('pasantias-lead-last-name')).toHaveValue(VALID.lastName);
    expect(screen.getByTestId('pasantias-lead-email')).toHaveValue(VALID.email);
    expect(screen.getByTestId('pasantias-lead-institution')).toHaveValue(VALID.institution);
    expect(screen.getByTestId('pasantias-lead-phone')).toHaveValue('912345678');
    expect(screen.getByTestId('pasantias-consent')).toBeChecked();
    expect(screen.getByTestId('pasantias-marketing-optin')).toBeChecked();
    expect(programRadio('inspira').checked).toBe(true);
  });

  it('keeps every value when the network itself fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    render(<LeadForm />);

    await fillRequired(user, 'mirada-profunda');
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    expect(await screen.findByTestId('pasantias-lead-form-error')).toHaveTextContent(GENERIC_ERROR);
    expect(programRadio('mirada-profunda').checked).toBe(true);
    expect(screen.getByTestId('pasantias-lead-email')).toHaveValue(VALID.email);
  });

  it('caps the message without a maxlength attribute (the D-02 collision)', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(200, { success: true }));
    render(<LeadForm />);

    // `maxlength="1000"` in the markup is the retired €1.000 fee as far as the
    // page's D-02 scan is concerned, so the attribute is deliberately absent and
    // the validator carries the cap alone. This test is what keeps that honest.
    const message = screen.getByTestId('pasantias-lead-message');
    expect(message).not.toHaveAttribute('maxlength');

    await fillRequired(user);
    fireEvent.change(message, { target: { value: 'a'.repeat(LEAD_FIELD_LIMITS.message + 1) } });
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    expect(screen.getByTestId('pasantias-lead-error-message')).toHaveTextContent(
      LEAD_VALIDATION_MESSAGES.tooLong(LEAD_FIELD_LIMITS.message)
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables the submit control while the request is in flight', async () => {
    const user = userEvent.setup();
    let resolveRequest: (value: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending));
    render(<LeadForm />);

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    const submit = screen.getByTestId('pasantias-lead-submit');
    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit).toHaveAttribute('aria-busy', 'true');

    resolveRequest(jsonResponse(500, { error: 'Error al guardar la solicitud' }));

    await waitFor(() => expect(screen.getByTestId('pasantias-lead-submit')).not.toBeDisabled());
  });

  /* ------------------------------------------------------- r2: no dead form */

  const OVER_CAP_UTM = 'a'.repeat(LEAD_FIELD_LIMITS.utm + 1);

  it('drops an over-limit utm_source instead of stranding the lead', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(200, { success: true }));
    window.history.replaceState({}, '', `/pasantias?utm_source=${OVER_CAP_UTM}`);
    render(<LeadForm />);

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('pasantias-lead-success')).toBeInTheDocument();

    const body = postedBody(fetchMock);
    expect(body.utmSource === undefined || body.utmSource === '').toBe(true);
  });

  it('drops only the unusable utm value and keeps the other two intact', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(200, { success: true }));
    window.history.replaceState(
      {},
      '',
      `/pasantias?utm_source=${OVER_CAP_UTM}&utm_medium=email&utm_campaign=inspira`
    );
    render(<LeadForm />);

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = postedBody(fetchMock);
    expect(body.utmSource === undefined || body.utmSource === '').toBe(true);
    expect(body.utmMedium).toBe('email');
    expect(body.utmCampaign).toBe('inspira');
  });

  it('shows the form-level error for a stale form whose only 400 key is cohort', async () => {
    const user = userEvent.setup();
    mockFetch(
      jsonResponse(400, {
        error: 'Revisa los datos del formulario.',
        fields: { cohort: LEAD_VALIDATION_MESSAGES.cohortInvalid },
      })
    );
    render(<LeadForm />);

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    // `cohort` has no control on this form, so without the fallback the visitor
    // would be left with a button that did nothing at all.
    expect(await screen.findByTestId('pasantias-lead-form-error')).toHaveTextContent(
      UNRENDERABLE_ERROR
    );
    expect(screen.getByTestId('pasantias-lead-form')).toBeInTheDocument();
    expect(screen.getByTestId('pasantias-lead-submit')).not.toBeDisabled();
    expect(screen.getByTestId('pasantias-lead-email')).toHaveValue(VALID.email);
  });

  /**
   * The class, not the instances: every key `validateLeadSubmission` can put in
   * `errors` must either render against its own control or raise the form-level
   * message. Derived from the frozen modules, so `program` (added for January)
   * is covered without anyone remembering to add a case here.
   */
  const VALIDATOR_ERROR_KEYS = Array.from(
    new Set([
      ...Object.entries(LEAD_VALIDATION_MESSAGES)
        .filter(([, message]) => typeof message === 'string')
        .map(([key]) => key.replace(/(Required|Invalid)$/, '')),
      ...Object.keys(LEAD_FIELD_LIMITS).flatMap((key) =>
        key === 'utm' ? ['utmSource', 'utmMedium', 'utmCampaign'] : [key]
      ),
    ])
  );

  it('derives the program key among the validator’s error keys', () => {
    expect(VALIDATOR_ERROR_KEYS).toContain('program');
    expect(VALIDATOR_ERROR_KEYS).toContain('cohort');
  });

  it.each(VALIDATOR_ERROR_KEYS)('never holds %s as an invisible error', async (key) => {
    const user = userEvent.setup();
    mockFetch(jsonResponse(400, { error: 'ignorado', fields: { [key]: 'Mensaje del servidor.' } }));
    render(<LeadForm />);

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    await waitFor(() => {
      const fieldError = screen.queryByTestId(`pasantias-lead-error-${key}`);
      const formLevel = screen.queryByTestId('pasantias-lead-form-error');
      expect(
        Boolean(fieldError) || Boolean(formLevel),
        `an error keyed "${key}" is rendered nowhere: no control shows it and the form-level fallback did not fire`
      ).toBe(true);
    });
  });

  it('renders its own generic sentence on a 500, not the server string', async () => {
    const user = userEvent.setup();
    const serverString = 'Detalle interno que jamas debe llegar a la pagina';
    mockFetch(jsonResponse(500, { error: serverString }));
    render(<LeadForm />);

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    const error = await screen.findByTestId('pasantias-lead-form-error');
    expect(error).toHaveTextContent(GENERIC_ERROR);
    expect(error.textContent).not.toContain(serverString);
  });

  it('renders its own generic sentence on a 429, not the server string', async () => {
    const user = userEvent.setup();
    const serverString = 'Too many requests from this address';
    mockFetch(jsonResponse(429, { error: serverString }));
    render(<LeadForm />);

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    const error = await screen.findByTestId('pasantias-lead-form-error');
    expect(error).toHaveTextContent(GENERIC_ERROR);
    expect(error.textContent).not.toContain(serverString);
  });
});
