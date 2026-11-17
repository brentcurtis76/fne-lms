// @vitest-environment node
/**
 * GC-3c: the one line under «¿Publicar este template?» saying how many
 * courses (or schools) will receive the registro. Five cases.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => null }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, push: vi.fn() }) }));

import { publishDeliveryPreviewText } from '../../../pages/admin/assessment-builder/[templateId]/index';

describe('publishDeliveryPreviewText', () => {
  it('while loading', () => {
    expect(publishDeliveryPreviewText({ status: 'loading' })).toBe('Calculando cuántos cursos lo recibirán…');
  });

  it('course target with courses', () => {
    expect(publishDeliveryPreviewText({ status: 'ready', target: 'course_docente', courses: 7, schools: 2 })).toBe(
      'Al publicar, 7 curso(s) con docente asignado recibirán este registro.'
    );
  });

  it('school target with schools', () => {
    expect(publishDeliveryPreviewText({ status: 'ready', target: 'school_responsible', courses: 0, schools: 3 })).toBe(
      'Al publicar, 3 escuela(s) con responsable asignado recibirán este registro.'
    );
  });

  it('nothing to deliver', () => {
    const none = 'Por ahora ningún curso recibirá este registro; llegará cuando se asigne un docente o responsable.';
    expect(publishDeliveryPreviewText({ status: 'ready', target: 'course_docente', courses: 0, schools: 0 })).toBe(none);
    expect(publishDeliveryPreviewText({ status: 'ready', target: 'school_responsible', courses: 0, schools: 0 })).toBe(none);
    expect(publishDeliveryPreviewText({ status: 'ready', target: null, courses: 0, schools: 0 })).toBe(none);
  });

  it('the request failed', () => {
    expect(publishDeliveryPreviewText({ status: 'error' })).toBe(
      'No se pudo calcular cuántos cursos lo recibirán. Puede publicar igualmente.'
    );
  });
});
