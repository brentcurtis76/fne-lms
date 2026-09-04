// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SimulationEnvironmentBanner from '../../components/SimulationEnvironmentBanner';
import { QA_SIMULATION_LABEL } from '../../lib/simulation/constants';

describe('SimulationEnvironmentBanner', () => {
  it('renders the exact governed label for QA routes', () => {
    render(<SimulationEnvironmentBanner visible />);
    expect(screen.getByTestId('qa-simulation-banner')).toHaveTextContent(QA_SIMULATION_LABEL);
  });

  it('renders nothing for real-client routes', () => {
    const { container } = render(<SimulationEnvironmentBanner visible={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
