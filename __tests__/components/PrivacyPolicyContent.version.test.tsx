// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';

import PrivacyPolicyContent from '../../components/PrivacyPolicyContent';
import {
  PRIVACY_NOTICE_UPDATED_LABEL,
  PRIVACY_NOTICE_VERSION,
} from '../../lib/legal/privacy-notice';

describe('PrivacyPolicyContent — notice version line', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the fixed update date and version from constants', () => {
    render(<PrivacyPolicyContent />);

    const line = screen.getByTestId('privacy-notice-version');
    expect(line).toHaveTextContent(`Última actualización: ${PRIVACY_NOTICE_UPDATED_LABEL}`);
    expect(line).toHaveTextContent(`Versión ${PRIVACY_NOTICE_VERSION}`);
  });

  it('does not derive the line from the current date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-03-05T12:00:00Z'));

    render(<PrivacyPolicyContent />);

    const line = screen.getByTestId('privacy-notice-version');
    expect(line.textContent).toContain(PRIVACY_NOTICE_UPDATED_LABEL);
    expect(line.textContent).not.toContain('2030');
  });
});
