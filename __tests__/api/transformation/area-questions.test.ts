/**
 * Integration tests for área-specific questions API endpoint
 * Tests /api/transformation/area-questions with both Personalización and Aprendizaje
 */

import { describe, it, expect } from 'vitest';

const API_BASE = 'http://localhost:3001';

describe('GET /api/transformation/area-questions', () => {
  describe('Personalización área', () => {
    it('should return 44 sections for personalizacion', async () => {
      const response = await fetch(`${API_BASE}/api/transformation/area-questions?area=personalizacion`);

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data.area).toBe('personalizacion');
      expect(data.totalSections).toBe(44);
      expect(data.acciones).toBeDefined();
      expect(data.acciones.length).toBe(11);
      expect(data.flattened).toBeDefined();
      expect(data.flattened.length).toBe(44);
    });

    it('should have correct structure for each section', async () => {
      const response = await fetch(`${API_BASE}/api/transformation/area-questions?area=personalizacion`);
      const data = await response.json();

      // Check first section structure
      const firstSection = data.flattened[0];
      expect(firstSection).toHaveProperty('sectionIndex');
      expect(firstSection).toHaveProperty('accionId');
      expect(firstSection).toHaveProperty('objetivoNumber');
      expect(firstSection).toHaveProperty('accionNumber');
      expect(firstSection).toHaveProperty('objetivoTitle');
      expect(firstSection).toHaveProperty('accionDescription');
      expect(firstSection).toHaveProperty('section');
      expect(firstSection.section).toHaveProperty('type');
      expect(firstSection.section).toHaveProperty('questions');
    });
  });

  describe('Aprendizaje área', () => {
    it('should return 68 sections for aprendizaje', async () => {
      const response = await fetch(`${API_BASE}/api/transformation/area-questions?area=aprendizaje`);

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data.area).toBe('aprendizaje');
      expect(data.totalSections).toBe(68);
      expect(data.acciones).toBeDefined();
      expect(data.acciones.length).toBe(17);
      expect(data.flattened).toBeDefined();
      expect(data.flattened.length).toBe(68);
    });

    it('should have 6 objetivos with correct distribution', async () => {
      const response = await fetch(`${API_BASE}/api/transformation/area-questions?area=aprendizaje`);
      const data = await response.json();

      // Count acciones per objetivo
      const distribution: Record<number, number> = {};
      data.acciones.forEach((accion: any) => {
        distribution[accion.objetivoNumber] = (distribution[accion.objetivoNumber] || 0) + 1;
      });

      expect(distribution[1]).toBe(5);
      expect(distribution[2]).toBe(4);
      expect(distribution[3]).toBe(2);
      expect(distribution[4]).toBe(2);
      expect(distribution[5]).toBe(2);
      expect(distribution[6]).toBe(2);
    });
  });

  describe('Error handling', () => {
    it('should return 400 for invalid área', async () => {
      const response = await fetch(`${API_BASE}/api/transformation/area-questions?area=invalid`);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.validAreas).toBeDefined();
      expect(data.validAreas).toContain('personalizacion');
      expect(data.validAreas).toContain('aprendizaje');
    });

    it('should return 400 when area parameter is missing', async () => {
      const response = await fetch(`${API_BASE}/api/transformation/area-questions`);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('should return 405 for non-GET methods', async () => {
      const response = await fetch(`${API_BASE}/api/transformation/area-questions?area=personalizacion`, {
        method: 'POST',
      });

      expect(response.status).toBe(405);

      const data = await response.json();
      expect(data.error).toMatch(/no permitido/i);
    });
  });

  describe('Data consistency', () => {
    it('should have exactly 4 sections per acción (Personalización)', async () => {
      const response = await fetch(`${API_BASE}/api/transformation/area-questions?area=personalizacion`);
      const data = await response.json();

      data.acciones.forEach((accion: any) => {
        expect(accion.sections.length).toBe(4);

        const types = accion.sections.map((s: any) => s.type);
        expect(types).toContain('accion');
        expect(types).toContain('cobertura');
        expect(types).toContain('frecuencia');
        expect(types).toContain('profundidad');
      });
    });

    it('should have exactly 4 sections per acción (Aprendizaje)', async () => {
      const response = await fetch(`${API_BASE}/api/transformation/area-questions?area=aprendizaje`);
      const data = await response.json();

      data.acciones.forEach((accion: any) => {
        expect(accion.sections.length).toBe(4);

        const types = accion.sections.map((s: any) => s.type);
        expect(types).toContain('accion');
        expect(types).toContain('cobertura');
        expect(types).toContain('frecuencia');
        expect(types).toContain('profundidad');
      });
    });
  });
});
