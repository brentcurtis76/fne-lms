// @vitest-environment node
/**
 * Tests for GeneraRoadmap — Gantt chart component (new schema)
 *
 * Strategy: Static source analysis.
 * The component uses inline styles and React state — no JSX rendering needed.
 * Source checks verify structural correctness of types, DEFAULT_DATA, and
 * key UI features (Gantt chart, GENERA logo, alert banner, save indicator).
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

// ── Type exports ──────────────────────────────────────────────────────────────

describe('Type exports', () => {
  it('exports RoadmapData interface', () => {
    expect(componentSrc).toContain('export interface RoadmapData');
  });

  it('exports RoadmapPhase interface', () => {
    expect(componentSrc).toContain('export interface RoadmapPhase');
  });

  it('exports RoadmapTask interface', () => {
    expect(componentSrc).toContain('export interface RoadmapTask');
  });

  it('exports RoadmapFinding interface', () => {
    expect(componentSrc).toContain('export interface RoadmapFinding');
  });

  it('exports GeneraRoadmapProps interface', () => {
    expect(componentSrc).toContain('export interface GeneraRoadmapProps');
  });
});

// ── RoadmapTask shape ─────────────────────────────────────────────────────────

describe('RoadmapTask type shape', () => {
  it('has id: string field', () => {
    const taskStart = componentSrc.indexOf('export interface RoadmapTask');
    const taskEnd = componentSrc.indexOf('}', taskStart);
    const taskBlock = componentSrc.slice(taskStart, taskEnd);
    expect(taskBlock).toContain('id: string');
  });

  it('has name: string field', () => {
    const taskStart = componentSrc.indexOf('export interface RoadmapTask');
    const taskEnd = componentSrc.indexOf('}', taskStart);
    const taskBlock = componentSrc.slice(taskStart, taskEnd);
    expect(taskBlock).toContain('name: string');
  });

  it('has s: number field (start week)', () => {
    const taskStart = componentSrc.indexOf('export interface RoadmapTask');
    const taskEnd = componentSrc.indexOf('}', taskStart);
    const taskBlock = componentSrc.slice(taskStart, taskEnd);
    expect(taskBlock).toContain('s: number');
  });

  it('has e: number field (end week)', () => {
    const taskStart = componentSrc.indexOf('export interface RoadmapTask');
    const taskEnd = componentSrc.indexOf('}', taskStart);
    const taskBlock = componentSrc.slice(taskStart, taskEnd);
    expect(taskBlock).toContain('e: number');
  });

  it('has hot: boolean field (milestone flag)', () => {
    const taskStart = componentSrc.indexOf('export interface RoadmapTask');
    const taskEnd = componentSrc.indexOf('}', taskStart);
    const taskBlock = componentSrc.slice(taskStart, taskEnd);
    expect(taskBlock).toContain('hot: boolean');
  });
});

// ── RoadmapPhase shape ────────────────────────────────────────────────────────

describe('RoadmapPhase type shape', () => {
  it('has id: string field', () => {
    const phaseStart = componentSrc.indexOf('export interface RoadmapPhase');
    const phaseEnd = componentSrc.indexOf('}', phaseStart);
    const phaseBlock = componentSrc.slice(phaseStart, phaseEnd);
    expect(phaseBlock).toContain('id: string');
  });

  it('has label: string field', () => {
    const phaseStart = componentSrc.indexOf('export interface RoadmapPhase');
    const phaseEnd = componentSrc.indexOf('}', phaseStart);
    const phaseBlock = componentSrc.slice(phaseStart, phaseEnd);
    expect(phaseBlock).toContain('label: string');
  });

  it('has color: string field', () => {
    const phaseStart = componentSrc.indexOf('export interface RoadmapPhase');
    const phaseEnd = componentSrc.indexOf('}', phaseStart);
    const phaseBlock = componentSrc.slice(phaseStart, phaseEnd);
    expect(phaseBlock).toContain('color: string');
  });

  it('has tasks: RoadmapTask[] field', () => {
    const phaseStart = componentSrc.indexOf('export interface RoadmapPhase');
    const phaseEnd = componentSrc.indexOf('}', phaseStart);
    const phaseBlock = componentSrc.slice(phaseStart, phaseEnd);
    expect(phaseBlock).toContain('tasks: RoadmapTask[]');
  });

  it('does NOT have status or progress fields (old schema gone)', () => {
    const phaseStart = componentSrc.indexOf('export interface RoadmapPhase');
    const phaseEnd = componentSrc.indexOf('}', phaseStart);
    const phaseBlock = componentSrc.slice(phaseStart, phaseEnd);
    expect(phaseBlock).not.toContain('status:');
    expect(phaseBlock).not.toContain('progress:');
  });
});

// ── RoadmapData shape ─────────────────────────────────────────────────────────

describe('RoadmapData type shape', () => {
  it('has title: string field', () => {
    const dataStart = componentSrc.indexOf('export interface RoadmapData');
    const dataEnd = componentSrc.indexOf('}', dataStart);
    const dataBlock = componentSrc.slice(dataStart, dataEnd);
    expect(dataBlock).toContain('title: string');
  });

  it('has subtitle: string field', () => {
    const dataStart = componentSrc.indexOf('export interface RoadmapData');
    const dataEnd = componentSrc.indexOf('}', dataStart);
    const dataBlock = componentSrc.slice(dataStart, dataEnd);
    expect(dataBlock).toContain('subtitle: string');
  });

  it('has alert: string field', () => {
    const dataStart = componentSrc.indexOf('export interface RoadmapData');
    const dataEnd = componentSrc.indexOf('}', dataStart);
    const dataBlock = componentSrc.slice(dataStart, dataEnd);
    expect(dataBlock).toContain('alert: string');
  });

  it('has weeks: string[] field', () => {
    const dataStart = componentSrc.indexOf('export interface RoadmapData');
    const dataEnd = componentSrc.indexOf('}', dataStart);
    const dataBlock = componentSrc.slice(dataStart, dataEnd);
    expect(dataBlock).toContain('weeks: string[]');
  });

  it('has phases: RoadmapPhase[] field', () => {
    const dataStart = componentSrc.indexOf('export interface RoadmapData');
    const dataEnd = componentSrc.indexOf('}', dataStart);
    const dataBlock = componentSrc.slice(dataStart, dataEnd);
    expect(dataBlock).toContain('phases: RoadmapPhase[]');
  });

  it('has findings: RoadmapFinding[] field', () => {
    const dataStart = componentSrc.indexOf('export interface RoadmapData');
    const dataEnd = componentSrc.indexOf('}', dataStart);
    const dataBlock = componentSrc.slice(dataStart, dataEnd);
    expect(dataBlock).toContain('findings: RoadmapFinding[]');
  });

  it('does NOT have lastUpdated field (old schema gone)', () => {
    const dataStart = componentSrc.indexOf('export interface RoadmapData');
    const dataEnd = componentSrc.indexOf('}', dataStart);
    const dataBlock = componentSrc.slice(dataStart, dataEnd);
    expect(dataBlock).not.toContain('lastUpdated');
  });
});

// ── DEFAULT_DATA structure ────────────────────────────────────────────────────

describe('DEFAULT_DATA — structure', () => {
  it('exports DEFAULT_DATA as a named const', () => {
    expect(componentSrc).toContain('export const DEFAULT_DATA: RoadmapData = {');
  });

  it('title contains GENERA', () => {
    const defaultStart = componentSrc.indexOf('export const DEFAULT_DATA: RoadmapData = {');
    // Find the title field within DEFAULT_DATA
    const titleIdx = componentSrc.indexOf('title:', defaultStart);
    const titleLine = componentSrc.slice(titleIdx, componentSrc.indexOf('\n', titleIdx));
    expect(titleLine).toContain('GENERA');
  });

  it('has subtitle field', () => {
    const defaultStart = componentSrc.indexOf('export const DEFAULT_DATA: RoadmapData = {');
    const subtitleIdx = componentSrc.indexOf('subtitle:', defaultStart);
    expect(subtitleIdx).toBeGreaterThan(defaultStart);
  });

  it('has alert field', () => {
    const defaultStart = componentSrc.indexOf('export const DEFAULT_DATA: RoadmapData = {');
    const alertIdx = componentSrc.indexOf('alert:', defaultStart);
    expect(alertIdx).toBeGreaterThan(defaultStart);
  });

  it('has 13 weeks in the weeks array', () => {
    // Count comma-separated week entries: ['Mar 4','Mar 11',...]
    const weeksMatch = componentSrc.match(/weeks:\s*\[([^\]]+)\]/);
    expect(weeksMatch).not.toBeNull();
    if (weeksMatch) {
      const entries = weeksMatch[1].split(',').filter(e => e.trim().length > 0);
      expect(entries).toHaveLength(13);
    }
  });

  it('has 7 phases (p0 through p6)', () => {
    expect(componentSrc).toContain("id:'p0'");
    expect(componentSrc).toContain("id:'p1'");
    expect(componentSrc).toContain("id:'p2'");
    expect(componentSrc).toContain("id:'p3'");
    expect(componentSrc).toContain("id:'p4'");
    expect(componentSrc).toContain("id:'p5'");
    expect(componentSrc).toContain("id:'p6'");
  });

  it('has 7 findings (f0 through f6)', () => {
    expect(componentSrc).toContain("id:'f0'");
    expect(componentSrc).toContain("id:'f1'");
    expect(componentSrc).toContain("id:'f2'");
    expect(componentSrc).toContain("id:'f3'");
    expect(componentSrc).toContain("id:'f4'");
    expect(componentSrc).toContain("id:'f5'");
    expect(componentSrc).toContain("id:'f6'");
  });

  it('phase p0 has label containing FUNDACIÓN', () => {
    const p0Start = componentSrc.indexOf("id:'p0'");
    const p0End = componentSrc.indexOf("id:'p1'");
    const p0Block = componentSrc.slice(p0Start, p0End);
    expect(p0Block).toContain('FUNDACIÓN');
  });

  it('phase p6 is PRODUCCIÓN (last phase)', () => {
    const p6Start = componentSrc.indexOf("id:'p6'");
    expect(p6Start).toBeGreaterThan(-1);
    const p6Block = componentSrc.slice(p6Start, p6Start + 100);
    expect(p6Block).toContain('PRODUCCIÓN');
  });

  it('tasks have numeric s and e fields (not string dates)', () => {
    // Sample: s:1,e:1 or s:2,e:3 — numeric, not date strings
    expect(componentSrc).toContain('s:1,e:1');
    expect(componentSrc).toContain('s:2,e:3');
    expect(componentSrc).not.toContain("startDate:");
    expect(componentSrc).not.toContain("endDate:");
  });

  it('at least one hot:true task exists (milestone)', () => {
    expect(componentSrc).toContain('hot:true');
  });

  it('does NOT include lastUpdated in DEFAULT_DATA', () => {
    expect(componentSrc).not.toContain('lastUpdated');
  });
});

// ── Gantt chart UI features ───────────────────────────────────────────────────

describe('Gantt chart UI features', () => {
  it('renders page header with title', () => {
    expect(componentSrc).toContain('{/* ── Page header ── */}');
    expect(componentSrc).toContain('data.title');
  });

  it('uses light background for platform coherence', () => {
    expect(componentSrc).toContain("bg:       '#ffffff'");
  });

  it('uses yellow accent brand color #f59e0b', () => {
    expect(componentSrc).toContain("'#f59e0b'");
  });

  it('shows week header row', () => {
    expect(componentSrc).toContain('data.weeks.map');
  });

  it('renders phase rows from data.phases', () => {
    expect(componentSrc).toContain('data.phases.map');
  });

  it('renders findings section', () => {
    expect(componentSrc).toContain('data.findings.map');
  });

  it('shows HOY label on first week column', () => {
    expect(componentSrc).toContain('HOY');
  });

  it('shows LAUNCH label on last week column', () => {
    expect(componentSrc).toContain('LAUNCH');
  });

  it('has GUARDANDO save indicator', () => {
    expect(componentSrc).toContain('GUARDANDO...');
  });

  it('has GUARDADO save success indicator', () => {
    expect(componentSrc).toContain('GUARDADO');
  });

  it('uses edit mode toggle with EDITAR label', () => {
    expect(componentSrc).toContain('EDITAR');
  });

  it('has Lógica de Secuenciación section header', () => {
    expect(componentSrc).toContain('Lógica de Secuenciación');
  });

  it('uses only React imports — no new npm dependencies', () => {
    expect(componentSrc).not.toContain("from 'lodash'");
    expect(componentSrc).not.toContain("from 'date-fns'");
    expect(componentSrc).not.toContain("from 'react-query'");
    expect(componentSrc).not.toContain("from 'recharts'");
  });

  it('does NOT use localStorage', () => {
    expect(componentSrc).not.toContain('localStorage');
    expect(componentSrc).not.toContain('sessionStorage');
  });

  it('accepts initialData and onSave props', () => {
    expect(componentSrc).toContain('initialData: RoadmapData');
    expect(componentSrc).toContain('onSave: (data: RoadmapData) => Promise<void>');
  });
});

// ── Height adjustment for MainLayout ─────────────────────────────────────────

describe('Height adjustment — MainLayout compatibility', () => {
  it('uses calc(100vh - 80px) instead of 100vh to account for the sticky header', () => {
    expect(componentSrc).toContain("calc(100vh - 80px)");
    // Should NOT use bare 100vh for the root container height
    expect(componentSrc).not.toContain("height: '100vh'");
  });

  it('bottom bar uses flexShrink layout (not fixed positioning) to avoid sidebar overlap', () => {
    // The bottom bar should be a flex child with flexShrink: 0 in a column layout
    expect(componentSrc).toContain("flexShrink: 0");
    expect(componentSrc).toContain("flexDirection: 'column'");
    // Should not have fixed with left/right spanning full viewport
    const fixedIdx = componentSrc.indexOf("position: 'fixed'");
    expect(fixedIdx).toBe(-1);
  });
});

// ── Page — auth and data patterns ────────────────────────────────────────────

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

  it('uses DEFAULT_DATA as fallback', () => {
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

  it('does NOT inject lastUpdated into save payload (new schema has no such field)', () => {
    expect(pageSrc).not.toContain('lastUpdated');
  });

  it('passes updated_by user id on upsert', () => {
    expect(pageSrc).toContain('updated_by: user.id');
  });

  it('checks router.isReady before auth init', () => {
    expect(pageSrc).toContain('router.isReady');
  });

  it('has stale data guard that checks for weeks array', () => {
    // Must check Array.isArray on the weeks field before using DB data
    expect(pageSrc).toContain('Array.isArray');
    expect(pageSrc).toContain('weeks');
  });

  it('does NOT have wrapper div with max-w-7xl class (removed per spec)', () => {
    expect(pageSrc).not.toContain('max-w-7xl');
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

  it('is adminOnly: true', () => {
    const roadmapEntryStart = sidebarSrc.indexOf("id: 'roadmap'");
    const nextEntryStart = sidebarSrc.indexOf("id: 'users'", roadmapEntryStart);
    const roadmapBlock = sidebarSrc.slice(roadmapEntryStart, nextEntryStart);
    expect(roadmapBlock).toContain('adminOnly: true');
  });
});
