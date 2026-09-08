import { buildSessionJoinPath } from './session-disclosure';

interface StartSessionResponse {
  ok: boolean;
  json: () => Promise<{ error?: string }>;
}

interface StartSessionWorkflowOptions {
  sessionId: string;
  accessToken: string;
  isManagedZoom: boolean;
  request: (url: string, init: RequestInit) => Promise<StartSessionResponse>;
  navigate: (path: string) => Promise<boolean>;
  refreshSession: () => Promise<void>;
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
}

/**
 * Commits the source-session transition before offering meeting entry.
 *
 * The managed and unmanaged continuations intentionally differ: managed
 * sessions continue through GENERA's protected meeting surface, while legacy
 * sessions stay on the detail page. A failed managed navigation cannot undo
 * the committed transition, so it refreshes the page to expose the recovery
 * action instead of reporting that the start itself failed.
 */
export async function startSessionWorkflow({
  sessionId,
  accessToken,
  isManagedZoom,
  request,
  navigate,
  refreshSession,
  notifySuccess,
  notifyError,
}: StartSessionWorkflowOptions): Promise<void> {
  const response = await request(`/api/sessions/${sessionId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'en_progreso' }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Error al iniciar sesión');
  }

  if (isManagedZoom) {
    notifySuccess('Sesión iniciada. Continuando a Zoom…');

    try {
      const navigated = await navigate(buildSessionJoinPath(sessionId));
      if (!navigated) throw new Error('Meeting navigation was cancelled');
    } catch {
      notifyError('La sesión se inició, pero no pudimos abrir Zoom. Usa “Ir a Zoom”.');
      await refreshSession();
    }
    return;
  }

  notifySuccess('Sesión iniciada exitosamente');
  await refreshSession();
}
