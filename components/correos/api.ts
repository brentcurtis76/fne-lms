/** The Correos screens' calls to their routes: JSON in, `{ status, body }` out, never a throw. */

export interface ApiAnswer<T = any> {
  status: number;
  body: T | null;
}

export async function callApi<T = any>(url: string, init: { method?: string; body?: unknown } = {}): Promise<ApiAnswer<T>> {
  try {
    const response = await fetch(url, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const body = (await response.json().catch(() => null)) as T | null;
    return { status: response.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

/** The plain message to show for an answer that is not a success. */
export function failureText(answer: ApiAnswer): string {
  const error = answer.body && typeof answer.body === 'object' ? (answer.body as { error?: unknown }).error : undefined;
  if (typeof error === 'string' && error) return error;
  if (answer.status === 401) return 'Tu sesión terminó. Vuelve a iniciar sesión.';
  if (answer.status === 403) return 'Solo un administrador puede hacer esto.';
  if (answer.status === 0) return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.';
  return 'Algo falló. Inténtalo de nuevo en un momento.';
}
