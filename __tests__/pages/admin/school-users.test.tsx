// @vitest-environment jsdom
/**
 * School Users — Add User modal tests (Phase 14)
 *
 * Mirrors the facilitator-editor.test.tsx approach: extracts the create-user
 * form section from pages/admin/school-users.tsx into an isolated component so
 * we can render and assert against real DOM without pulling in MainLayout,
 * Supabase auth helpers, and the rest of the page's heavy dependency tree.
 *
 * Covers the "Guardar" / "Guardar y agregar otro" dual-submit flow.
 */
import React, { useRef, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Mirror of the create-user form + submit logic from
// pages/admin/school-users.tsx. Logic is identical — only stripped of toast
// styling and surrounding page chrome.
// ---------------------------------------------------------------------------
interface AddUserFormProps {
  schoolId: number;
  accessToken: string;
  onClose: () => void;
  onCreated: () => void;
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

function AddUserForm({
  schoolId,
  accessToken,
  onClose,
  onCreated,
  toastSuccess,
  toastError,
}: AddUserFormProps) {
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFirstName, setNewUserFirstName] = useState('');
  const [newUserLastName, setNewUserLastName] = useState('');
  const [newUserRole, setNewUserRole] = useState<string>('docente');
  const [isCreating, setIsCreating] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmitNewUser = async (addAnother: boolean) => {
    if (isCreating) return;

    if (!newUserEmail.trim() || !newUserPassword.trim()) {
      toastError('Email y contraseña son obligatorios');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          firstName: newUserFirstName,
          lastName: newUserLastName,
          role: newUserRole,
          schoolId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create user');
      }

      if (result.success && result.user) {
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserFirstName('');
        setNewUserLastName('');
        setNewUserRole('docente');
        onCreated();

        if (addAnother) {
          toastSuccess('Usuario creado. Puedes agregar otro.');
          emailInputRef.current?.focus();
        } else {
          onClose();
          toastSuccess('Usuario creado correctamente.');
        }
      }
    } catch (error: any) {
      toastError(`Error al crear usuario: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmitNewUser(false);
      }}
      data-testid="add-user-form"
    >
      <input
        ref={emailInputRef}
        type="email"
        aria-label="Email"
        value={newUserEmail}
        onChange={(e) => setNewUserEmail(e.target.value)}
        autoFocus
        required
      />
      <input
        type="password"
        aria-label="Contraseña"
        value={newUserPassword}
        onChange={(e) => setNewUserPassword(e.target.value)}
        minLength={6}
        required
      />
      <input
        type="text"
        aria-label="Nombre"
        value={newUserFirstName}
        onChange={(e) => setNewUserFirstName(e.target.value)}
      />
      <input
        type="text"
        aria-label="Apellido"
        value={newUserLastName}
        onChange={(e) => setNewUserLastName(e.target.value)}
      />
      <select
        aria-label="Rol"
        value={newUserRole}
        onChange={(e) => setNewUserRole(e.target.value)}
      >
        <option value="docente">Docente</option>
        <option value="estudiante">Estudiante</option>
      </select>
      <button type="button" onClick={onClose}>
        Cancelar
      </button>
      <button
        type="button"
        onClick={() => handleSubmitNewUser(true)}
        disabled={isCreating}
      >
        Guardar y agregar otro
      </button>
      <button type="submit" disabled={isCreating}>
        {isCreating ? 'Creando...' : 'Guardar'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'nuevo@colegio.cl' },
  });
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'temporal123' },
  });
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: 'Ana' },
  });
  fireEvent.change(screen.getByLabelText('Apellido'), {
    target: { value: 'Pérez' },
  });
}

function mockCreateUserSuccess() {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true, user: { id: 'u1' } }),
  });
}

describe('school-users — add user modal', () => {
  it('renders both submit buttons', () => {
    render(
      <AddUserForm
        schoolId={1}
        accessToken="token"
        onClose={vi.fn()}
        onCreated={vi.fn()}
        toastSuccess={vi.fn()}
        toastError={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Guardar y agregar otro' })
    ).toBeInTheDocument();
  });

  it('Guardar closes the modal on success', async () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const toastSuccess = vi.fn();
    mockCreateUserSuccess();

    render(
      <AddUserForm
        schoolId={1}
        accessToken="token"
        onClose={onClose}
        onCreated={onCreated}
        toastSuccess={toastSuccess}
        toastError={vi.fn()}
      />
    );

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('Guardar y agregar otro keeps the modal open, clears the form, and refocuses email', async () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const toastSuccess = vi.fn();
    mockCreateUserSuccess();

    render(
      <AddUserForm
        schoolId={1}
        accessToken="token"
        onClose={onClose}
        onCreated={onCreated}
        toastSuccess={toastSuccess}
        toastError={vi.fn()}
      />
    );

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('Rol'), {
      target: { value: 'estudiante' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar y agregar otro' })
    );

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();

    const email = screen.getByLabelText('Email') as HTMLInputElement;
    const password = screen.getByLabelText('Contraseña') as HTMLInputElement;
    const firstName = screen.getByLabelText('Nombre') as HTMLInputElement;
    const lastName = screen.getByLabelText('Apellido') as HTMLInputElement;
    const role = screen.getByLabelText('Rol') as HTMLSelectElement;

    expect(email.value).toBe('');
    expect(password.value).toBe('');
    expect(firstName.value).toBe('');
    expect(lastName.value).toBe('');
    expect(role.value).toBe('docente');
    expect(document.activeElement).toBe(email);
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining('Puedes agregar otro')
    );
  });

  it('supports an add-another loop: a second submit creates a second user', async () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, user: { id: 'u1' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, user: { id: 'u2' } }),
      });

    render(
      <AddUserForm
        schoolId={1}
        accessToken="token"
        onClose={onClose}
        onCreated={onCreated}
        toastSuccess={vi.fn()}
        toastError={vi.fn()}
      />
    );

    fillRequiredFields();
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar y agregar otro' })
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'segundo@colegio.cl' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'otra1234' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar y agregar otro' })
    );

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();

    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondCallBody.email).toBe('segundo@colegio.cl');
  });

  it('disables both submit buttons while submitting to prevent double submit', async () => {
    let resolveFetch: (value: any) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(
      <AddUserForm
        schoolId={1}
        accessToken="token"
        onClose={vi.fn()}
        onCreated={vi.fn()}
        toastSuccess={vi.fn()}
        toastError={vi.fn()}
      />
    );

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const guardar = screen.getByRole('button', { name: /Creando/ });
    const addAnother = screen.getByRole('button', {
      name: 'Guardar y agregar otro',
    });

    await waitFor(() => expect(guardar).toBeDisabled());
    expect(addAnother).toBeDisabled();

    resolveFetch({
      ok: true,
      json: async () => ({ success: true, user: { id: 'u1' } }),
    });

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Guardar' })
      ).not.toBeDisabled()
    );
  });

  it('keeps the modal open when validation fails (missing required fields)', async () => {
    const onClose = vi.fn();
    const toastError = vi.fn();

    render(
      <AddUserForm
        schoolId={1}
        accessToken="token"
        onClose={onClose}
        onCreated={vi.fn()}
        toastSuccess={vi.fn()}
        toastError={toastError}
      />
    );

    // Click the non-submit secondary button: it bypasses native required validation
    // but our handler must reject the submission and surface a toast.
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar y agregar otro' })
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        expect.stringContaining('obligatorios')
      )
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
