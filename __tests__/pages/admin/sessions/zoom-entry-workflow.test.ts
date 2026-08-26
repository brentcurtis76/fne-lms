import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startSessionWorkflow } from '../../../../lib/utils/session-start-workflow';

const sessionId = 'session-123';
const accessToken = 'synthetic-access-token';

function response(ok: boolean, error?: string) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(error ? { error } : {}),
  };
}

function dependencies() {
  return {
    request: vi.fn().mockResolvedValue(response(true)),
    navigate: vi.fn().mockResolvedValue(true),
    refreshSession: vi.fn().mockResolvedValue(undefined),
    notifySuccess: vi.fn(),
    notifyError: vi.fn(),
  };
}

describe('admin managed-Zoom entry workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('commits the start transition before continuing to the protected meeting surface', async () => {
    const deps = dependencies();

    await startSessionWorkflow({
      sessionId,
      accessToken,
      isManagedZoom: true,
      ...deps,
    });

    expect(deps.request).toHaveBeenCalledWith(`/api/sessions/${sessionId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'en_progreso' }),
    });
    expect(deps.request.mock.invocationCallOrder[0]).toBeLessThan(
      deps.navigate.mock.invocationCallOrder[0]
    );
    expect(deps.navigate).toHaveBeenCalledWith(`/meet/session/${sessionId}`);
    expect(deps.notifySuccess).toHaveBeenCalledWith(
      'Sesión iniciada. Continuando a Zoom…'
    );
    expect(deps.notifyError).not.toHaveBeenCalled();
    expect(deps.refreshSession).not.toHaveBeenCalled();
  });

  it('does not navigate when the start API rejects the transition', async () => {
    const deps = dependencies();
    deps.request.mockResolvedValue(response(false, 'Zoom todavía no está listo'));

    await expect(
      startSessionWorkflow({
        sessionId,
        accessToken,
        isManagedZoom: true,
        ...deps,
      })
    ).rejects.toThrow('Zoom todavía no está listo');

    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.notifySuccess).not.toHaveBeenCalled();
    expect(deps.notifyError).not.toHaveBeenCalled();
    expect(deps.refreshSession).not.toHaveBeenCalled();
  });

  it.each([
    ['returns false', () => Promise.resolve(false)],
    ['rejects', () => Promise.reject(new Error('router unavailable'))],
  ])('recovers on the detail page when managed navigation %s', async (_label, navigate) => {
    const deps = dependencies();
    deps.navigate.mockImplementation(navigate);

    await startSessionWorkflow({
      sessionId,
      accessToken,
      isManagedZoom: true,
      ...deps,
    });

    expect(deps.notifySuccess).toHaveBeenCalledWith(
      'Sesión iniciada. Continuando a Zoom…'
    );
    expect(deps.notifyError).toHaveBeenCalledWith(
      'La sesión se inició, pero no pudimos abrir Zoom. Usa “Ir a Zoom”.'
    );
    expect(deps.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('keeps unmanaged starts on the existing success-and-refresh flow', async () => {
    const deps = dependencies();

    await startSessionWorkflow({
      sessionId,
      accessToken,
      isManagedZoom: false,
      ...deps,
    });

    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.notifySuccess).toHaveBeenCalledWith('Sesión iniciada exitosamente');
    expect(deps.notifyError).not.toHaveBeenCalled();
    expect(deps.refreshSession).toHaveBeenCalledTimes(1);
  });
});
