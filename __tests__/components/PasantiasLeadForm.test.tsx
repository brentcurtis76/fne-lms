// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import LeadForm from '../../components/pasantias/LeadForm';
import { COHORT_ID } from '../../lib/pasantias/cohort-public';
import {
  CONSENT_PROCESSING_TEXT,
  PRIVACY_POLICY_LINK_LABEL,
  PRIVACY_POLICY_PATH,
} from '../../lib/pasantias/consent';
import { LEAD_FIELD_LIMITS, LEAD_VALIDATION_MESSAGES } from '../../lib/pasantias/leads';

/**
 * The lead form's client behaviour. Every expectation about copy or field names
 * is imported from the frozen A5 modules — a test that retyped the es-CL
 * sentence would go green against a form that says something else.
 *
 * The D-12 assertions (separate checkboxes, marketing unchecked, `consent`
 * strictly boolean) are the ones that matter legally: a form that posts `'on'`
 * is rejected by the route, and a marketing box that starts checked is consent
 * nobody gave.
 */

const ENDPOINT = '/api/pasantias/lead';

/** A complete, valid set of required answers. Says nothing about the cohort. */
const VALID = {
  firstName: 'Camila',
  lastName: 'Rojas',
  email: 'camila.rojas@example.cl',
  institution: 'Colegio de Prueba',
};

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

function postedBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0];
  return JSON.parse((init as RequestInit).body as string);
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
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

    // The whole sentence must still read as one sentence: a split that dropped
    // or duplicated a character passes the link check and fails this one.
    const label = container.querySelector('label[for="consent"]') as HTMLElement;
    expect(label.textContent?.replace(/\s+/g, ' ').trim()).toBe(CONSENT_PROCESSING_TEXT);
  });

  it('does not hit the network on an empty submit, and focuses the first invalid control', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(200, { success: true }));
    render(<LeadForm />);

    await user.click(screen.getByTestId('pasantias-lead-submit'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('pasantias-lead-error-firstName')).toHaveTextContent(
      LEAD_VALIDATION_MESSAGES.firstNameRequired
    );
    expect(screen.getByTestId('pasantias-lead-error-lastName')).toHaveTextContent(
      LEAD_VALIDATION_MESSAGES.lastNameRequired
    );
    expect(screen.getByTestId('pasantias-lead-error-email')).toHaveTextContent(
      LEAD_VALIDATION_MESSAGES.emailRequired
    );
    expect(screen.getByTestId('pasantias-lead-error-institution')).toHaveTextContent(
      LEAD_VALIDATION_MESSAGES.institutionRequired
    );
    expect(screen.getByTestId('pasantias-lead-error-consent')).toHaveTextContent(
      LEAD_VALIDATION_MESSAGES.consentRequired
    );
    expect(screen.getByTestId('pasantias-lead-first-name')).toHaveFocus();
  });

  it('posts the cohort, a strictly boolean consent and no marketing opt-in by default', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(200, { success: true }));
    render(<LeadForm />);

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json' });

    const body = postedBody(fetchMock);
    expect(body.cohort).toBe(COHORT_ID);
    expect(body.firstName).toBe(VALID.firstName);
    expect(body.email).toBe(VALID.email);
    expect(body.institution).toBe(VALID.institution);
    expect(body.consent).toBe(true);
    expect(typeof body.consent).toBe('boolean');
    expect(body.marketingOptIn).toBeFalsy();
  });

  it('posts marketingOptIn true only when the optional box is clicked', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse(200, { success: true }));
    render(<LeadForm />);

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-marketing-optin'));
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(postedBody(fetchMock).marketingOptIn).toBe(true);
    // The two boxes are independent: the required one is still true on its own.
    expect(postedBody(fetchMock).consent).toBe(true);
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

  it('replaces the form with a status panel linking to the brochure on 200', async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse(200, { success: true }));
    render(<LeadForm />);

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    const panel = await screen.findByRole('status');
    expect(panel).toHaveAttribute('data-testid', 'pasantias-lead-success');
    expect(within(panel).getByTestId('pasantias-lead-brochure')).toHaveAttribute(
      'href',
      '/api/pasantias/brochure'
    );
    expect(screen.queryByTestId('pasantias-lead-form')).toBeNull();
  });

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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(pending)
    );
    render(<LeadForm />);

    await fillRequired(user);
    await user.click(screen.getByTestId('pasantias-lead-submit'));

    const submit = screen.getByTestId('pasantias-lead-submit');
    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit).toHaveAttribute('aria-busy', 'true');

    resolveRequest(jsonResponse(500, { error: 'Error al guardar la solicitud' }));

    await waitFor(() => expect(screen.getByTestId('pasantias-lead-submit')).not.toBeDisabled());
  });
});
