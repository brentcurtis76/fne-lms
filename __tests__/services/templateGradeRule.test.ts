// @vitest-environment node
/**
 * templateGradeRule (20261008120000, Codex B3 r1): version allocation reads the
 * whole scope page by page (PostgREST max_rows = 1000), so an occupied version
 * beyond the first page is never handed out again.
 */
import { describe, it, expect } from 'vitest';
import { nextTemplateVersion, checkTemplateGrade, templateWriteConflict } from '../../lib/services/assessment-builder/templateGradeRule';

/** A client whose select honours .range(from, to) over `rows`, capped at 1000 like PostgREST. */
function pagedClient(rows: { version: string; name: string }[], failAtPage?: number) {
  const ranges: [number, number][] = [];
  return {
    ranges,
    from() {
      const q: any = {
        select: () => q, eq: () => q, is: () => q, order: () => q,
        range: (from: number, to: number) => {
          ranges.push([from, to]);
          const page = ranges.length - 1;
          return Promise.resolve(
            page === failAtPage
              ? { data: null, error: { message: 'x' } }
              : { data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null }
          );
        },
      };
      return q;
    },
  };
}

describe('nextTemplateVersion', () => {
  it('sees a graded version beyond the first 1000 rows', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ version: `1.0.${i}`, name: 'CRE' }));
    const c = pagedClient(rows);
    expect(await nextTemplateVersion(c, 'personalizacion', 7, 'CRE')).toBe('1.0.1001');
    expect(c.ranges).toEqual([[0, 999], [1000, 1999]]);
  });

  it('finds a grade-less name whose rows sit beyond the first page', async () => {
    const rows = [
      ...Array.from({ length: 1000 }, (_, i) => ({ version: `9.0.${i}`, name: `Otro ${i}` })),
      { version: '1.0.0', name: ' LID Equipo ' },
    ];
    expect(await nextTemplateVersion(pagedClient(rows), 'liderazgo', null, 'LID Equipo')).toBe('1.0.1');
  });

  it('starts at 1.0.0 for an empty scope', async () => {
    expect(await nextTemplateVersion(pagedClient([]), 'liderazgo', null, 'Nuevo')).toBe('1.0.0');
  });

  it('refuses to guess when a page cannot be read', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ version: `1.0.${i}`, name: 'CRE' }));
    await expect(nextTemplateVersion(pagedClient(rows, 1), 'personalizacion', 7, 'CRE')).rejects.toThrow();
  });
});

describe('checkTemplateGrade', () => {
  const rulesClient = (rules: unknown, error: unknown = null) => ({
    from: () => ({ select: () => Promise.resolve({ data: rules, error }) }),
  });
  const RULES = [{ area: 'personalizacion', target: 'course_docente' }, { area: 'liderazgo', target: 'school_responsible' }];

  it('course vía needs a grade; school vía refuses one', async () => {
    expect((await checkTemplateGrade(rulesClient(RULES), 'personalizacion', null)).kind).toBe('error');
    expect((await checkTemplateGrade(rulesClient(RULES), 'personalizacion', 7)).kind).toBe('ok');
    expect((await checkTemplateGrade(rulesClient(RULES), 'liderazgo', 7)).kind).toBe('error');
    expect((await checkTemplateGrade(rulesClient(RULES), 'liderazgo', null)).kind).toBe('ok');
  });

  it('a vía without rule, or a failed read, is refused', async () => {
    expect((await checkTemplateGrade(rulesClient(RULES), 'familias', 7)).kind).toBe('error');
    const failed = await checkTemplateGrade(rulesClient(null, { message: 'down' }), 'personalizacion', 7);
    expect(failed).toMatchObject({ kind: 'error', status: 500 });
  });
});

describe('templateWriteConflict', () => {
  it('maps guard codes and unique violations; leaves other errors alone', () => {
    expect(templateWriteConflict({ message: 'template_grade_required' })).toContain('nivel es requerido');
    expect(templateWriteConflict({ code: '23505', message: 'duplicate key' })).toContain('Ya existe');
    expect(templateWriteConflict({ message: 'something else' })).toBeNull();
  });
});
