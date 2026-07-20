// @vitest-environment jsdom
/**
 * pages/registro.tsx — generation selector visibility contract.
 *
 * Deterministic fixture-driven checks (no database): the "Generación" select
 * only appears for schools that have generation rows in the loaded list, is
 * optional (defaults to "Aún no lo sé"), and resets when the school changes.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../lib/api-auth', () => ({
  createServiceRoleClient: vi.fn(),
}));

import RegistroPage from '../../pages/registro';

const GEN_TRACTOR = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const GEN_INNOVA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const SCHOOLS = [
  { id: 1, name: 'Colegio Con Generaciones' },
  { id: 2, name: 'Colegio Sin Generaciones' },
];

const GENERATIONS = [
  { id: GEN_TRACTOR, name: 'Tractor', school_id: 1 },
  { id: GEN_INNOVA, name: 'Innova', school_id: 1 },
];

function renderPage(overrides: Partial<React.ComponentProps<typeof RegistroPage>> = {}) {
  return render(
    <RegistroPage
      schools={SCHOOLS}
      generations={GENERATIONS}
      schoolLoadError={false}
      {...overrides}
    />
  );
}

describe('RegistroPage — generation selector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is hidden until a school with generations is selected', () => {
    const view = renderPage();
    expect(view.queryByTestId('registro-generation')).not.toBeInTheDocument();

    fireEvent.change(view.getByTestId('registro-school'), { target: { value: '1' } });
    expect(view.getByTestId('registro-generation')).toBeInTheDocument();
  });

  it('stays hidden for a school without generations', () => {
    const view = renderPage();
    fireEvent.change(view.getByTestId('registro-school'), { target: { value: '2' } });
    expect(view.queryByTestId('registro-generation')).not.toBeInTheDocument();
  });

  it('is optional, defaulting to "Aún no lo sé", and lists the school generations', () => {
    const view = renderPage();
    fireEvent.change(view.getByTestId('registro-school'), { target: { value: '1' } });

    const select = view.getByTestId('registro-generation') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(select).not.toBeRequired();

    // Order follows the generations prop (GSSP already sorts alphabetically).
    const options = Array.from(select.options).map((option) => option.text);
    expect(options).toEqual(['Aún no lo sé', 'Tractor', 'Innova']);
  });

  it('resets the chosen generation when the school changes', () => {
    const view = renderPage();
    fireEvent.change(view.getByTestId('registro-school'), { target: { value: '1' } });
    fireEvent.change(view.getByTestId('registro-generation'), { target: { value: GEN_TRACTOR } });
    expect((view.getByTestId('registro-generation') as HTMLSelectElement).value).toBe(GEN_TRACTOR);

    fireEvent.change(view.getByTestId('registro-school'), { target: { value: '2' } });
    expect(view.queryByTestId('registro-generation')).not.toBeInTheDocument();

    // Coming back to the generation school starts clean again.
    fireEvent.change(view.getByTestId('registro-school'), { target: { value: '1' } });
    expect((view.getByTestId('registro-generation') as HTMLSelectElement).value).toBe('');
  });

  it('fail-soft metadata: with no generations loaded, no school shows the selector', () => {
    const view = renderPage({ generations: [] });
    fireEvent.change(view.getByTestId('registro-school'), { target: { value: '1' } });
    expect(view.queryByTestId('registro-generation')).not.toBeInTheDocument();
  });

  it('schools load error disables the form entirely', () => {
    const view = renderPage({ schools: [], schoolLoadError: true });
    expect(view.getByTestId('registro-submit')).toBeDisabled();
    expect(view.getByText(/No se pudo cargar la lista de colegios/)).toBeInTheDocument();
  });
});
