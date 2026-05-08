// @vitest-environment jsdom
import React from 'react';
import { render, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).React = React;

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  }),
}));

import UserEditModal from '../../components/admin/UserEditModal';

const baseUser = {
  id: 'user-1',
  email: 'user@example.com',
  first_name: 'First',
  last_name: 'Last',
  school: 'Colegio Original',
  external_school_affiliation: null,
  user_roles: [{ role_type: 'docente' }],
  can_run_qa_tests: false,
};

const baseProps = {
  isOpen: true as const,
  onClose: vi.fn(),
  onUserUpdated: vi.fn(),
};

let fetchMock: ReturnType<typeof vi.fn>;

const installFetch = () => {
  fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  // @ts-expect-error override global fetch
  global.fetch = fetchMock;
};

const findSchoolInput = () =>
  document.body.querySelector('#school') as HTMLInputElement | null;

const findSubmitButton = () =>
  Array.from(document.body.querySelectorAll('button')).find((b) =>
    /Guardar Cambios/i.test(b.textContent ?? ''),
  ) as HTMLButtonElement | undefined;

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('UserEditModal — disableSchoolEdit prop', () => {
  it('default (disableSchoolEdit omitted) leaves school input editable and submits school in body', async () => {
    render(<UserEditModal {...baseProps} user={baseUser} />);

    const input = findSchoolInput();
    expect(input).toBeTruthy();
    expect(input!.disabled).toBe(false);
    expect(input!.title).toBe('');

    await act(async () => {
      fireEvent.change(input!, { target: { value: 'Colegio Editado' } });
    });

    const submit = findSubmitButton()!;
    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as any).body);
    expect(body).toHaveProperty('school', 'Colegio Editado');
  });

  it('disableSchoolEdit=true disables the input with tooltip and omits school from submit body', async () => {
    render(
      <UserEditModal {...baseProps} user={baseUser} disableSchoolEdit />,
    );

    const input = findSchoolInput();
    expect(input).toBeTruthy();
    expect(input!.disabled).toBe(true);
    expect(input!.title).toBe('Tu colegio no puede modificarse desde aquí');

    const submit = findSubmitButton()!;
    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/admin/update-user');
    const body = JSON.parse((init as any).body);
    expect(body).not.toHaveProperty('school');
    // Other fields should still be present
    expect(body).toHaveProperty('email');
    expect(body).toHaveProperty('first_name');
    expect(body).toHaveProperty('last_name');
    expect(body).toHaveProperty('originalEmail');
  });
});
