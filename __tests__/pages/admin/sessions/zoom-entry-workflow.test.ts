import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'pages/admin/sessions/[id].tsx'),
  'utf8'
);

describe('admin managed-Zoom entry workflow', () => {
  it('continues to the meeting surface after the start transition commits', () => {
    expect(pageSource).toContain("if (session.is_zoom_managed === true)");
    expect(pageSource).toContain('await router.push(buildSessionJoinPath(session.id))');
    expect(pageSource).toContain('Sesión iniciada. Continuando a Zoom…');
  });

  it('offers a prominent recovery action while a managed session is in progress', () => {
    expect(pageSource).toContain("session.status === 'en_progreso'");
    expect(pageSource).toContain('data-testid="session-zoom-entry-button"');
    expect(pageSource).toContain('Ir a Zoom');
  });

  it('keeps legacy unmanaged starts on the existing detail-page flow', () => {
    const managedContinuation = pageSource.indexOf(
      "if (session.is_zoom_managed === true)"
    );
    const legacySuccess = pageSource.indexOf(
      "toast.success('Sesión iniciada exitosamente')",
      managedContinuation
    );

    expect(managedContinuation).toBeGreaterThan(-1);
    expect(legacySuccess).toBeGreaterThan(managedContinuation);
  });
});
