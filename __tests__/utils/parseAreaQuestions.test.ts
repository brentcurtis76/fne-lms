/**
 * Unit tests for área-specific markdown parser
 * Tests both PROGRESION-PERSONALIZACION.md (44 sections) and PROGRESION-APRENDIZAJE.md (68 sections)
 * Files located in Progresión/ folder
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseAreaMarkdown, getFlattenedSections } from '@/utils/parseAreaQuestions';

describe('parseAreaMarkdown', () => {
  describe('PROGRESION-PERSONALIZACION.md parsing', () => {
    it('should parse Personalización markdown and return 44 sections', () => {
      const filePath = path.join(process.cwd(), 'Progresión', 'PROGRESION-PERSONALIZACION.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      const result = parseAreaMarkdown(content, 'personalizacion');

      expect(result.area).toBe('personalizacion');
      expect(result.totalSections).toBe(44);
      expect(result.acciones.length).toBe(11);
    });

    it('should have correct distribution of acciones by objetivo', () => {
      const filePath = path.join(process.cwd(), 'Progresión', 'PROGRESION-PERSONALIZACION.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      const result = parseAreaMarkdown(content, 'personalizacion');

      // Count acciones per objetivo
      const distribution: Record<number, number> = {};
      result.acciones.forEach(accion => {
        distribution[accion.objetivoNumber] = (distribution[accion.objetivoNumber] || 0) + 1;
      });

      // Expected: Obj1(1), Obj2(1), Obj3(1), Obj4(3), Obj5(2), Obj6(3)
      expect(distribution[1]).toBe(1);
      expect(distribution[2]).toBe(1);
      expect(distribution[3]).toBe(1);
      expect(distribution[4]).toBe(3);
      expect(distribution[5]).toBe(2);
      expect(distribution[6]).toBe(3);
    });

    it('should have exactly 4 sections per acción', () => {
      const filePath = path.join(process.cwd(), 'Progresión', 'PROGRESION-PERSONALIZACION.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      const result = parseAreaMarkdown(content, 'personalizacion');

      result.acciones.forEach(accion => {
        expect(accion.sections.length).toBe(4);

        // Verify section types
        const types = accion.sections.map(s => s.type);
        expect(types).toContain('accion');
        expect(types).toContain('cobertura');
        expect(types).toContain('frecuencia');
        expect(types).toContain('profundidad');
      });
    });
  });

  describe('PROGRESION-APRENDIZAJE.md parsing', () => {
    it('should parse Aprendizaje markdown and return 68 sections', () => {
      const filePath = path.join(process.cwd(), 'Progresión', 'PROGRESION-APRENDIZAJE.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      const result = parseAreaMarkdown(content, 'aprendizaje');

      expect(result.area).toBe('aprendizaje');
      expect(result.totalSections).toBe(68);
      expect(result.acciones.length).toBe(17);
    });

    it('should have correct distribution of acciones by objetivo', () => {
      const filePath = path.join(process.cwd(), 'Progresión', 'PROGRESION-APRENDIZAJE.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      const result = parseAreaMarkdown(content, 'aprendizaje');

      // Count acciones per objetivo
      const distribution: Record<number, number> = {};
      result.acciones.forEach(accion => {
        distribution[accion.objetivoNumber] = (distribution[accion.objetivoNumber] || 0) + 1;
      });

      // Expected: Obj1(5), Obj2(4), Obj3(2), Obj4(2), Obj5(2), Obj6(2)
      expect(distribution[1]).toBe(5);
      expect(distribution[2]).toBe(4);
      expect(distribution[3]).toBe(2);
      expect(distribution[4]).toBe(2);
      expect(distribution[5]).toBe(2);
      expect(distribution[6]).toBe(2);
    });

    it('should have exactly 4 sections per acción', () => {
      const filePath = path.join(process.cwd(), 'Progresión', 'PROGRESION-APRENDIZAJE.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      const result = parseAreaMarkdown(content, 'aprendizaje');

      result.acciones.forEach(accion => {
        expect(accion.sections.length).toBe(4);

        // Verify section types in order
        const types = accion.sections.map(s => s.type);
        expect(types).toContain('accion');
        expect(types).toContain('cobertura');
        expect(types).toContain('frecuencia');
        expect(types).toContain('profundidad');
      });
    });

    it('should handle tab indentation in level descriptors', () => {
      const filePath = path.join(process.cwd(), 'Progresión', 'PROGRESION-APRENDIZAJE.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      // Should not throw even with tab-indented content
      expect(() => parseAreaMarkdown(content, 'aprendizaje')).not.toThrow();

      const result = parseAreaMarkdown(content, 'aprendizaje');

      // Check that levels were parsed (should have cobertura/frecuencia/profundidad sections with levels)
      const dimensionSections = result.acciones.flatMap(a =>
        a.sections.filter(s => s.type !== 'accion')
      );

      // At least some dimension sections should have level options
      const sectionsWithLevels = dimensionSections.filter(s => s.levels && s.levels.length > 0);
      expect(sectionsWithLevels.length).toBeGreaterThan(0);
    });
  });

  describe('Section structure validation', () => {
    it('should have questions array for all sections', () => {
      const filePath = path.join(process.cwd(), 'Progresión', 'PROGRESION-PERSONALIZACION.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      const result = parseAreaMarkdown(content, 'personalizacion');

      result.acciones.forEach(accion => {
        accion.sections.forEach(section => {
          expect(Array.isArray(section.questions)).toBe(true);
          expect(section.questions.length).toBeGreaterThan(0);
        });
      });
    });

    it('should have level options for dimension sections (not accion)', () => {
      const filePath = path.join(process.cwd(), 'Progresión', 'PROGRESION-PERSONALIZACION.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      const result = parseAreaMarkdown(content, 'personalizacion');

      result.acciones.forEach(accion => {
        accion.sections.forEach(section => {
          if (section.type !== 'accion') {
            // Dimension sections should have levels
            expect(section.levels).toBeDefined();
            expect(Array.isArray(section.levels)).toBe(true);

            // Should have 4 levels: incipiente, en_desarrollo, avanzado, consolidado
            if (section.levels && section.levels.length > 0) {
              expect(section.levels.length).toBe(4);

              const values = section.levels.map(l => l.value);
              expect(values).toContain('incipiente');
              expect(values).toContain('en_desarrollo');
              expect(values).toContain('avanzado');
              expect(values).toContain('consolidado');
            }
          } else {
            // Accion sections should NOT have levels
            expect(section.levels).toBeUndefined();
          }
        });
      });
    });

    it('should generate valid section IDs', () => {
      const filePath = path.join(process.cwd(), 'Progresión', 'PROGRESION-PERSONALIZACION.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      const result = parseAreaMarkdown(content, 'personalizacion');

      result.acciones.forEach(accion => {
        // ID format: objetivo{N}_accion{N}
        expect(accion.id).toMatch(/^objetivo\d+_accion\d+$/);

        // Verify numbers match
        const match = accion.id.match(/^objetivo(\d+)_accion(\d+)$/);
        expect(match).not.toBeNull();

        if (match) {
          expect(parseInt(match[1])).toBe(accion.objetivoNumber);
          expect(parseInt(match[2])).toBe(accion.accionNumber);
        }
      });
    });
  });

  describe('getFlattenedSections', () => {
    it('should flatten Personalización sections correctly', () => {
      const filePath = path.join(process.cwd(), 'Progresión', 'PROGRESION-PERSONALIZACION.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      const parsed = parseAreaMarkdown(content, 'personalizacion');
      const flattened = getFlattenedSections(parsed);

      expect(flattened.length).toBe(44);

      // Check sequential indexing
      flattened.forEach((item, idx) => {
        expect(item.sectionIndex).toBe(idx);
      });

      // Check all required fields present
      flattened.forEach(item => {
        expect(item.accionId).toBeDefined();
        expect(item.objetivoNumber).toBeGreaterThan(0);
        expect(item.accionNumber).toBeGreaterThan(0);
        expect(item.objetivoTitle).toBeDefined();
        expect(item.accionDescription).toBeDefined();
        expect(item.section).toBeDefined();
      });
    });

    it('should flatten Aprendizaje sections correctly', () => {
      const filePath = path.join(process.cwd(), 'Progresión', 'PROGRESION-APRENDIZAJE.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      const parsed = parseAreaMarkdown(content, 'aprendizaje');
      const flattened = getFlattenedSections(parsed);

      expect(flattened.length).toBe(68);

      // Check sequential indexing
      flattened.forEach((item, idx) => {
        expect(item.sectionIndex).toBe(idx);
      });
    });
  });

  describe('Error handling', () => {
    it('should throw error for unknown área', () => {
      const content = 'OBJETIVO 1: Test';

      expect(() => parseAreaMarkdown(content, 'invalid-area')).toThrow(/Unknown área/);
    });

    it('should throw error if section count mismatch', () => {
      // Malformed content with only 1 acción (should be 4 sections but let's break it)
      const malformed = `
OBJETIVO 1: Test Objetivo
    ACCIÓN 1: Test Acción
        PREGUNTAS ABIERTAS:
            ¿Test?
`;

      // This should fail validation due to missing sections
      expect(() => parseAreaMarkdown(malformed, 'personalizacion')).toThrow();
    });
  });
});
