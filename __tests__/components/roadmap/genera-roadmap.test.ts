// @vitest-environment node
/**
 * Tests for ROADMAP-001 — GeneraRoadmap component, roadmap page, and sidebar
 *
 * Strategy: Static source analysis (matching the pattern in ux-iteration1.test.ts).
 * Components require Next.js context, Supabase providers, and React rendering
 * infrastructure that are out of scope here. Source-level checks verify that
 * all required behavior is present in the implementation.
 *
 * Additionally, the DEFAULT_DATA object is evaluated by parsing the source
 * (not importing the module) to avoid JSX/React context requirements.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

const componentSrc = readSource('components/admin/GeneraRoadmap.tsx');
const pageSrc = readSource('pages/admin/roadmap.tsx');
const sidebarSrc = readSource('components/layout/Sidebar.tsx');

// ── DEFAULT_DATA structure (verified by source analysis) ──────────────────────

describe('DEFAULT_DATA — source structure', () => {
  it('exports DEFAULT_DATA as a named const', () => {
    expect(componentSrc).toContain('export const DEFAULT_DATA: RoadmapData = {');
  });

  it('includes all 4 phases', () => {
    expect(componentSrc).toContain("id: 'phase-1'");
    expect(componentSrc).toContain("id: 'phase-2'");
    expect(componentSrc).toContain("id: 'phase-3'");
    expect(componentSrc).toContain("id: 'phase-4'");
  });

  it('phase-1 is completed at 100%', () => {
    const phase1Start = componentSrc.indexOf("id: 'phase-1'");
    const phase2Start = componentSrc.indexOf("id: 'phase-2'");
    const phase1Block = componentSrc.slice(phase1Start, phase2Start);
    expect(phase1Block).toContain("status: 'completed'");
    expect(phase1Block).toContain('progress: 100');
  });

  it('phase-3 is in-progress', () => {
    const phase3Start = componentSrc.indexOf("id: 'phase-3'");
    const phase4Start = componentSrc.indexOf("id: 'phase-4'");
    const phase3Block = componentSrc.slice(phase3Start, phase4Start);
    expect(phase3Block).toContain("status: 'in-progress'");
  });

  it('phase-4 is planned', () => {
    const phase4Start = componentSrc.indexOf("id: 'phase-4'");
    const phase4End = componentSrc.indexOf('];', phase4Start);
    const phase4Block = componentSrc.slice(phase4Start, phase4End);
    expect(phase4Block).toContain("status: 'planned'");
  });

  it('each phase has task entries', () => {
    expect(componentSrc).toContain("id: 't1-1'");
    expect(componentSrc).toContain("id: 't2-1'");
    expect(componentSrc).toContain("id: 't3-1'");
    expect(componentSrc).toContain("id: 't4-1'");
  });

  it('title matches spec', () => {
    expect(componentSrc).toContain('GENERA MVP — Roadmap de Desarrollo');
  });
});

// ── Component source checks ────────────────────────────────────────────────────

describe('GeneraRoadmap component — behavior', () => {
  it('does NOT use localStorage', () => {
    expect(componentSrc).not.toContain('localStorage');
    expect(componentSrc).not.toContain('window.storage');
    expect(componentSrc).not.toContain('sessionStorage');
  });

  it('exports RoadmapData interface', () => {
    expect(componentSrc).toContain('export interface RoadmapData');
  });

  it('exports RoadmapPhase interface', () => {
    expect(componentSrc).toContain('export interface RoadmapPhase');
  });

  it('exports RoadmapTask interface', () => {
    expect(componentSrc).toContain('export interface RoadmapTask');
  });

  it('shows GUARDANDO text for pending save', () => {
    expect(componentSrc).toContain('GUARDANDO');
  });

  it('shows GUARDADO text on save success', () => {
    expect(componentSrc).toContain('GUARDADO');
  });

  it('uses brand primary color #0a0a0a', () => {
    expect(componentSrc).toContain('#0a0a0a');
  });

  it('uses brand accent color #fbbf24', () => {
    expect(componentSrc).toContain('#fbbf24');
  });

  it('uses completed status color #22c55e', () => {
    expect(componentSrc).toContain('#22c55e');
  });

  it('uses blocked status color #ef4444', () => {
    expect(componentSrc).toContain('#ef4444');
  });

  it('uses planned status color #9ca3af', () => {
    expect(componentSrc).toContain('#9ca3af');
  });

  it('implements debounce with setTimeout/clearTimeout', () => {
    expect(componentSrc).toContain('setTimeout');
    expect(componentSrc).toContain('clearTimeout');
  });

  it('uses debounce delay of 300-500ms (400ms)', () => {
    // Spec says 300-500ms; implementation uses 400ms
    expect(componentSrc).toContain('400');
  });

  it('calls onSave prop to persist data', () => {
    expect(componentSrc).toContain('onSave');
  });

  it('has edit mode toggle with Spanish text', () => {
    expect(componentSrc).toContain('editMode');
    expect(componentSrc).toContain('Editar roadmap');
    expect(componentSrc).toContain('Finalizar edición');
  });

  it('has all major UI text in Spanish', () => {
    expect(componentSrc).toContain('Progreso general');
    expect(componentSrc).toContain('Agregar tarea');
    expect(componentSrc).toContain('Agregar fase');
    expect(componentSrc).toContain('Completado');
    expect(componentSrc).toContain('En progreso');
    expect(componentSrc).toContain('Planificado');
    expect(componentSrc).toContain('Bloqueado');
  });

  it('accepts initialData and onSave props', () => {
    expect(componentSrc).toContain('initialData: RoadmapData');
    expect(componentSrc).toContain('onSave: (data: RoadmapData) => Promise<void>');
  });

  it('uses inline styles (no Tailwind CSS classes)', () => {
    // The component uses inline styles throughout (per spec)
    expect(componentSrc).toContain('style={{');
    // Should not use className for brand styling
    expect(componentSrc).not.toContain('className="text-brand_primary"');
  });

  it('adds/removes tasks in edit mode', () => {
    expect(componentSrc).toContain('addTask');
    expect(componentSrc).toContain('removeTask');
  });

  it('adds/removes phases in edit mode', () => {
    expect(componentSrc).toContain('addPhase');
    expect(componentSrc).toContain('removePhase');
  });

  it('does NOT import any new npm dependencies', () => {
    // Check that there are no import statements that would add new deps
    // (only standard React hooks and no external libraries)
    expect(componentSrc).not.toContain("from 'lodash'");
    expect(componentSrc).not.toContain("from 'date-fns'");
    expect(componentSrc).not.toContain("from 'react-query'");
  });

  it('flushes save on unmount', () => {
    // Checks that the unmount cleanup fires a save if debounce pending
    expect(componentSrc).toContain('dataRef.current');
    expect(componentSrc).toContain('onSaveRef.current');
  });
});

// ── Page source checks ─────────────────────────────────────────────────────────

describe('Roadmap page — auth and data', () => {
  it('imports getUserPrimaryRole from roleUtils', () => {
    expect(pageSrc).toContain('getUserPrimaryRole');
    expect(pageSrc).toContain('roleUtils');
  });

  it('uses useSupabaseClient hook', () => {
    expect(pageSrc).toContain('useSupabaseClient');
  });

  it('redirects to /login if no session', () => {
    expect(pageSrc).toContain("router.push('/login')");
  });

  it('redirects to /dashboard if not admin', () => {
    expect(pageSrc).toContain("router.push('/dashboard')");
  });

  it("checks role === 'admin' for gate", () => {
    expect(pageSrc).toContain("userRole === 'admin'");
  });

  it('queries roadmap_data table', () => {
    expect(pageSrc).toContain('roadmap_data');
  });

  it("uses key 'genera-roadmap-v1'", () => {
    expect(pageSrc).toContain("'genera-roadmap-v1'");
  });

  it("uses upsert with onConflict: 'key'", () => {
    expect(pageSrc).toContain("onConflict: 'key'");
  });

  it('shows Cargando... loading state in Spanish', () => {
    expect(pageSrc).toContain('Cargando...');
  });

  it('uses MainLayout wrapper', () => {
    expect(pageSrc).toContain('MainLayout');
  });

  it('passes currentPage="roadmap" to MainLayout', () => {
    expect(pageSrc).toContain('currentPage="roadmap"');
  });

  it('renders GeneraRoadmap component', () => {
    expect(pageSrc).toContain('GeneraRoadmap');
  });

  it('seeds DEFAULT_DATA when no row exists', () => {
    expect(pageSrc).toContain('DEFAULT_DATA');
  });

  it('does NOT use API routes for roadmap data', () => {
    expect(pageSrc).not.toContain("fetch('/api/roadmap");
    expect(pageSrc).not.toContain('fetch(`/api/roadmap');
  });

  it('does NOT use localStorage', () => {
    expect(pageSrc).not.toContain('localStorage');
  });

  it('handles save error by throwing (for save indicator)', () => {
    expect(pageSrc).toContain('throw error');
  });

  it('updates lastUpdated on each save', () => {
    expect(pageSrc).toContain('lastUpdated: new Date().toISOString()');
  });

  it('passes updated_by user id on upsert', () => {
    expect(pageSrc).toContain('updated_by: user.id');
  });

  it('checks router.isReady before auth init', () => {
    expect(pageSrc).toContain('router.isReady');
  });
});

// ── UX iteration 1 fixes — accessibility and interaction ─────────────────────

describe('UX fixes — iteration 1', () => {
  it('[A-1] does NOT use outline: none in inputStyle constant', () => {
    // The old shared inputStyle const had outline: 'none' — removed in UX fix
    expect(componentSrc).not.toContain("outline: 'none'");
  });

  it('[A-1] uses getInputStyle function with conditional boxShadow focus ring', () => {
    expect(componentSrc).toContain('function getInputStyle(focused: boolean)');
    expect(componentSrc).toContain("boxShadow: focused ? '0 0 0 2px #fbbf24'");
  });

  it('[A-1] inputs call onFocus/onBlur to manage focus state', () => {
    expect(componentSrc).toContain('onFocus={() => setFocusedInput(');
    expect(componentSrc).toContain('onBlur={() => setFocusedInput(null)');
  });

  it('[A-2] save indicator wrapped in persistent aria-live region', () => {
    expect(componentSrc).toContain('role="status"');
    expect(componentSrc).toContain('aria-live="polite"');
    expect(componentSrc).toContain('aria-atomic="true"');
  });

  it('[A-3] remove phase button has aria-label with phase name', () => {
    expect(componentSrc).toContain('aria-label={`Eliminar fase: ${phase.name}`}');
  });

  it('[A-3] remove task button has aria-label with task name', () => {
    expect(componentSrc).toContain('aria-label={`Eliminar tarea: ${task.name}`}');
  });

  it('[ID-1] remove phase calls window.confirm before onRemovePhase', () => {
    expect(componentSrc).toContain('window.confirm(');
    expect(componentSrc).toContain('Esta acción no se puede deshacer');
    // Confirm must wrap the onRemovePhase call
    const confirmIdx = componentSrc.indexOf('window.confirm(');
    const removePhaseIdx = componentSrc.indexOf('onRemovePhase(phase.id)', confirmIdx);
    expect(confirmIdx).toBeGreaterThan(-1);
    expect(removePhaseIdx).toBeGreaterThan(confirmIdx);
  });

  it('[BC-1] edit toggle button has onMouseEnter/onMouseLeave handlers', () => {
    expect(componentSrc).toContain("onMouseEnter={() => setHoveredBtn('edit')}");
    expect(componentSrc).toContain("onMouseLeave={() => setHoveredBtn(null)}");
  });

  it('[BC-1] remove phase button has onMouseEnter/onMouseLeave handlers', () => {
    expect(componentSrc).toContain("onMouseEnter={() => setHoveredBtn('remove-phase')}");
  });

  it('[BC-1] remove task button has onMouseEnter/onMouseLeave handlers', () => {
    expect(componentSrc).toContain('onMouseEnter={() => setRemoveHovered(true)}');
    expect(componentSrc).toContain('onMouseLeave={() => setRemoveHovered(false)}');
  });

  it('[BC-1] add phase and add task buttons have hover state via extracted sub-components', () => {
    expect(componentSrc).toContain('AddPhaseButton');
    expect(componentSrc).toContain('AddTaskButton');
  });

  it('[BC-3] no fontSize of 11px remains in the source', () => {
    // All 11px font sizes should be bumped to 12px
    expect(componentSrc).not.toContain("fontSize: '11px'");
  });

  it('[A-4] overall progress bar has role="progressbar" and aria attributes', () => {
    const progressbarIdx = componentSrc.indexOf('aria-label={`Progreso general del roadmap');
    expect(progressbarIdx).toBeGreaterThan(-1);
    // Verify it has all needed aria attributes
    const block = componentSrc.slice(progressbarIdx - 200, progressbarIdx + 200);
    expect(block).toContain('role="progressbar"');
    expect(block).toContain('aria-valuemin={0}');
    expect(block).toContain('aria-valuemax={100}');
  });

  it('[A-4] per-phase progress bar has role="progressbar" and aria attributes', () => {
    expect(componentSrc).toContain('aria-label={`Progreso de ${phase.name}: ${phase.progress}%`}');
  });

  it('[A-5] progress number input has aria-label', () => {
    expect(componentSrc).toContain('aria-label={`Progreso de ${phase.name} (porcentaje)`}');
  });

  it('[A-5] range slider has aria-label', () => {
    expect(componentSrc).toContain('aria-label={`Ajustar progreso de ${phase.name}`}');
  });
});

// ── Sidebar navigation entry ───────────────────────────────────────────────────

describe('Sidebar — roadmap navigation entry', () => {
  it("includes roadmap entry with id: 'roadmap'", () => {
    expect(sidebarSrc).toContain("id: 'roadmap'");
  });

  it("has label: 'Roadmap MVP'", () => {
    expect(sidebarSrc).toContain("label: 'Roadmap MVP'");
  });

  it("has href: '/admin/roadmap'", () => {
    expect(sidebarSrc).toContain("href: '/admin/roadmap'");
  });

  it('uses ChartBarIcon', () => {
    // icon is ChartBarIcon (already imported in Sidebar.tsx)
    const roadmapEntryStart = sidebarSrc.indexOf("id: 'roadmap'");
    const nextEntryStart = sidebarSrc.indexOf("id: 'users'", roadmapEntryStart);
    const roadmapBlock = sidebarSrc.slice(roadmapEntryStart, nextEntryStart);
    expect(roadmapBlock).toContain('ChartBarIcon');
  });

  it('is adminOnly: true', () => {
    const roadmapEntryStart = sidebarSrc.indexOf("id: 'roadmap'");
    const nextEntryStart = sidebarSrc.indexOf("id: 'users'", roadmapEntryStart);
    const roadmapBlock = sidebarSrc.slice(roadmapEntryStart, nextEntryStart);
    expect(roadmapBlock).toContain('adminOnly: true');
  });

  it("has Spanish description 'Progreso del desarrollo GENERA'", () => {
    expect(sidebarSrc).toContain("description: 'Progreso del desarrollo GENERA'");
  });

  it('appears between assignment-matrix and users entries', () => {
    const matrixPos = sidebarSrc.indexOf("id: 'assignment-matrix'");
    const roadmapPos = sidebarSrc.indexOf("id: 'roadmap'");
    const usersPos = sidebarSrc.indexOf("id: 'users'");
    expect(matrixPos).toBeGreaterThan(-1);
    expect(roadmapPos).toBeGreaterThan(-1);
    expect(usersPos).toBeGreaterThan(-1);
    expect(roadmapPos).toBeGreaterThan(matrixPos);
    expect(roadmapPos).toBeLessThan(usersPos);
  });

  it('is a top-level nav item (not nested in children)', () => {
    // Verify that 'roadmap' id appears as a top-level NAVIGATION_ITEMS entry
    // i.e., not inside a 'children' array of another item
    const roadmapIdx = sidebarSrc.indexOf("id: 'roadmap'");
    // Find the nearest preceding 'children: ['
    const childrenBeforeRoadmap = sidebarSrc.lastIndexOf('children: [', roadmapIdx);
    const closingBracketBeforeRoadmap = sidebarSrc.lastIndexOf(']', roadmapIdx);
    // If children: [ was found before roadmap, the closing ] must also be before roadmap
    // (meaning the children array was already closed by the time roadmap entry appears)
    if (childrenBeforeRoadmap !== -1) {
      expect(closingBracketBeforeRoadmap).toBeGreaterThan(childrenBeforeRoadmap);
    }
  });
});
