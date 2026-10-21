import { test, expect, type Page } from '@playwright/test';

import { LEAD_FIELD_LIMITS, LEAD_VALIDATION_MESSAGES } from '../../lib/pasantias/leads';

/**
 * A6b — the `/pasantias` lead form, on the real page, for the January 2027 cohort.
 *
 * ## Scope: browser behaviour only
 *
 * Every POST is intercepted with `page.route()`: this spec proves what the
 * browser SENDS and what the page does with each answer — never that a lead was
 * written, never that a program interest was stored, never that any e-mail was
 * sent. A spec that reached the database would file synthetic leads into
 * whatever environment CI points at. Those proofs live elsewhere, on purpose:
 *  - persistence of the contact row through the real route and database:
 *    `tests/e2e/pasantias-flow.spec.ts` (no interception there);
 *  - per-program interests, grants and RLS: pgTAP 112 and the PostgREST checks
 *    (PASANT-B002); real-database/admin per-program proof is routed to later
 *    units (B004/B006), not claimed here;
 *  - actual mail delivery: Brent-owned release evidence (R-17; A2-11/A2-12
 *    remain FAIL, A2-13 BLOCKED).
 * A green run of this file is therefore evidence about the form, not about a lead.
 *
 * The interception is also the assertion in the validation tests: a client-side
 * validation failure must produce zero requests, which can only be observed by
 * counting them.
 *
 * ## What PASANT-B003 changed here
 *
 * October posted a program-less form against `COHORT_ID` read from the module.
 * January requires exactly one program per submission (C007), so every valid
 * fixture now chooses one, the empty-submit focus lands on the program choice
 * (first in the form), and the keyboard path enters the radio group before the
 * name. The cohort and both program IDs are typed here from the ratified
 * contract (`docs/plan/pasantias-january-contract.md` §2, `ids`), never imported:
 * an expectation read from the module the form posts would agree with it however
 * wrong it became. Every October behaviour assertion — consent separation, the
 * optional box, retention on failure, keyboard-only completion, UTM attribution
 * and the over-limit UTM — is kept and extended, not replaced.
 *
 * Validation sentences and caps are still imported from `lib/pasantias/leads.ts`:
 * they are the form's own copy, shared with the route on purpose, not cohort facts.
 */

const ENDPOINT = '**/api/pasantias/lead';

/** Contract §2 `ids.cohort`. */
const ACTIVE_COHORT = 'enero-2027';

/** Contract §2 `ids.programs` and each program's `name` (page 3). */
const INSPIRA = { id: 'inspira', name: 'Pasantía INSPIRA' } as const;
const MIRADA = { id: 'mirada-profunda', name: 'INSPIRA Mirada Profunda' } as const;

/** The two shared documents (C006), one of each for both programs. */
const FICHA_HREF = '/api/pasantias/ficha';
const BROCHURE_HREF = '/api/pasantias/brochure';

/**
 * Contract §6 / DEC-07: nothing may say an e-mail was or will be sent until
 * delivery evidence exists. Checked on the success panel and the pre-submit copy
 * only — the retained A-14 consent sentence (F4, preserved verbatim) states a
 * processing purpose and is not under this rule.
 */
const MAIL_PROMISE =
  /te enviamos|te enviaremos|te hemos enviado|recibirás|revisa tu (?:correo|bandeja)|enviado a tu correo|llegará a tu correo/i;

type PostedBody = Record<string, unknown>;

interface LeadAnswer {
  status: number;
  body?: unknown;
}

/**
 * Intercept every lead POST, record its body, and answer with the next of
 * `answers` (the last one repeats). Defaults to a stored submission.
 */
async function interceptLead(page: Page, ...answers: LeadAnswer[]) {
  const sequence = answers.length > 0 ? answers : [{ status: 200 }];
  const posted: PostedBody[] = [];
  await page.route(ENDPOINT, async (route) => {
    const answer = sequence[Math.min(posted.length, sequence.length - 1)];
    posted.push(route.request().postDataJSON() as PostedBody);
    await route.fulfill({
      status: answer.status,
      contentType: 'application/json',
      body: JSON.stringify(answer.body ?? { success: true }),
    });
  });
  return posted;
}

function programRadio(page: Page, program: { id: string }) {
  return page.getByTestId(`pasantias-lead-program-${program.id}`);
}

async function fillRequired(page: Page) {
  await page.getByTestId('pasantias-lead-first-name').fill('Camila');
  await page.getByTestId('pasantias-lead-last-name').fill('Rojas');
  await page.getByTestId('pasantias-lead-email').fill('camila.rojas@example.cl');
  await page.getByTestId('pasantias-lead-institution').fill('Colegio de Prueba');
}

test.describe('pasantias lead form', () => {
  test('empty submit validates on the client, focuses the program choice and sends nothing', async ({
    page,
  }) => {
    const posted = await interceptLead(page);

    await page.goto('/pasantias');
    await page.getByTestId('pasantias-lead-submit').click();

    await expect(page.getByTestId('pasantias-lead-error-program')).toHaveText(
      LEAD_VALIDATION_MESSAGES.programRequired
    );
    await expect(page.getByTestId('pasantias-lead-error-firstName')).toHaveText(
      LEAD_VALIDATION_MESSAGES.firstNameRequired
    );
    await expect(page.getByTestId('pasantias-lead-error-email')).toHaveText(
      LEAD_VALIDATION_MESSAGES.emailRequired
    );
    await expect(page.getByTestId('pasantias-lead-error-consent')).toHaveText(
      LEAD_VALIDATION_MESSAGES.consentRequired
    );
    // The program choice is first in the form, so it takes focus: the first
    // radio, since nothing is chosen yet.
    await expect(programRadio(page, INSPIRA)).toBeFocused();

    expect(posted, 'a failed client validation must not reach the network').toEqual([]);
  });

  test('a missing program alone blocks the submit, and choosing one clears it', async ({
    page,
  }) => {
    const posted = await interceptLead(page);

    await page.goto('/pasantias');
    // The form itself never preselects a program.
    await expect(programRadio(page, INSPIRA)).not.toBeChecked();
    await expect(programRadio(page, MIRADA)).not.toBeChecked();

    await fillRequired(page);
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-lead-submit').click();

    const programError = page.getByTestId('pasantias-lead-error-program');
    await expect(programError).toHaveText(LEAD_VALIDATION_MESSAGES.programRequired);
    await expect(page.locator('[data-testid^="pasantias-lead-error-"]')).toHaveCount(1);
    await expect(programRadio(page, INSPIRA)).not.toHaveAttribute('aria-invalid');
    await expect(programRadio(page, MIRADA)).not.toHaveAttribute('aria-invalid');
    await expect(programRadio(page, INSPIRA)).toHaveAttribute('aria-describedby', 'program-error');
    await expect(programRadio(page, MIRADA)).toHaveAttribute('aria-describedby', 'program-error');
    await expect(programRadio(page, INSPIRA)).toBeFocused();
    expect(posted, 'a submission without a program must not reach the network').toEqual([]);

    await programRadio(page, MIRADA).check();
    await expect(programError).toHaveCount(0);
    await page.getByTestId('pasantias-lead-submit').click();

    await expect(page.getByTestId('pasantias-lead-success')).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0].program).toBe(MIRADA.id);
  });

  test('a submission without the marketing box succeeds, names the program and opts nobody in', async ({
    page,
  }) => {
    const posted = await interceptLead(page);

    await page.goto('/pasantias');
    await expect(page.getByTestId('pasantias-lead-intro')).not.toContainText(MAIL_PROMISE);
    await programRadio(page, INSPIRA).check();
    await fillRequired(page);
    await page.getByTestId('pasantias-consent').check();
    await expect(page.getByTestId('pasantias-marketing-optin')).not.toBeChecked();
    await page.getByTestId('pasantias-lead-submit').click();

    const panel = page.getByTestId('pasantias-lead-success');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'status');
    await expect(page.getByTestId('pasantias-lead-success-program')).toContainText(INSPIRA.name);
    await expect(page.getByTestId('pasantias-lead-success-program')).not.toContainText(
      'Mirada Profunda'
    );
    // Direct access to both shared documents, and no promise of an e-mail.
    await expect(page.getByTestId('pasantias-lead-ficha')).toHaveAttribute('href', FICHA_HREF);
    await expect(page.getByTestId('pasantias-lead-brochure')).toHaveAttribute(
      'href',
      BROCHURE_HREF
    );
    await expect(panel).not.toContainText(MAIL_PROMISE);
    await expect(page.getByTestId('pasantias-lead-other-program')).toContainText(MIRADA.name);

    expect(posted).toHaveLength(1);
    expect(posted[0].cohort).toBe(ACTIVE_COHORT);
    expect(posted[0].program).toBe(INSPIRA.id);
    expect(posted[0].consent).toBe(true);
    expect(posted[0].marketingOptIn).toBe(false);
    expect(String(posted[0].sourcePath)).toMatch(/^\/pasantias/);
  });

  test('the optional box, and only the optional box, sets marketingOptIn', async ({ page }) => {
    const posted = await interceptLead(page);

    await page.goto('/pasantias');
    await programRadio(page, MIRADA).check();
    await fillRequired(page);
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-marketing-optin').check();
    await page.getByTestId('pasantias-lead-submit').click();

    await expect(page.getByTestId('pasantias-lead-success')).toBeVisible();
    await expect(page.getByTestId('pasantias-lead-success-program')).toContainText(MIRADA.name);
    await expect(page.getByTestId('pasantias-lead-success')).not.toContainText(MAIL_PROMISE);
    expect(posted).toHaveLength(1);
    expect(posted[0].cohort).toBe(ACTIVE_COHORT);
    expect(posted[0].program).toBe(MIRADA.id);
    expect(posted[0].marketingOptIn).toBe(true);
    expect(posted[0].consent).toBe(true);
  });

  test('the choice can be switched before submitting, and only the last one is sent', async ({
    page,
  }) => {
    const posted = await interceptLead(page);

    await page.goto('/pasantias');
    await programRadio(page, INSPIRA).check();
    await expect(programRadio(page, INSPIRA)).toBeChecked();

    await programRadio(page, MIRADA).check();
    await expect(programRadio(page, MIRADA)).toBeChecked();
    await expect(programRadio(page, INSPIRA)).not.toBeChecked();

    await programRadio(page, INSPIRA).check();
    await expect(programRadio(page, MIRADA)).not.toBeChecked();

    await fillRequired(page);
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-lead-submit').click();

    await expect(page.getByTestId('pasantias-lead-success')).toBeVisible();
    expect(posted).toHaveLength(1);
    // Exactly one program, as a single ID — never both, never a list.
    expect(posted[0].program).toBe(INSPIRA.id);
  });

  test('each program CTA preselects its program, and the visitor can still change it', async ({
    page,
  }) => {
    const posted = await interceptLead(page);

    await page.goto('/pasantias');

    await page.getByTestId(`pasantias-cta-program-${INSPIRA.id}`).click();
    await expect(page).toHaveURL(/#programa$/);
    await expect(programRadio(page, INSPIRA)).toBeChecked();
    await expect(programRadio(page, MIRADA)).not.toBeChecked();

    await page.getByTestId(`pasantias-cta-program-${MIRADA.id}`).click();
    await expect(programRadio(page, MIRADA)).toBeChecked();
    await expect(programRadio(page, INSPIRA)).not.toBeChecked();

    // The CTA's choice is a default, not a lock.
    await programRadio(page, INSPIRA).check();
    await expect(programRadio(page, INSPIRA)).toBeChecked();

    await fillRequired(page);
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-lead-submit').click();

    await expect(page.getByTestId('pasantias-lead-success')).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0].program).toBe(INSPIRA.id);
  });

  test('a 500 shows one error, loses nothing the person typed, and a retry succeeds', async ({
    page,
  }) => {
    const posted = await interceptLead(
      page,
      { status: 500, body: { error: 'Error al guardar la solicitud' } },
      { status: 200 }
    );

    await page.goto('/pasantias');
    await programRadio(page, MIRADA).check();
    await fillRequired(page);
    await page.getByTestId('pasantias-lead-phone').fill('912345678');
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-marketing-optin').check();
    await page.getByTestId('pasantias-lead-submit').click();

    await expect(page.getByTestId('pasantias-lead-form-error')).toBeVisible();
    await expect(page.getByTestId('pasantias-lead-form-error')).toHaveAttribute('role', 'alert');
    await expect(page.locator('[data-testid^="pasantias-lead-error-"]')).toHaveCount(0);
    await expect(page.getByTestId('pasantias-lead-success')).toHaveCount(0);
    await expect(page.getByTestId('pasantias-lead-form')).toBeVisible();
    await expect(programRadio(page, MIRADA)).toBeChecked();
    await expect(page.getByTestId('pasantias-lead-first-name')).toHaveValue('Camila');
    await expect(page.getByTestId('pasantias-lead-last-name')).toHaveValue('Rojas');
    await expect(page.getByTestId('pasantias-lead-email')).toHaveValue('camila.rojas@example.cl');
    await expect(page.getByTestId('pasantias-lead-institution')).toHaveValue('Colegio de Prueba');
    await expect(page.getByTestId('pasantias-lead-phone')).toHaveValue('912345678');
    await expect(page.getByTestId('pasantias-consent')).toBeChecked();
    await expect(page.getByTestId('pasantias-marketing-optin')).toBeChecked();

    // Retry with nothing re-entered.
    await page.getByTestId('pasantias-lead-submit').click();
    await expect(page.getByTestId('pasantias-lead-success')).toBeVisible();
    await expect(page.getByTestId('pasantias-lead-success-program')).toContainText(MIRADA.name);

    expect(posted).toHaveLength(2);
    for (const body of posted) {
      expect(body.program).toBe(MIRADA.id);
      expect(body.email).toBe('camila.rojas@example.cl');
      expect(body.consent).toBe(true);
      expect(body.marketingOptIn).toBe(true);
    }
  });

  test('a 2xx that does not say the submission was stored is not a success', async ({ page }) => {
    const posted = await interceptLead(page, { status: 200, body: {} });

    await page.goto('/pasantias');
    await programRadio(page, INSPIRA).check();
    await fillRequired(page);
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-lead-submit').click();

    await expect(page.getByTestId('pasantias-lead-form-error')).toBeVisible();
    await expect(page.getByTestId('pasantias-lead-success')).toHaveCount(0);
    await expect(programRadio(page, INSPIRA)).toBeChecked();
    await expect(page.getByTestId('pasantias-lead-email')).toHaveValue('camila.rojas@example.cl');
    expect(posted).toHaveLength(1);
  });

  test('a stale form gets a visible error: a refused program on the choice, a refused cohort on the form', async ({
    page,
  }) => {
    const posted = await interceptLead(
      page,
      {
        status: 400,
        body: { fields: { program: LEAD_VALIDATION_MESSAGES.programInvalid } },
      },
      {
        status: 400,
        body: { fields: { cohort: LEAD_VALIDATION_MESSAGES.cohortInvalid } },
      }
    );

    await page.goto('/pasantias');
    await programRadio(page, MIRADA).check();
    await fillRequired(page);
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-lead-submit').click();

    // The route refused the program: its sentence under the choice, focus on
    // the chosen radio, and everything kept.
    await expect(page.getByTestId('pasantias-lead-error-program')).toHaveText(
      LEAD_VALIDATION_MESSAGES.programInvalid
    );
    await expect(programRadio(page, MIRADA)).toBeFocused();
    await expect(programRadio(page, MIRADA)).toBeChecked();
    await expect(page.getByTestId('pasantias-lead-success')).toHaveCount(0);

    // The route refused the cohort (a page cached from a retired cohort): no
    // control to attach it to, so the form-level message says so.
    await page.getByTestId('pasantias-lead-submit').click();
    await expect(page.getByTestId('pasantias-lead-form-error')).toBeVisible();
    await expect(page.getByTestId('pasantias-lead-success')).toHaveCount(0);
    await expect(page.getByTestId('pasantias-lead-email')).toHaveValue('camila.rojas@example.cl');

    expect(posted).toHaveLength(2);
  });

  test('after a success, the other program is one more submission with fresh consent', async ({
    page,
  }) => {
    const posted = await interceptLead(page);

    await page.goto('/pasantias');
    await programRadio(page, INSPIRA).check();
    await fillRequired(page);
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-marketing-optin').check();
    await page.getByTestId('pasantias-lead-submit').click();
    await expect(page.getByTestId('pasantias-lead-success-program')).toContainText(INSPIRA.name);

    await page.getByTestId('pasantias-lead-other-program').click();

    // Back on the form, about the other program, with what was typed kept and
    // both consents cleared: each submission is its own consent evidence (D-12).
    await expect(programRadio(page, MIRADA)).toBeChecked();
    await expect(page.getByTestId('pasantias-lead-email')).toHaveValue('camila.rojas@example.cl');
    await expect(page.getByTestId('pasantias-consent')).not.toBeChecked();
    await expect(page.getByTestId('pasantias-marketing-optin')).not.toBeChecked();

    await page.getByTestId('pasantias-lead-submit').click();
    await expect(page.getByTestId('pasantias-lead-error-consent')).toHaveText(
      LEAD_VALIDATION_MESSAGES.consentRequired
    );
    expect(posted, 'the second submission must not reuse the first consent').toHaveLength(1);

    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-lead-submit').click();
    await expect(page.getByTestId('pasantias-lead-success-program')).toContainText(MIRADA.name);

    expect(posted).toHaveLength(2);
    expect(posted[0].program).toBe(INSPIRA.id);
    expect(posted[1].program).toBe(MIRADA.id);
    expect(posted[1].cohort).toBe(ACTIVE_COHORT);
    expect(posted[1].email).toBe(posted[0].email);
    expect(posted[1].consent).toBe(true);
    expect(posted[1].marketingOptIn).toBe(false);
  });

  test('the whole form is completable with the keyboard alone', async ({ page }) => {
    const posted = await interceptLead(page);

    await page.goto('/pasantias');

    // Start from the last focusable element BEFORE the form — the ficha CTA in
    // the left column — so every control below is reached by Tab and the tab
    // order inside the form is what is under test, not the page's whole chrome.
    await page.getByTestId('pasantias-cta-ficha-programa').focus();

    // The program choice comes first: one Tab stop for the group, Space to
    // choose, arrow keys to change the choice.
    await page.keyboard.press('Tab');
    await expect(programRadio(page, INSPIRA)).toBeFocused();
    await expect(programRadio(page, INSPIRA)).not.toBeChecked();
    await page.keyboard.press('Space');
    await expect(programRadio(page, INSPIRA)).toBeChecked();
    await page.keyboard.press('ArrowRight');
    await expect(programRadio(page, MIRADA)).toBeFocused();
    await expect(programRadio(page, MIRADA)).toBeChecked();
    await expect(programRadio(page, INSPIRA)).not.toBeChecked();

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('pasantias-lead-first-name')).toBeFocused();
    await page.keyboard.type('Camila');

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('pasantias-lead-last-name')).toBeFocused();
    await page.keyboard.type('Rojas');

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('pasantias-lead-email')).toBeFocused();
    await page.keyboard.type('camila.rojas@example.cl');

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('pasantias-lead-institution')).toBeFocused();
    await page.keyboard.type('Colegio de Prueba');

    // The optional fields, in the order they are read.
    for (const testId of [
      'pasantias-lead-role-title',
      'pasantias-lead-phone',
      'pasantias-lead-num-people',
      'pasantias-lead-message',
    ]) {
      await page.keyboard.press('Tab');
      await expect(page.getByTestId(testId)).toBeFocused();
    }

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('pasantias-consent')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('pasantias-consent')).toBeChecked();

    // The privacy link lives inside the consent sentence, then the optional box.
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('pasantias-consent-privacy-link')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('pasantias-marketing-optin')).toBeFocused();
    await expect(page.getByTestId('pasantias-marketing-optin')).not.toBeChecked();

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('pasantias-lead-submit')).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('pasantias-lead-success')).toBeVisible();
    // Focus moves to the confirmation that replaced the form.
    await expect(page.getByTestId('pasantias-lead-success')).toBeFocused();
    expect(posted).toHaveLength(1);
    expect(posted[0].program).toBe(MIRADA.id);
    expect(posted[0].consent).toBe(true);
    expect(posted[0].marketingOptIn).toBe(false);
  });

  test('utm parameters on the landing URL reach the posted body', async ({ page }) => {
    const posted = await interceptLead(page);

    await page.goto('/pasantias?utm_source=newsletter&utm_medium=email&utm_campaign=inspira');
    await programRadio(page, INSPIRA).check();
    await fillRequired(page);
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-lead-submit').click();

    await expect(page.getByTestId('pasantias-lead-success')).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0].utmSource).toBe('newsletter');
    expect(posted[0].utmMedium).toBe('email');
    expect(posted[0].utmCampaign).toBe('inspira');
    expect(String(posted[0].sourcePath)).toBe(
      '/pasantias?utm_source=newsletter&utm_medium=email&utm_campaign=inspira'
    );
    expect(posted[0].program).toBe(INSPIRA.id);
  });

  test('an over-limit utm_source costs the attribution, never the lead', async ({ page }) => {
    const posted = await interceptLead(page);

    // Sol's r1 reproduction, pinned: 141 characters against a cap of 140 used to
    // produce an error with no control to render it, so the submit did nothing —
    // no request, no message, no focus change.
    const overCap = 'a'.repeat(LEAD_FIELD_LIMITS.utm + 1);
    await page.goto(`/pasantias?utm_source=${overCap}&utm_medium=email`);
    await programRadio(page, MIRADA).check();
    await fillRequired(page);
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-lead-submit').click();

    await expect(page.getByTestId('pasantias-lead-success')).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0].utmSource === undefined || posted[0].utmSource === '').toBe(true);
    expect(posted[0].utmMedium).toBe('email');
    expect(posted[0].program).toBe(MIRADA.id);
  });
});
