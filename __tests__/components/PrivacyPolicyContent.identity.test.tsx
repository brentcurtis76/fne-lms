// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import PrivacyPolicyContent from '../../components/PrivacyPolicyContent';
import { LEGAL_IDENTITY } from '../../lib/legal/privacy-notice';

/**
 * The public notice must name the real data controller, not the nombre de
 * fantasía (Appendix A-10). These assertions guard the rendered page, not the
 * constants: the constants can be correct while the prose still shows the brand
 * alone and a generic address — which is exactly what round 2 shipped.
 */

/** JSX collapses newlines+indentation into single spaces; compare on one line. */
const normalize = (value: string | null) => (value ?? '').replace(/\s+/g, ' ').trim();

const countOccurrences = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

const renderNotice = () => {
  const { container } = render(<PrivacyPolicyContent />);
  return {
    page: normalize(container.textContent),
    identity: normalize(screen.getByTestId('privacy-controller-identity').textContent),
    contact: normalize(screen.getByTestId('privacy-contact-block').textContent),
  };
};

describe('PrivacyPolicyContent — data-controller identity', () => {
  it('renders the legal name, RUT and street address of the controller', () => {
    const { page } = renderNotice();

    expect(page).toContain(LEGAL_IDENTITY.legalName);
    expect(page).toContain(LEGAL_IDENTITY.taxId);
    expect(page).toContain(LEGAL_IDENTITY.streetAddress);
    expect(page).toContain(LEGAL_IDENTITY.city);
    expect(page).toContain(LEGAL_IDENTITY.country);
  });

  it('identifies the responsable with brand, razón social, RUT and full address', () => {
    const { identity } = renderNotice();

    expect(identity).toContain('responsable del tratamiento');
    expect(identity).toContain(LEGAL_IDENTITY.brandName);
    expect(identity).toContain(LEGAL_IDENTITY.legalName);
    expect(identity).toContain(LEGAL_IDENTITY.taxId);
    expect(identity).toContain(
      `${LEGAL_IDENTITY.streetAddress}, ${LEGAL_IDENTITY.city}, ${LEGAL_IDENTITY.country}`,
    );
  });

  it('repeats the full identity in the contact block, with the request mailbox', () => {
    const { contact } = renderNotice();

    expect(contact).toContain(LEGAL_IDENTITY.brandName);
    expect(contact).toContain(LEGAL_IDENTITY.legalName);
    expect(contact).toContain(LEGAL_IDENTITY.taxId);
    expect(contact).toContain(
      `${LEGAL_IDENTITY.streetAddress}, ${LEGAL_IDENTITY.city}, ${LEGAL_IDENTITY.country}`,
    );

    const mailbox = screen.getByRole('link', { name: LEGAL_IDENTITY.contactEmail });
    expect(mailbox).toHaveAttribute('href', `mailto:${LEGAL_IDENTITY.contactEmail}`);
  });

  it('never shows the brand name as the controller without the legal entity', () => {
    const { page, identity, contact } = renderNotice();

    // Every mention of the nombre de fantasía lives inside one of the two
    // identity blocks — nowhere else may speak as the controller.
    const inBlocks =
      countOccurrences(identity, LEGAL_IDENTITY.brandName) +
      countOccurrences(contact, LEGAL_IDENTITY.brandName);
    expect(inBlocks).toBeGreaterThan(0);
    expect(countOccurrences(page, LEGAL_IDENTITY.brandName)).toBe(inBlocks);

    // …and both of those blocks name the legal entity alongside it.
    for (const block of [identity, contact]) {
      expect(block).toContain(LEGAL_IDENTITY.legalName);
      expect(block).toContain(LEGAL_IDENTITY.taxId);
    }
  });

  it('leaves no generic or placeholder address anywhere in the notice', () => {
    const { page } = renderNotice();

    expect(page).not.toContain('Dirección: Santiago, Chile');
    expect(page).not.toMatch(/PENDIENTE|TODO/i);

    // Every mention of the controller's comuna/city carries the street address.
    const streetMentions = countOccurrences(page, LEGAL_IDENTITY.streetAddress);
    expect(streetMentions).toBeGreaterThan(0);
    expect(countOccurrences(page, LEGAL_IDENTITY.city)).toBe(streetMentions);
  });
});
