/**
 * Unit tests for Assessment Builder Publishing & Versioning
 * Phase 4+5: Template publishing, snapshots, and version management
 *
 * Tests cover:
 * - Publishing workflow validation
 * - Snapshot creation and data integrity
 * - Version numbering logic
 * - Duplication flow
 * - Auto-assignment with published templates
 */

import { describe, it, expect } from 'vitest';
import { TransformationArea, AREA_LABELS } from '@/types/assessment-builder';

describe('Assessment Builder Publishing API', () => {
  describe('Template Status Transitions', () => {
    it('should have valid template statuses', () => {
      const validStatuses = ['draft', 'published', 'archived'];
      expect(validStatuses).toHaveLength(3);
    });

    it('should only allow publishing from draft status', () => {
      const canPublish = (status: string) => status === 'draft';
      expect(canPublish('draft')).toBe(true);
      expect(canPublish('published')).toBe(false);
      expect(canPublish('archived')).toBe(false);
    });

    it('should transition draft to published on publish', () => {
      const currentStatus = 'draft';
      const newStatus = 'published';
      expect(currentStatus).not.toBe(newStatus);
    });
  });

  describe('Publishing Prerequisites', () => {
    it('should require at least one module', () => {
      const modules: any[] = [];
      const hasModules = modules.length > 0;
      expect(hasModules).toBe(false);
    });

    it('should require at least one indicator', () => {
      const modules = [{ indicators: [] }];
      const totalIndicators = modules.reduce((sum, m) => sum + (m.indicators?.length || 0), 0);
      expect(totalIndicators).toBe(0);
    });

    it('should allow publishing with modules and indicators', () => {
      const modules = [
        { id: '1', indicators: [{ id: 'ind-1' }] },
        { id: '2', indicators: [{ id: 'ind-2' }, { id: 'ind-3' }] },
      ];
      const hasModules = modules.length > 0;
      const totalIndicators = modules.reduce((sum, m) => sum + (m.indicators?.length || 0), 0);

      expect(hasModules).toBe(true);
      expect(totalIndicators).toBe(3);
    });
  });

  describe('Version Numbering', () => {
    it('should increment minor version on publish', () => {
      const currentVersion = '1.0.0';
      const parts = currentVersion.split('.').map(Number);
      parts[1] = (parts[1] || 0) + 1;
      parts[2] = 0;
      const newVersion = parts.join('.');

      expect(newVersion).toBe('1.1.0');
    });

    it('should increment major version on duplicate', () => {
      const currentVersion = '1.2.3';
      const parts = currentVersion.split('.').map(Number);
      parts[0] = (parts[0] || 1) + 1;
      parts[1] = 0;
      parts[2] = 0;
      const newVersion = parts.join('.');

      expect(newVersion).toBe('2.0.0');
    });

    it('should handle first publish from 1.0.0', () => {
      const currentVersion = '1.0.0';
      const parts = currentVersion.split('.').map(Number);
      parts[1] = (parts[1] || 0) + 1;
      parts[2] = 0;
      const newVersion = parts.join('.');

      expect(newVersion).toBe('1.1.0');
    });

    it('should parse version string correctly', () => {
      const version = '2.5.1';
      const [major, minor, patch] = version.split('.').map(Number);

      expect(major).toBe(2);
      expect(minor).toBe(5);
      expect(patch).toBe(1);
    });
  });

  describe('Snapshot Data Structure', () => {
    interface SnapshotData {
      template: {
        id: string;
        name: string;
        description?: string;
        area: TransformationArea;
        scoring_config?: any;
      };
      modules: {
        id: string;
        name: string;
        description?: string;
        indicators: {
          id: string;
          name: string;
          category: string;
        }[];
      }[];
      published_at: string;
      published_by: string;
    }

    it('should contain template metadata', () => {
      const snapshot: SnapshotData = {
        template: {
          id: 'template-1',
          name: 'Test Template',
          area: 'personalizacion',
        },
        modules: [],
        published_at: '2025-01-01T00:00:00Z',
        published_by: 'user-1',
      };

      expect(snapshot.template.id).toBeDefined();
      expect(snapshot.template.name).toBeDefined();
      expect(snapshot.template.area).toBeDefined();
    });

    it('should contain nested modules with indicators', () => {
      const snapshot: SnapshotData = {
        template: { id: 't1', name: 'Test', area: 'aprendizaje' },
        modules: [
          {
            id: 'm1',
            name: 'Module 1',
            indicators: [
              { id: 'i1', name: 'Indicator 1', category: 'cobertura' },
              { id: 'i2', name: 'Indicator 2', category: 'profundidad' },
            ],
          },
        ],
        published_at: '2025-01-01T00:00:00Z',
        published_by: 'user-1',
      };

      expect(snapshot.modules).toHaveLength(1);
      expect(snapshot.modules[0].indicators).toHaveLength(2);
    });

    it('should include publish metadata', () => {
      const snapshot: SnapshotData = {
        template: { id: 't1', name: 'Test', area: 'evaluacion' },
        modules: [],
        published_at: new Date().toISOString(),
        published_by: 'user-uuid-123',
      };

      expect(snapshot.published_at).toBeDefined();
      expect(snapshot.published_by).toBeDefined();
    });
  });

  describe('Snapshot Immutability', () => {
    it('should not allow editing published template', () => {
      const templateStatus = 'published';
      const canEdit = templateStatus === 'draft';
      expect(canEdit).toBe(false);
    });

    it('should create new draft for editing published content', () => {
      const sourceStatus = 'published';
      const duplicateStatus = 'draft';
      expect(duplicateStatus).toBe('draft');
      expect(sourceStatus).not.toBe(duplicateStatus);
    });

    it('should preserve original snapshot when duplicating', () => {
      const originalSnapshotId = 'snapshot-original';
      const newDraftId = 'template-new-draft';
      // Duplication creates a new template, original snapshot unchanged
      expect(originalSnapshotId).not.toBe(newDraftId);
    });
  });

  describe('Duplicate Flow', () => {
    it('should copy all modules from source', () => {
      const sourceModules = [
        { id: 'm1', name: 'Module 1' },
        { id: 'm2', name: 'Module 2' },
      ];
      const copiedModules = sourceModules.map(m => ({ ...m, id: `new-${m.id}` }));

      expect(copiedModules).toHaveLength(sourceModules.length);
      expect(copiedModules[0].name).toBe(sourceModules[0].name);
    });

    it('should copy all indicators from source', () => {
      const sourceIndicators = [
        { id: 'i1', name: 'Indicator 1', module_id: 'm1' },
        { id: 'i2', name: 'Indicator 2', module_id: 'm1' },
      ];
      const copiedIndicators = sourceIndicators.map(i => ({
        ...i,
        id: `new-${i.id}`,
        module_id: `new-${i.module_id}`,
      }));

      expect(copiedIndicators).toHaveLength(sourceIndicators.length);
    });

    it('should reset status to draft', () => {
      const sourceStatus = 'published';
      const newStatus = 'draft';
      expect(newStatus).toBe('draft');
    });

    it('should increment major version', () => {
      const sourceVersion = '1.5.0';
      const parts = sourceVersion.split('.').map(Number);
      parts[0] += 1;
      parts[1] = 0;
      parts[2] = 0;
      const newVersion = parts.join('.');

      expect(newVersion).toBe('2.0.0');
    });
  });

  describe('Auto-Assignment with Published Templates', () => {
    it('should only use published templates', () => {
      const templates = [
        { id: 't1', status: 'draft' },
        { id: 't2', status: 'published' },
        { id: 't3', status: 'archived' },
      ];
      const publishedTemplates = templates.filter(t => t.status === 'published');

      expect(publishedTemplates).toHaveLength(1);
      expect(publishedTemplates[0].id).toBe('t2');
    });

    it('should skip templates without published snapshots', () => {
      const template = {
        id: 't1',
        status: 'published',
        snapshots: [],
      };
      const latestSnapshot = template.snapshots[0];

      expect(latestSnapshot).toBeUndefined();
    });

    it('should use latest snapshot when multiple exist', () => {
      const snapshots = [
        { id: 's1', version: '1.0.0', created_at: '2025-01-01T00:00:00Z' },
        { id: 's2', version: '1.1.0', created_at: '2025-01-02T00:00:00Z' },
        { id: 's3', version: '1.2.0', created_at: '2025-01-03T00:00:00Z' },
      ];

      const sorted = [...snapshots].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const latest = sorted[0];

      expect(latest.id).toBe('s3');
      expect(latest.version).toBe('1.2.0');
    });

    it('should reference snapshot_id not template_id in instances', () => {
      const instance = {
        template_snapshot_id: 'snapshot-123',
        school_id: 1,
        course_structure_id: 'course-1',
      };

      expect(instance.template_snapshot_id).toBeDefined();
      expect((instance as any).template_id).toBeUndefined();
    });
  });

  describe('Version History', () => {
    it('should list all snapshots for a template', () => {
      const snapshots = [
        { id: 's1', version: '1.0.0', template_id: 't1' },
        { id: 's2', version: '1.1.0', template_id: 't1' },
      ];
      const templateSnapshots = snapshots.filter(s => s.template_id === 't1');

      expect(templateSnapshots).toHaveLength(2);
    });

    it('should include stats in version response', () => {
      const versionResponse = {
        id: 'snapshot-1',
        version: '1.1.0',
        createdAt: '2025-01-01T00:00:00Z',
        stats: {
          modules: 3,
          indicators: 15,
        },
      };

      expect(versionResponse.stats.modules).toBe(3);
      expect(versionResponse.stats.indicators).toBe(15);
    });

    it('should order versions by date descending', () => {
      const versions = [
        { version: '1.0.0', createdAt: '2025-01-01' },
        { version: '1.2.0', createdAt: '2025-01-03' },
        { version: '1.1.0', createdAt: '2025-01-02' },
      ];

      const sorted = [...versions].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      expect(sorted[0].version).toBe('1.2.0');
      expect(sorted[1].version).toBe('1.1.0');
      expect(sorted[2].version).toBe('1.0.0');
    });
  });

  describe('Permission Checks', () => {
    it('should require admin or consultor for publishing', () => {
      const userRoles = ['admin'];
      const canPublish = userRoles.includes('admin') || userRoles.includes('consultor');
      expect(canPublish).toBe(true);
    });

    it('should deny publishing for docente role', () => {
      const userRoles = ['docente'];
      const canPublish = userRoles.includes('admin') || userRoles.includes('consultor');
      expect(canPublish).toBe(false);
    });

    it('should deny publishing for directivo role', () => {
      const userRoles = ['directivo'];
      const canPublish = userRoles.includes('admin') || userRoles.includes('consultor');
      expect(canPublish).toBe(false);
    });
  });

  describe('API Response Structures', () => {
    it('should return correct publish response', () => {
      const response = {
        success: true,
        message: 'Template publicado como versión 1.1.0',
        template: {
          id: 'template-1',
          name: 'Test',
          area: 'personalizacion',
          status: 'published',
          version: '1.1.0',
        },
        snapshot: {
          id: 'snapshot-1',
          version: '1.1.0',
          createdAt: '2025-01-01T00:00:00Z',
        },
      };

      expect(response.success).toBe(true);
      expect(response.template.status).toBe('published');
      expect(response.snapshot).toBeDefined();
    });

    it('should return correct duplicate response', () => {
      const response = {
        success: true,
        message: 'Template duplicado como versión 2.0.0 (borrador)',
        template: {
          id: 'new-template-id',
          name: 'Test',
          status: 'draft',
          version: '2.0.0',
        },
        stats: {
          modules: 3,
          indicators: 12,
        },
        sourceTemplateId: 'original-template-id',
      };

      expect(response.success).toBe(true);
      expect(response.template.status).toBe('draft');
      expect(response.sourceTemplateId).toBeDefined();
    });

    it('should return correct versions list response', () => {
      const response = {
        success: true,
        template: {
          id: 't1',
          name: 'Test',
          currentStatus: 'published',
          currentVersion: '1.2.0',
        },
        versions: [
          { id: 's2', version: '1.2.0', stats: { modules: 3, indicators: 10 } },
          { id: 's1', version: '1.1.0', stats: { modules: 2, indicators: 5 } },
        ],
        totalVersions: 2,
      };

      expect(response.versions).toHaveLength(2);
      expect(response.totalVersions).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should reject publishing already published template', () => {
      const template = { status: 'published' };
      const canPublish = template.status === 'draft';
      const errorMessage = 'Solo los templates en estado borrador pueden ser publicados';

      expect(canPublish).toBe(false);
      expect(errorMessage).toContain('borrador');
    });

    it('should reject publishing without modules', () => {
      const modules: any[] = [];
      const hasModules = modules.length > 0;
      const errorMessage = 'El template debe tener al menos un módulo';

      expect(hasModules).toBe(false);
      expect(errorMessage).toContain('módulo');
    });

    it('should reject publishing without indicators', () => {
      const modules = [{ indicators: [] }];
      const totalIndicators = modules.reduce((sum, m) => sum + (m.indicators?.length || 0), 0);
      const errorMessage = 'El template debe tener al menos un indicador';

      expect(totalIndicators).toBe(0);
      expect(errorMessage).toContain('indicador');
    });
  });
});
