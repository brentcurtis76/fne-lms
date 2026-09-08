// @vitest-environment jsdom
/**
 * B-01: ModuleCard visibility must use the shared cobertura gate policy —
 * only applicable indicators render; a closed/unanswered gate hides
 * downstream indicators and (when closed) shows the "no implementada" note.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import ModuleCard from '@/components/assessment/ModuleCard';
import type { ModuleData, ResponseData } from '@/components/assessment/types';

afterEach(() => cleanup());

const MODULE: ModuleData = {
  id: 'mod-1',
  name: 'Módulo de prueba',
  displayOrder: 1,
  weight: 1,
  indicators: [
    { id: 'cob', name: 'Cobertura', category: 'cobertura', displayOrder: 1, weight: 1 },
    { id: 'frec', name: 'Frecuencia', category: 'frecuencia', displayOrder: 2, weight: 1 },
    { id: 'prof', name: 'Profundidad', category: 'profundidad', displayOrder: 3, weight: 1 },
  ],
};

function renderCard(responses: Record<string, ResponseData>) {
  return render(
    <ModuleCard
      module={MODULE}
      responses={responses}
      expanded={true}
      onToggle={() => {}}
      onResponseChange={() => {}}
      canEdit={true}
    />
  );
}

describe('ModuleCard — cobertura gate visibility (B-01)', () => {
  it('unanswered cobertura: only the cobertura indicator renders', () => {
    renderCard({});
    expect(screen.getAllByText('Cobertura').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Frecuencia').length).toBe(0);
    expect(screen.queryAllByText('Profundidad').length).toBe(0);
  });

  it('cobertura Sí: all indicators render', () => {
    renderCard({ cob: { coverageValue: true } });
    expect(screen.getAllByText('Cobertura').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Frecuencia').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Profundidad').length).toBeGreaterThan(0);
  });

  it('cobertura No: only cobertura renders, plus the not-implemented note', () => {
    renderCard({ cob: { coverageValue: false } });
    expect(screen.getAllByText('Cobertura').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Frecuencia').length).toBe(0);
    expect(screen.queryAllByText('Profundidad').length).toBe(0);
    expect(screen.getByText('Esta práctica no se implementa en este establecimiento')).toBeInTheDocument();
  });

  it('Sí → downstream answered → then No: stale downstream answers do not reappear', () => {
    renderCard({
      cob: { coverageValue: false },
      // Stale saved values from when the gate was open.
      frec: { frequencyValue: 4 },
      prof: { profundityLevel: 3 },
    });
    expect(screen.queryAllByText('Frecuencia').length).toBe(0);
    expect(screen.queryAllByText('Profundidad').length).toBe(0);
  });

  it('non-cobertura first indicator: no gate, all indicators render regardless of first response', () => {
    const nonGateModule: ModuleData = {
      ...MODULE,
      indicators: [
        { id: 'prof', name: 'Profundidad', category: 'profundidad', displayOrder: 1, weight: 1 },
        { id: 'frec', name: 'Frecuencia', category: 'frecuencia', displayOrder: 2, weight: 1 },
      ],
    };
    render(
      <ModuleCard
        module={nonGateModule}
        responses={{}}
        expanded={true}
        onToggle={() => {}}
        onResponseChange={() => {}}
        canEdit={true}
      />
    );
    expect(screen.getAllByText('Profundidad').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Frecuencia').length).toBeGreaterThan(0);
  });

  it('a year-inactive indicator is excluded before gate resolution', () => {
    const withInactive: ModuleData = {
      id: 'mod-2',
      name: 'Módulo',
      displayOrder: 1,
      weight: 1,
      indicators: [
        // Inactive nominal-first indicator must not become the gate.
        { id: 'inactive', name: 'Inactiva', category: 'profundidad', displayOrder: 0, weight: 1, isActiveThisYear: false },
        { id: 'cob', name: 'Cobertura', category: 'cobertura', displayOrder: 1, weight: 1 },
      ],
    };
    render(
      <ModuleCard
        module={withInactive}
        responses={{}}
        expanded={true}
        onToggle={() => {}}
        onResponseChange={() => {}}
        canEdit={true}
      />
    );
    expect(screen.queryAllByText('Inactiva').length).toBe(0);
    expect(screen.getAllByText('Cobertura').length).toBeGreaterThan(0);
  });
});
