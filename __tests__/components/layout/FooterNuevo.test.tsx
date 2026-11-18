// @vitest-environment jsdom
/**
 * Redesign 6B, the frame's one fix: the new look's footer keeps its items clear of the round feedback
 * button (fixed at the bottom right) at every width. The button is measured from its own classes; the
 * footer's right padding must be at least as wide as the button plus its margin, under the pointer too.
 * (The browser test `tests/e2e/look-panel.spec.ts` measures the boxes at 1,024 px and 390 px.)
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/components/PrivacyPolicyModal', () => ({ default: () => null }));
vi.mock('@/components/TermsOfUseModal', () => ({ default: () => null }));

import FooterNuevo, { FOOTER_SIDES } from '@/components/layout/FooterNuevo';

const REM = 16;
/** Tailwind's spacing scale: `6` is 1.5rem, `24` is 6rem. */
const space = (step: string) => Number(step) * 0.25 * REM;

describe("the new footer and the feedback button (6B)", () => {
  it('the footer carries the sides that keep it clear, and no side padding that would undo them', () => {
    render(<FooterNuevo />);
    const classes = screen.getByTestId('footer-nuevo').className.split(/\s+/);
    for (const name of FOOTER_SIDES.split(' ')) expect(classes).toContain(name);
    expect(classes.filter((name) => /^(?:\w+:)?(px|pr)-/.test(name))).toEqual(['pr-24']);
  });

  it('the right padding is wider than the button plus its margin, at its size under the pointer', () => {
    const source = readFileSync(join(__dirname, '..', '..', '..', 'components', 'feedback', 'FeedbackButtonWithPermissions.tsx'), 'utf8');
    const button = source.slice(source.indexOf('{/* Floating button */}'), source.indexOf('</button>'));
    const right = space(/\bright-(\d+)\b/.exec(button)![1]);
    const padding = space(/\bp-(\d+)\b/.exec(button)![1]);
    const icon = space(/\bw-(\d+)\b/.exec(button)![1]);
    const hoverScale = Number(/hover:scale-(\d+)/.exec(button)?.[1] ?? 100) / 100;
    const width = padding * 2 + icon;
    const reach = right + width + (width * (hoverScale - 1)) / 2;
    const footerRight = space(/\bpr-(\d+)\b/.exec(FOOTER_SIDES)![1]);
    expect(reach).toBeCloseTo(82.8, 1);
    expect(footerRight).toBeGreaterThanOrEqual(reach);
  });
});
