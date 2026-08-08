import { test, expect } from '@playwright/test';

import { COHORT_ID } from '../../lib/pasantias/cohort-public';
import { LEAD_FIELD_LIMITS, LEAD_VALIDATION_MESSAGES } from '../../lib/pasantias/leads';

/**
 * A6b — the `/pasantias` lead form, on the real page.
 *
 * Every POST is intercepted: this spec proves what the browser SENDS and what
 * the page does with each answer, never that a lead was written. The route's own
 * behaviour is covered by its API tests, and a spec that reached the database
 * would file synthetic leads into whatever environment CI points at.
 *
 * The interception is also the assertion in the first test: a client-side
 * validation failure must produce zero requests, which can only be observed by
 * counting them.
 */

const ENDPOINT = '**/api/pasantias/lead';

type PostedBody = Record<string, unknown>;

/** Intercept every lead POST, record its body, and answer with `status`. */
async function interceptLead(
  page: import('@playwright/test').Page,
  status: number,
  body: unknown = { success: true }
) {
  const posted: PostedBody[] = [];
  await page.route(ENDPOINT, async (route) => {
    posted.push(route.request().postDataJSON() as PostedBody);
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return posted;
}

async function fillRequired(page: import('@playwright/test').Page) {
  await page.getByTestId('pasantias-lead-first-name').fill('Camila');
  await page.getByTestId('pasantias-lead-last-name').fill('Rojas');
  await page.getByTestId('pasantias-lead-email').fill('camila.rojas@example.cl');
  await page.getByTestId('pasantias-lead-institution').fill('Colegio de Prueba');
}

test.describe('pasantias lead form', () => {
  test('empty submit validates on the client and sends nothing', async ({ page }) => {
    const posted = await interceptLead(page, 200);

    await page.goto('/pasantias');
    await page.getByTestId('pasantias-lead-submit').click();

    await expect(page.getByTestId('pasantias-lead-error-firstName')).toHaveText(
      LEAD_VALIDATION_MESSAGES.firstNameRequired
    );
    await expect(page.getByTestId('pasantias-lead-error-email')).toHaveText(
      LEAD_VALIDATION_MESSAGES.emailRequired
    );
    await expect(page.getByTestId('pasantias-lead-error-consent')).toHaveText(
      LEAD_VALIDATION_MESSAGES.consentRequired
    );
    await expect(page.getByTestId('pasantias-lead-first-name')).toBeFocused();

    expect(posted, 'a failed client validation must not reach the network').toEqual([]);
  });

  test('a submission without the marketing box succeeds and opts nobody in', async ({ page }) => {
    const posted = await interceptLead(page, 200);

    await page.goto('/pasantias');
    await fillRequired(page);
    await page.getByTestId('pasantias-consent').check();
    await expect(page.getByTestId('pasantias-marketing-optin')).not.toBeChecked();
    await page.getByTestId('pasantias-lead-submit').click();

    const panel = page.getByTestId('pasantias-lead-success');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'status');
    await expect(page.getByTestId('pasantias-lead-brochure')).toHaveAttribute(
      'href',
      '/api/pasantias/brochure'
    );

    expect(posted).toHaveLength(1);
    expect(posted[0].cohort).toBe(COHORT_ID);
    expect(posted[0].consent).toBe(true);
    expect(posted[0].marketingOptIn).toBeFalsy();
    expect(String(posted[0].sourcePath)).toMatch(/^\/pasantias/);
  });

  test('the optional box, and only the optional box, sets marketingOptIn', async ({ page }) => {
    const posted = await interceptLead(page, 200);

    await page.goto('/pasantias');
    await fillRequired(page);
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-marketing-optin').check();
    await page.getByTestId('pasantias-lead-submit').click();

    await expect(page.getByTestId('pasantias-lead-success')).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0].marketingOptIn).toBe(true);
    expect(posted[0].consent).toBe(true);
  });

  test('a 500 shows one error and loses nothing the person typed', async ({ page }) => {
    await interceptLead(page, 500, { error: 'Error al guardar la solicitud' });

    await page.goto('/pasantias');
    await fillRequired(page);
    await page.getByTestId('pasantias-lead-phone').fill('912345678');
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-lead-submit').click();

    await expect(page.getByTestId('pasantias-lead-form-error')).toBeVisible();
    await expect(page.getByTestId('pasantias-lead-form')).toBeVisible();
    await expect(page.getByTestId('pasantias-lead-first-name')).toHaveValue('Camila');
    await expect(page.getByTestId('pasantias-lead-last-name')).toHaveValue('Rojas');
    await expect(page.getByTestId('pasantias-lead-email')).toHaveValue('camila.rojas@example.cl');
    await expect(page.getByTestId('pasantias-lead-institution')).toHaveValue('Colegio de Prueba');
    await expect(page.getByTestId('pasantias-lead-phone')).toHaveValue('912345678');
    await expect(page.getByTestId('pasantias-consent')).toBeChecked();
  });

  test('the whole form is completable with the keyboard alone', async ({ page }) => {
    const posted = await interceptLead(page, 200);

    await page.goto('/pasantias');

    // Start from the last focusable element BEFORE the form — the ficha CTA in
    // the left column — so every control below is reached by Tab and the tab
    // order inside the form is what is under test, not the page's whole chrome.
    await page.getByTestId('pasantias-cta-ficha-programa').focus();

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
    expect(posted).toHaveLength(1);
    expect(posted[0].consent).toBe(true);
    expect(posted[0].marketingOptIn).toBeFalsy();
  });

  test('utm parameters on the landing URL reach the posted body', async ({ page }) => {
    const posted = await interceptLead(page, 200);

    await page.goto('/pasantias?utm_source=newsletter&utm_medium=email&utm_campaign=inspira');
    await fillRequired(page);
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-lead-submit').click();

    await expect(page.getByTestId('pasantias-lead-success')).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0].utmSource).toBe('newsletter');
    expect(posted[0].utmMedium).toBe('email');
    expect(posted[0].utmCampaign).toBe('inspira');
  });

  test('an over-limit utm_source costs the attribution, never the lead', async ({ page }) => {
    const posted = await interceptLead(page, 200);

    // Sol's r1 reproduction, pinned: 141 characters against a cap of 140 used to
    // produce an error with no control to render it, so the submit did nothing —
    // no request, no message, no focus change.
    const overCap = 'a'.repeat(LEAD_FIELD_LIMITS.utm + 1);
    await page.goto(`/pasantias?utm_source=${overCap}&utm_medium=email`);
    await fillRequired(page);
    await page.getByTestId('pasantias-consent').check();
    await page.getByTestId('pasantias-lead-submit').click();

    await expect(page.getByTestId('pasantias-lead-success')).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0].utmSource === undefined || posted[0].utmSource === '').toBe(true);
    expect(posted[0].utmMedium).toBe('email');
  });
});
