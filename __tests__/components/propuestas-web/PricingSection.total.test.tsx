// @vitest-environment jsdom
/**
 * LIC-E6: the public page's price section prints totalUf(pricing), the same
 * total as the PDF and the panel. Synthetic data only.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PricingSection from '@/components/propuestas-web/PricingSection';

// The component relies on the automatic JSX runtime of the Next build; the test
// transform is classic, so React is provided globally (as entry-points.test.tsx does).
(globalThis as any).React = React;

describe('PricingSection — the one price', () => {
  it('«Precio fijo» left blank prints 0.00, like the PDF (not rate × hours)', () => {
    render(<PricingSection pricing={{ mode: 'fixed', precioUf: 2, totalHours: 100, formaPago: '3 cuotas' }} />);
    expect(screen.getByText('0.00')).toBeInTheDocument();
    expect(screen.queryByText('200.00')).not.toBeInTheDocument();
  });

  it('fixed with a value prints that value; per hour prints rate × hours', () => {
    const { unmount } = render(<PricingSection pricing={{ mode: 'fixed', precioUf: 2, totalHours: 100, formaPago: 'x', fixedUf: 888 }} />);
    expect(screen.getByText('888.00')).toBeInTheDocument();
    unmount();
    render(<PricingSection pricing={{ mode: 'per_hour', precioUf: 2.5, totalHours: 100, formaPago: 'x' }} />);
    expect(screen.getByText('250.00')).toBeInTheDocument();
  });
});
