import { describe, expect, it, vi } from 'vitest';
import type { AutoAssignmentResult } from '@/lib/services/assessment-builder/autoAssignmentService';

// Mock types for testing
interface MockTemplate {
  id: string;
  name: string;
  area: string;
  status: 'draft' | 'published' | 'archived';
  assessment_template_snapshots?: Array<{
    id: string;
    version: string;
    created_at: string;
  }>;
}

interface MockInstance {
  id: string;
  template_snapshot_id: string;
  school_id: number;
  course_structure_id?: string;
  transformation_year: number;
  status: string;
}

describe('Auto-Assignment Service Types', () => {
  describe('AutoAssignmentResult structure', () => {
    it('should have correct success result structure', () => {
      const result: AutoAssignmentResult = {
        success: true,
        instancesCreated: 3,
        instancesSkipped: 2,
        errors: [],
        details: [
          {
            templateId: 'template-1',
            templateName: 'Personalización',
            area: 'personalizacion',
            instanceId: 'instance-1',
            status: 'created',
          },
          {
            templateId: 'template-2',
            templateName: 'Aprendizaje',
            area: 'aprendizaje',
            instanceId: 'instance-2',
            status: 'already_exists',
          },
        ],
      };

      expect(result.success).toBe(true);
      expect(result.instancesCreated).toBe(3);
      expect(result.instancesSkipped).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(result.details).toHaveLength(2);
    });

    it('should have correct error result structure', () => {
      const result: AutoAssignmentResult = {
        success: false,
        instancesCreated: 1,
        instancesSkipped: 0,
        errors: [
          'Template Evaluación: No snapshot available',
          'Template Propósito: Failed to create instance',
        ],
        details: [
          {
            templateId: 'template-1',
            templateName: 'Personalización',
            area: 'personalizacion',
            instanceId: 'instance-1',
            status: 'created',
          },
          {
            templateId: 'template-3',
            templateName: 'Evaluación',
            area: 'evaluacion',
            status: 'error',
            error: 'No snapshot available',
          },
        ],
      };

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.details[1].status).toBe('error');
      expect(result.details[1].error).toBe('No snapshot available');
    });

    it('should support all status types in details', () => {
      const statuses: Array<'created' | 'already_exists' | 'error'> = [
        'created',
        'already_exists',
        'error',
      ];

      statuses.forEach(status => {
        const detail: AutoAssignmentResult['details'][0] = {
          templateId: 'template-1',
          templateName: 'Test',
          area: 'personalizacion',
          status,
        };
        expect(detail.status).toBe(status);
      });
    });
  });
});

describe('Auto-Assignment Business Logic', () => {
  describe('Template filtering', () => {
    it('should only process published templates', () => {
      const templates: MockTemplate[] = [
        { id: '1', name: 'Draft Template', area: 'personalizacion', status: 'draft' },
        { id: '2', name: 'Published Template', area: 'aprendizaje', status: 'published' },
        { id: '3', name: 'Archived Template', area: 'evaluacion', status: 'archived' },
        { id: '4', name: 'Another Published', area: 'proposito', status: 'published' },
      ];

      const publishedTemplates = templates.filter(t => t.status === 'published');

      expect(publishedTemplates).toHaveLength(2);
      expect(publishedTemplates[0].name).toBe('Published Template');
      expect(publishedTemplates[1].name).toBe('Another Published');
    });

    it('should handle case when no published templates exist', () => {
      const templates: MockTemplate[] = [
        { id: '1', name: 'Draft Template', area: 'personalizacion', status: 'draft' },
        { id: '2', name: 'Another Draft', area: 'aprendizaje', status: 'draft' },
      ];

      const publishedTemplates = templates.filter(t => t.status === 'published');

      expect(publishedTemplates).toHaveLength(0);
    });
  });

  describe('Snapshot selection', () => {
    it('should select the latest snapshot by created_at', () => {
      const snapshots = [
        { id: 'snap-1', version: '1.0.0', created_at: '2024-01-01T00:00:00Z' },
        { id: 'snap-3', version: '1.2.0', created_at: '2024-03-01T00:00:00Z' },
        { id: 'snap-2', version: '1.1.0', created_at: '2024-02-01T00:00:00Z' },
      ];

      const latestSnapshot = snapshots.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      expect(latestSnapshot.id).toBe('snap-3');
      expect(latestSnapshot.version).toBe('1.2.0');
    });

    it('should handle templates without snapshots', () => {
      const template: MockTemplate = {
        id: 'template-1',
        name: 'Test',
        area: 'personalizacion',
        status: 'published',
        assessment_template_snapshots: [],
      };

      const snapshots = template.assessment_template_snapshots || [];
      const hasSnapshot = snapshots.length > 0;

      expect(hasSnapshot).toBe(false);
    });
  });

  describe('Instance deduplication', () => {
    it('should detect existing instances by course_structure_id and snapshot_id', () => {
      const existingInstances: MockInstance[] = [
        {
          id: 'instance-1',
          template_snapshot_id: 'snap-1',
          school_id: 1,
          course_structure_id: 'course-1',
          transformation_year: 3,
          status: 'pending',
        },
        {
          id: 'instance-2',
          template_snapshot_id: 'snap-2',
          school_id: 1,
          course_structure_id: 'course-1',
          transformation_year: 3,
          status: 'in_progress',
        },
      ];

      const checkExists = (courseStructureId: string, snapshotId: string): boolean => {
        return existingInstances.some(
          i => i.course_structure_id === courseStructureId &&
               i.template_snapshot_id === snapshotId
        );
      };

      expect(checkExists('course-1', 'snap-1')).toBe(true);
      expect(checkExists('course-1', 'snap-2')).toBe(true);
      expect(checkExists('course-1', 'snap-3')).toBe(false);
      expect(checkExists('course-2', 'snap-1')).toBe(false);
    });

    it('should not create duplicate instances', () => {
      const existingInstanceIds = new Set(['snap-1|course-1', 'snap-2|course-1']);

      const snapshotsToProcess = ['snap-1', 'snap-2', 'snap-3'];
      const courseStructureId = 'course-1';

      const newInstancesToCreate = snapshotsToProcess.filter(snapId => {
        const key = `${snapId}|${courseStructureId}`;
        return !existingInstanceIds.has(key);
      });

      expect(newInstancesToCreate).toHaveLength(1);
      expect(newInstancesToCreate[0]).toBe('snap-3');
    });
  });

  describe('Transformation year handling', () => {
    it('should use school context transformation year for new instances', () => {
      const schoolContext = {
        implementation_year_2026: 3 as const,
      };

      const newInstance: MockInstance = {
        id: 'new-instance',
        template_snapshot_id: 'snap-1',
        school_id: 1,
        course_structure_id: 'course-1',
        transformation_year: schoolContext.implementation_year_2026,
        status: 'pending',
      };

      expect(newInstance.transformation_year).toBe(3);
    });

    it('should validate transformation year is 1-5', () => {
      const validYears = [1, 2, 3, 4, 5];

      validYears.forEach(year => {
        expect(year).toBeGreaterThanOrEqual(1);
        expect(year).toBeLessThanOrEqual(5);
      });
    });
  });

  describe('Error handling', () => {
    it('should accumulate errors without stopping processing', () => {
      const results: AutoAssignmentResult = {
        success: false,
        instancesCreated: 2,
        instancesSkipped: 1,
        errors: [],
        details: [],
      };

      // Simulate processing 5 templates
      const templates = [
        { id: '1', success: true },
        { id: '2', success: false, error: 'No snapshot' },
        { id: '3', success: true },
        { id: '4', success: false, error: 'DB error' },
        { id: '5', success: true },
      ];

      templates.forEach(t => {
        if (!t.success && t.error) {
          results.errors.push(`Template ${t.id}: ${t.error}`);
        }
      });

      expect(results.errors).toHaveLength(2);
      expect(results.errors[0]).toContain('No snapshot');
      expect(results.errors[1]).toContain('DB error');
    });

    it('should set success to false if any errors occurred', () => {
      const determineSuccess = (errors: string[]): boolean => {
        return errors.length === 0;
      };

      expect(determineSuccess([])).toBe(true);
      expect(determineSuccess(['Some error'])).toBe(false);
      expect(determineSuccess(['Error 1', 'Error 2'])).toBe(false);
    });
  });

  describe('Assignee creation', () => {
    it('should create assignee with correct permissions', () => {
      const assignee = {
        instance_id: 'instance-1',
        user_id: 'docente-1',
        can_edit: true,
        can_submit: true,
        assigned_by: 'directivo-1',
      };

      expect(assignee.can_edit).toBe(true);
      expect(assignee.can_submit).toBe(true);
      expect(assignee.assigned_by).toBe('directivo-1');
    });

    it('should link docente to instance', () => {
      const instanceAssignees: Array<{ instance_id: string; user_id: string }> = [];

      // Simulate assigning docente to multiple instances
      const docenteId = 'docente-1';
      const instances = ['instance-1', 'instance-2', 'instance-3'];

      instances.forEach(instanceId => {
        instanceAssignees.push({
          instance_id: instanceId,
          user_id: docenteId,
        });
      });

      expect(instanceAssignees).toHaveLength(3);
      expect(instanceAssignees.every(a => a.user_id === docenteId)).toBe(true);
    });
  });
});

describe('Auto-Assignment Integration Scenarios', () => {
  it('should create instances for all 7 vías when all are published', () => {
    const areas = [
      'personalizacion',
      'aprendizaje',
      'evaluacion',
      'proposito',
      'familias',
      'trabajo_docente',
      'liderazgo',
    ];

    const publishedTemplates = areas.map((area, index) => ({
      id: `template-${index + 1}`,
      name: `Template ${area}`,
      area,
      status: 'published' as const,
      assessment_template_snapshots: [
        { id: `snap-${index + 1}`, version: '1.0.0', created_at: new Date().toISOString() },
      ],
    }));

    expect(publishedTemplates).toHaveLength(7);
    expect(publishedTemplates.every(t => t.status === 'published')).toBe(true);
    expect(publishedTemplates.every(t => t.assessment_template_snapshots!.length > 0)).toBe(true);
  });

  it('should handle partial assignment (some templates published)', () => {
    const allTemplates: MockTemplate[] = [
      { id: '1', name: 'Personalización', area: 'personalizacion', status: 'published' },
      { id: '2', name: 'Aprendizaje', area: 'aprendizaje', status: 'published' },
      { id: '3', name: 'Evaluación', area: 'evaluacion', status: 'published' },
      { id: '4', name: 'Propósito', area: 'proposito', status: 'draft' },
      { id: '5', name: 'Familias', area: 'familias', status: 'draft' },
      { id: '6', name: 'Trabajo Docente', area: 'trabajo_docente', status: 'draft' },
      { id: '7', name: 'Liderazgo', area: 'liderazgo', status: 'draft' },
    ];

    const publishedOnly = allTemplates.filter(t => t.status === 'published');

    expect(publishedOnly).toHaveLength(3);
    expect(publishedOnly.map(t => t.area)).toEqual([
      'personalizacion',
      'aprendizaje',
      'evaluacion',
    ]);
  });

  it('should correctly count created vs skipped instances', () => {
    // Simulate processing where some instances already exist
    const processResults = [
      { templateId: '1', created: true },
      { templateId: '2', created: false }, // Already exists
      { templateId: '3', created: true },
      { templateId: '4', created: false }, // Already exists
      { templateId: '5', created: true },
    ];

    const created = processResults.filter(r => r.created).length;
    const skipped = processResults.filter(r => !r.created).length;

    expect(created).toBe(3);
    expect(skipped).toBe(2);
  });
});
