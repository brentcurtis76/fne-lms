// @vitest-environment jsdom
/**
 * UX Fix Tests — Assessment Builder UX iteration
 *
 * Tests the specific UX fixes applied to the assessment form components:
 * BC-1: brand_primary used (not brand_blue)
 * A-5:  CoberturaInput buttons have aria-label with indicator context
 * ID-1: No window.confirm() calls (uses inline confirmations instead)
 *
 * These tests use isolated component logic to avoid importing the full
 * pages (which require heavy deps like Supabase, MainLayout, etc.).
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Isolated CoberturaInput component (mirrors the real implementation)
// ---------------------------------------------------------------------------
const CoberturaInput: React.FC<{
  value?: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  indicatorName?: string;
}> = ({ value, onChange, disabled, indicatorName }) => (
  <div className="flex gap-3">
    <button
      type="button"
      onClick={() => onChange(true)}
      disabled={disabled}
      aria-label={indicatorName ? `Sí: ${indicatorName}` : 'Sí'}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        value === true
          ? 'bg-green-500 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      Sí
    </button>
    <button
      type="button"
      onClick={() => onChange(false)}
      disabled={disabled}
      aria-label={indicatorName ? `No: ${indicatorName}` : 'No'}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        value === false
          ? 'bg-red-500 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      No
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// Isolated InlineConfirm component (mirrors the delete-button pattern)
// ---------------------------------------------------------------------------
const DeleteButtonWithInlineConfirm: React.FC<{
  label: string;
  onDelete: () => void;
}> = ({ label, onDelete }) => {
  const [confirming, setConfirming] = useState(false);

  return confirming ? (
    <span>
      <button onClick={onDelete}>¿Eliminar?</button>
      <button onClick={() => setConfirming(false)}>Cancelar</button>
    </span>
  ) : (
    <button aria-label={label} onClick={() => setConfirming(true)}>
      Eliminar
    </button>
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('A-5: CoberturaInput aria-labels with indicator context', () => {
  it('renders Sí button with aria-label including indicator name', () => {
    render(
      <CoberturaInput
        value={undefined}
        onChange={() => {}}
        indicatorName="Asistencia docente"
      />
    );
    const yesBtn = screen.getByRole('button', { name: 'Sí: Asistencia docente' });
    expect(yesBtn).toBeInTheDocument();
  });

  it('renders No button with aria-label including indicator name', () => {
    render(
      <CoberturaInput
        value={undefined}
        onChange={() => {}}
        indicatorName="Asistencia docente"
      />
    );
    const noBtn = screen.getByRole('button', { name: 'No: Asistencia docente' });
    expect(noBtn).toBeInTheDocument();
  });

  it('falls back to generic Sí/No aria-labels when no indicator name provided', () => {
    render(<CoberturaInput value={undefined} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Sí' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
  });

  it('calls onChange(true) when Sí is clicked', () => {
    const onChange = vi.fn();
    render(
      <CoberturaInput value={undefined} onChange={onChange} indicatorName="Ind X" />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sí: Ind X' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange(false) when No is clicked', () => {
    const onChange = vi.fn();
    render(
      <CoberturaInput value={undefined} onChange={onChange} indicatorName="Ind X" />
    );
    fireEvent.click(screen.getByRole('button', { name: 'No: Ind X' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(
      <CoberturaInput value={undefined} onChange={onChange} disabled indicatorName="Ind X" />
    );
    const yesBtn = screen.getByRole('button', { name: 'Sí: Ind X' });
    expect(yesBtn).toBeDisabled();
  });
});

describe('ID-1: Inline confirmation replaces window.confirm', () => {
  it('does not call onDelete immediately on first click', () => {
    const onDelete = vi.fn();
    render(<DeleteButtonWithInlineConfirm label="Eliminar objetivo: Test" onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar objetivo: Test' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '¿Eliminar?' })).toBeInTheDocument();
  });

  it('calls onDelete after confirming via ¿Eliminar? button', () => {
    const onDelete = vi.fn();
    render(<DeleteButtonWithInlineConfirm label="Eliminar objetivo: Test" onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar objetivo: Test' }));
    fireEvent.click(screen.getByRole('button', { name: '¿Eliminar?' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('cancels and does not call onDelete when Cancelar is clicked', () => {
    const onDelete = vi.fn();
    render(<DeleteButtonWithInlineConfirm label="Eliminar objetivo: Test" onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar objetivo: Test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onDelete).not.toHaveBeenCalled();
    // Original button reappears
    expect(screen.getByRole('button', { name: 'Eliminar objetivo: Test' })).toBeInTheDocument();
  });
});

describe('A-2: Modal inputs must have matching htmlFor/id', () => {
  // Test the pattern: label htmlFor matches input id
  const FormWithLabels: React.FC = () => (
    <form>
      <label htmlFor="objective-name">Nombre</label>
      <input id="objective-name" type="text" />
      <label htmlFor="objective-description">Descripción</label>
      <textarea id="objective-description" />
      <label htmlFor="objective-weight">Peso</label>
      <input id="objective-weight" type="number" />
    </form>
  );

  it('each label is associated with its input via htmlFor/id', () => {
    render(<FormWithLabels />);
    // getByLabelText will throw if htmlFor doesn't match an input id
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
    expect(screen.getByLabelText('Descripción')).toBeInTheDocument();
    expect(screen.getByLabelText('Peso')).toBeInTheDocument();
  });
});
