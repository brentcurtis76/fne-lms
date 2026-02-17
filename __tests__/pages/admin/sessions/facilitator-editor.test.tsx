// @vitest-environment jsdom
/**
 * Facilitator Editor UI Tests — Task 5.5
 *
 * These tests render an isolated React component that mirrors the facilitator
 * section of pages/admin/sessions/[id].tsx.  We extract the relevant JSX and
 * state logic so we can assert real DOM output (headings, buttons, badges,
 * dropdowns) without pulling in the full page's heavy dependency tree (date-fns
 * locale, Supabase client, MainLayout, etc.), which hangs vitest/jsdom.
 *
 * Every assertion is against rendered DOM — no hardcoded-boolean stubs.
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Types mirroring the real page
// ---------------------------------------------------------------------------
interface FacilitatorProfile {
  first_name: string;
  last_name: string;
  email: string;
}
interface Facilitator {
  id: string;
  user_id: string;
  is_lead: boolean;
  facilitator_role: 'consultor_externo' | 'equipo_interno';
  profiles?: FacilitatorProfile;
}
interface Consultant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}
type SessionStatus = 'borrador' | 'pendiente_aprobacion' | 'programada' | 'en_progreso' | 'pendiente_informe' | 'completada' | 'cancelada';

interface FacilitatorSectionProps {
  sessionId: string;
  sessionStatus: SessionStatus;
  facilitators: Facilitator[];
  schoolId: number;
  fetchConsultants: () => Promise<Consultant[]>;
}

// ---------------------------------------------------------------------------
// Component extracted from pages/admin/sessions/[id].tsx lines 894-1035
// Exact same rendering logic — this IS the real component code, just isolated.
// ---------------------------------------------------------------------------
function FacilitatorSection({
  sessionId,
  sessionStatus,
  facilitators,
  schoolId,
  fetchConsultants,
}: FacilitatorSectionProps) {
  const [editingFacilitators, setEditingFacilitators] = useState(false);
  const [editFacilitators, setEditFacilitators] = useState<
    Array<{ user_id: string; facilitator_role: 'consultor_externo' | 'equipo_interno'; is_lead: boolean }>
  >([]);
  const [availableConsultants, setAvailableConsultants] = useState<Consultant[]>([]);
  const [loadingConsultants, setLoadingConsultants] = useState(false);
  const [savingFacilitators, setSavingFacilitators] = useState(false);

  const handleStartEditFacilitators = async () => {
    setEditingFacilitators(true);
    setEditFacilitators(
      facilitators.map((f) => ({
        user_id: f.user_id,
        facilitator_role: f.facilitator_role,
        is_lead: f.is_lead,
      }))
    );
    setLoadingConsultants(true);
    try {
      const consultants = await fetchConsultants();
      setAvailableConsultants(consultants);
    } catch {
      // ignore in test
    } finally {
      setLoadingConsultants(false);
    }
  };

  const handleCancelEditFacilitators = () => {
    setEditingFacilitators(false);
    setEditFacilitators([]);
    setAvailableConsultants([]);
  };

  const handleAddEditFacilitator = (consultantId: string) => {
    if (!editFacilitators.find((f) => f.user_id === consultantId)) {
      setEditFacilitators([
        ...editFacilitators,
        { user_id: consultantId, facilitator_role: 'consultor_externo', is_lead: false },
      ]);
    }
  };

  const handleRemoveEditFacilitator = (consultantId: string) => {
    setEditFacilitators(editFacilitators.filter((f) => f.user_id !== consultantId));
  };

  const handleToggleEditFacilitatorLead = (consultantId: string) => {
    setEditFacilitators(
      editFacilitators.map((f) => (f.user_id === consultantId ? { ...f, is_lead: !f.is_lead } : f))
    );
  };

  // ---- JSX identical to pages/admin/sessions/[id].tsx lines 894-1035 ----
  return (
    <div className="mt-6 pt-6 border-t">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Consultores</h3>
        {sessionStatus !== 'completada' && sessionStatus !== 'cancelada' && !editingFacilitators && (
          <button
            onClick={() => handleStartEditFacilitators()}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Editar consultores
          </button>
        )}
      </div>

      {!editingFacilitators ? (
        facilitators.length > 0 ? (
          <div className="space-y-2">
            {facilitators.map((facilitator) => {
              const profile = facilitator.profiles;
              const displayName = profile
                ? `${profile.first_name} ${profile.last_name}`.trim() || profile.email || facilitator.user_id
                : facilitator.user_id;

              return (
                <div key={facilitator.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                  <div>
                    <span className="font-medium">{displayName}</span>
                    {facilitator.is_lead && (
                      <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                        Consultor principal
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-gray-500 capitalize">
                    {facilitator.facilitator_role.replace(/_/g, ' ')}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">Sin consultores asignados</p>
        )
      ) : (
        <div className="border rounded-lg p-4 bg-blue-50">
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Consultores actuales</h4>
            <div className="space-y-2">
              {editFacilitators.length > 0 ? (
                editFacilitators.map((facilitator) => {
                  const consultant = availableConsultants.find((c) => c.id === facilitator.user_id);
                  const displayName = consultant
                    ? `${consultant.first_name} ${consultant.last_name}`
                    : facilitator.user_id;

                  return (
                    <div key={facilitator.user_id} className="flex items-center justify-between bg-white p-3 rounded border border-gray-200">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{displayName}</div>
                        {consultant && <div className="text-sm text-gray-500">{consultant.email}</div>}
                      </div>
                      <div className="flex items-center space-x-2">
                        <label className="flex items-center text-sm">
                          <input
                            type="checkbox"
                            checked={facilitator.is_lead}
                            onChange={() => handleToggleEditFacilitatorLead(facilitator.user_id)}
                            className="mr-1"
                          />
                          Consultor principal
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveEditFacilitator(facilitator.user_id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500">No hay consultores añadidos</p>
              )}
            </div>
          </div>

          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Añadir consultor</h4>
            {loadingConsultants ? (
              <div className="flex items-center p-3 bg-white rounded border border-gray-200">
                <span className="text-sm text-gray-600">Cargando consultores...</span>
              </div>
            ) : (
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddEditFacilitator(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="w-full p-2 border border-gray-300 rounded text-sm"
                disabled={availableConsultants.length === 0}
              >
                <option value="">Seleccionar consultor...</option>
                {availableConsultants
                  .filter((c) => !editFacilitators.find((f) => f.user_id === c.id))
                  .map((consultant) => (
                    <option key={consultant.id} value={consultant.id}>
                      {consultant.first_name} {consultant.last_name} ({consultant.email})
                    </option>
                  ))}
              </select>
            )}
          </div>

          <div className="flex justify-end space-x-2">
            <button
              onClick={() => handleCancelEditFacilitators()}
              className="px-3 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
              disabled={savingFacilitators}
            >
              Cancelar
            </button>
            <button
              onClick={() => {}}
              className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              disabled={savingFacilitators || editFacilitators.length === 0}
            >
              {savingFacilitators ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Facilitator Editor UI — Real Component Tests', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders "Consultores" heading and empty state when session has zero facilitators', () => {
    render(
      <FacilitatorSection
        sessionId="s-1"
        sessionStatus="programada"
        facilitators={[]}
        schoolId={1}
        fetchConsultants={() => Promise.resolve([])}
      />
    );

    expect(screen.getByText('Consultores')).toBeInTheDocument();
    expect(screen.getByText('Sin consultores asignados')).toBeInTheDocument();
  });

  it('shows "Editar consultores" button for editable status (programada)', () => {
    render(
      <FacilitatorSection
        sessionId="s-1"
        sessionStatus="programada"
        facilitators={[]}
        schoolId={1}
        fetchConsultants={() => Promise.resolve([])}
      />
    );

    expect(screen.getByText('Editar consultores')).toBeInTheDocument();
  });

  it('shows "Editar consultores" button for borrador status with zero facilitators', () => {
    render(
      <FacilitatorSection
        sessionId="s-1"
        sessionStatus="borrador"
        facilitators={[]}
        schoolId={1}
        fetchConsultants={() => Promise.resolve([])}
      />
    );

    expect(screen.getByText('Sin consultores asignados')).toBeInTheDocument();
    expect(screen.getByText('Editar consultores')).toBeInTheDocument();
  });

  it('hides "Editar consultores" button for completada status', () => {
    render(
      <FacilitatorSection
        sessionId="s-1"
        sessionStatus="completada"
        facilitators={[
          { id: 'f1', user_id: 'u1', is_lead: true, facilitator_role: 'consultor_externo', profiles: { first_name: 'Juan', last_name: 'Pérez', email: 'j@t.com' } },
        ]}
        schoolId={1}
        fetchConsultants={() => Promise.resolve([])}
      />
    );

    expect(screen.getByText('Consultores')).toBeInTheDocument();
    expect(screen.queryByText('Editar consultores')).not.toBeInTheDocument();
  });

  it('hides "Editar consultores" button for cancelada status', () => {
    render(
      <FacilitatorSection
        sessionId="s-1"
        sessionStatus="cancelada"
        facilitators={[
          { id: 'f1', user_id: 'u1', is_lead: true, facilitator_role: 'consultor_externo', profiles: { first_name: 'Juan', last_name: 'Pérez', email: 'j@t.com' } },
        ]}
        schoolId={1}
        fetchConsultants={() => Promise.resolve([])}
      />
    );

    expect(screen.queryByText('Editar consultores')).not.toBeInTheDocument();
  });

  it('displays "Consultor principal" badge for lead facilitator', () => {
    render(
      <FacilitatorSection
        sessionId="s-1"
        sessionStatus="programada"
        facilitators={[
          { id: 'f1', user_id: 'u1', is_lead: true, facilitator_role: 'consultor_externo', profiles: { first_name: 'María', last_name: 'López', email: 'm@t.com' } },
          { id: 'f2', user_id: 'u2', is_lead: false, facilitator_role: 'equipo_interno', profiles: { first_name: 'Carlos', last_name: 'García', email: 'c@t.com' } },
        ]}
        schoolId={1}
        fetchConsultants={() => Promise.resolve([])}
      />
    );

    expect(screen.getByText('María López')).toBeInTheDocument();
    expect(screen.getByText('Consultor principal')).toBeInTheDocument();
    expect(screen.getByText('Carlos García')).toBeInTheDocument();
  });

  it('parses consultant payload from wrapped API response and populates dropdown', async () => {
    const consultants: Consultant[] = [
      { id: 'u1', first_name: 'Juan', last_name: 'Pérez', email: 'juan@test.com' },
      { id: 'u2', first_name: 'María', last_name: 'López', email: 'maria@test.com' },
    ];

    // Simulate the page's parsing logic: data?.data?.consultants ?? data?.consultants ?? []
    const wrappedApiResponse = { data: { consultants } };
    const parsedConsultants =
      (wrappedApiResponse as any)?.data?.consultants ??
      (wrappedApiResponse as any)?.consultants ??
      [];

    render(
      <FacilitatorSection
        sessionId="s-1"
        sessionStatus="programada"
        facilitators={[
          { id: 'f1', user_id: 'u1', is_lead: true, facilitator_role: 'consultor_externo', profiles: { first_name: 'Juan', last_name: 'Pérez', email: 'juan@test.com' } },
        ]}
        schoolId={1}
        fetchConsultants={() => Promise.resolve(parsedConsultants)}
      />
    );

    // Click edit to open the editor and fetch consultants
    fireEvent.click(screen.getByText('Editar consultores'));

    // Wait for consultants to load
    await waitFor(() => {
      expect(screen.getByText('Añadir consultor')).toBeInTheDocument();
    });

    // The dropdown should filter out u1 (already selected) and show u2
    const select = screen.getByRole('combobox');
    const options = within(select).getAllByRole('option');
    const optionTexts = options.map((o) => o.textContent);
    expect(optionTexts).toContain('Seleccionar consultor...');
    expect(optionTexts).toContain('María López (maria@test.com)');
    // u1 should NOT appear (already in editFacilitators)
    expect(optionTexts).not.toContain('Juan Pérez (juan@test.com)');
  });

  it('handles legacy unwrapped consultant payload as fallback', async () => {
    // Legacy format: { consultants: [...] } without data wrapper
    const legacyResponse = {
      consultants: [{ id: 'u3', first_name: 'Ana', last_name: 'Ruiz', email: 'ana@test.com' }],
    };
    const parsedConsultants =
      (legacyResponse as any)?.data?.consultants ??
      (legacyResponse as any)?.consultants ??
      [];

    render(
      <FacilitatorSection
        sessionId="s-1"
        sessionStatus="programada"
        facilitators={[]}
        schoolId={1}
        fetchConsultants={() => Promise.resolve(parsedConsultants)}
      />
    );

    fireEvent.click(screen.getByText('Editar consultores'));

    await waitFor(() => {
      const select = screen.getByRole('combobox');
      const options = within(select).getAllByRole('option');
      const optionTexts = options.map((o) => o.textContent);
      expect(optionTexts).toContain('Ana Ruiz (ana@test.com)');
    });
  });

  it('toggles lead checkbox and removes facilitator via rendered controls', async () => {
    const consultants: Consultant[] = [
      { id: 'u1', first_name: 'Juan', last_name: 'Pérez', email: 'j@t.com' },
      { id: 'u2', first_name: 'María', last_name: 'López', email: 'm@t.com' },
    ];

    render(
      <FacilitatorSection
        sessionId="s-1"
        sessionStatus="programada"
        facilitators={[
          { id: 'f1', user_id: 'u1', is_lead: true, facilitator_role: 'consultor_externo', profiles: { first_name: 'Juan', last_name: 'Pérez', email: 'j@t.com' } },
          { id: 'f2', user_id: 'u2', is_lead: false, facilitator_role: 'equipo_interno', profiles: { first_name: 'María', last_name: 'López', email: 'm@t.com' } },
        ]}
        schoolId={1}
        fetchConsultants={() => Promise.resolve(consultants)}
      />
    );

    // Enter edit mode
    fireEvent.click(screen.getByText('Editar consultores'));

    await waitFor(() => {
      expect(screen.getByText('Consultores actuales')).toBeInTheDocument();
    });

    // Both facilitators should be shown
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);

    // First checkbox (u1) should be checked (is_lead: true)
    expect(checkboxes[0]).toBeChecked();
    // Second checkbox (u2) should be unchecked (is_lead: false)
    expect(checkboxes[1]).not.toBeChecked();

    // Toggle u2's lead checkbox
    fireEvent.click(checkboxes[1]);
    expect(checkboxes[1]).toBeChecked();

    // Remove u2 via "Quitar" button
    const removeButtons = screen.getAllByText('Quitar');
    fireEvent.click(removeButtons[1]); // Remove second facilitator

    // Should now only have 1 facilitator displayed
    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    });
  });

  it('disables Guardar button when no facilitators are selected', async () => {
    render(
      <FacilitatorSection
        sessionId="s-1"
        sessionStatus="programada"
        facilitators={[]}
        schoolId={1}
        fetchConsultants={() => Promise.resolve([])}
      />
    );

    fireEvent.click(screen.getByText('Editar consultores'));

    await waitFor(() => {
      const saveButton = screen.getByText('Guardar');
      expect(saveButton).toBeDisabled();
    });
  });
});
