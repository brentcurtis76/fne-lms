// @vitest-environment node
/**
 * W-B2c-01 reporting scope: the ONE eligibility rule shared by the API door
 * (LearningPathsService.getReportScope) and the reports page tab (Codex step-3
 * r0 #3: a schoolless director must not be offered the tab the API refuses).
 */
import { describe, expect, it } from 'vitest';
import { learningPathReportScope } from '../../../lib/learning-paths/reportScope';

describe('learningPathReportScope', () => {
  it('active admin or consultor → all (wins over a director role)', () => {
    expect(learningPathReportScope([{ role_type: 'admin', school_id: null, is_active: true }])).toBe('all');
    expect(learningPathReportScope([{ role_type: 'consultor', school_id: null, is_active: true }])).toBe('all');
    expect(learningPathReportScope([
      { role_type: 'equipo_directivo', school_id: 7, is_active: true },
      { role_type: 'consultor', school_id: 3, is_active: true },
    ])).toBe('all');
  });

  it('active director WITH a school → school', () => {
    expect(learningPathReportScope([{ role_type: 'equipo_directivo', school_id: 990001, is_active: true }])).toBe('school');
  });

  it('a director with NO school → null (the API answers 403, so no tab and no school hint)', () => {
    expect(learningPathReportScope([{ role_type: 'equipo_directivo', school_id: null, is_active: true }])).toBeNull();
    expect(learningPathReportScope([{ role_type: 'equipo_directivo', is_active: true }])).toBeNull();
  });

  it('inactive rows never count', () => {
    expect(learningPathReportScope([{ role_type: 'admin', school_id: null, is_active: false }])).toBeNull();
    expect(learningPathReportScope([{ role_type: 'equipo_directivo', school_id: 1, is_active: null }])).toBeNull();
  });

  it('other roles, empty or unreadable rows → null', () => {
    expect(learningPathReportScope([{ role_type: 'lider_comunidad', school_id: 1, is_active: true }])).toBeNull();
    expect(learningPathReportScope([{ role_type: 'docente', school_id: 1, is_active: true }])).toBeNull();
    expect(learningPathReportScope([])).toBeNull();
    expect(learningPathReportScope(null)).toBeNull();
    expect(learningPathReportScope([null, undefined])).toBeNull();
  });
});
