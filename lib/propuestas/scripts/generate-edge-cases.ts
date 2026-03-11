/**
 * Edge-case proposal PDF generator.
 * Run with: npx tsx lib/propuestas/scripts/generate-edge-cases.ts
 * Output: lib/propuestas/__tests__/edge-cases-output.pdf
 *
 * Covers:
 *   1. 1 consultant only (minimum)
 *   2. 6 consultants (maximum — should paginate across 2 pages)
 *   3. Fixed UF pricing mode (not per-hour)
 *   4. Very long school name (text wrapping)
 *   5. Missing school logo (graceful fallback)
 *
 * Each case is rendered as a standalone PDF then concatenated into one file
 * for side-by-side visual review.
 */
import path from 'path';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { generateProposal } from '../generator';
import type { ProposalConfig } from '../generator';
import { BLOQUES_SEED } from '../seeds/contenido-bloques';
import { CONSULTORES_SEED } from '../seeds/consultores';
import '../fonts';

// ── Shared helpers ─────────────────────────────────────────────────────────

const universalBlocks = BLOQUES_SEED.filter((b) => b.programa_tipo === null).map((b) => ({
  key: b.clave,
  titulo: b.titulo,
  contenido: b.contenido as ProposalConfig['contentBlocks'][number]['contenido'],
  imagenes: b.imagenes ?? null,
}));

const BASE_MODULES: ProposalConfig['modules'] = [
  { nombre: 'Módulo 1', horas_presenciales: 12, horas_sincronicas: 6, horas_asincronicas: 4, mes: 3 },
  { nombre: 'Módulo 2', horas_presenciales: 10, horas_sincronicas: 6, horas_asincronicas: 4, mes: 5 },
];

function makeConsultor(i: number): ProposalConfig['consultants'][number] {
  return {
    nombre: `Consultor ${i + 1} — Apellido Largo del Consultor`,
    titulo: `Especialista en Área ${i + 1}`,
    bio: `Perfil profesional del consultor número ${i + 1}. Doctor en ciencias educativas con vasta experiencia en transformación organizacional y liderazgo educativo en Chile y el extranjero.`,
  };
}

// ── Case 1: 1 consultant only ──────────────────────────────────────────────

const case1Config: ProposalConfig = {
  type: 'preparacion',
  schoolName: 'Colegio San Martín',
  programYear: 2026,
  serviceName: 'Programa de Preparación — Caso 1 Consultor',
  consultants: [CONSULTORES_SEED[0]].map((c) => ({
    nombre: c.nombre,
    titulo: c.titulo,
    bio: c.perfil_profesional ?? '',
  })),
  modules: BASE_MODULES,
  horasPresenciales: 22,
  horasSincronicas: 12,
  horasAsincronicas: 8,
  pricing: { mode: 'per_hour', precioUf: 1.2, totalHours: 42, formaPago: '2 cuotas' },
  contentBlocks: universalBlocks,
  startMonth: 3,
  duration: 10,
};

// ── Case 2: 6 consultants ──────────────────────────────────────────────────

const case2Config: ProposalConfig = {
  type: 'evoluciona',
  schoolName: 'Liceo Polivalente Municipal',
  programYear: 2026,
  serviceName: 'Programa Evoluciona — Caso 6 Consultores',
  consultants: Array.from({ length: 6 }, (_, i) => makeConsultor(i)),
  modules: BASE_MODULES,
  horasPresenciales: 22,
  horasSincronicas: 12,
  horasAsincronicas: 8,
  pricing: { mode: 'per_hour', precioUf: 1.2, totalHours: 42, formaPago: '3 cuotas iguales' },
  contentBlocks: universalBlocks,
  startMonth: 3,
  duration: 10,
};

// ── Case 3: Fixed UF pricing ───────────────────────────────────────────────

const case3Config: ProposalConfig = {
  type: 'evoluciona',
  schoolName: 'Colegio Bicentenario Norte',
  programYear: 2026,
  serviceName: 'Programa Evoluciona — Precio Fijo',
  consultants: CONSULTORES_SEED.slice(0, 2).map((c) => ({
    nombre: c.nombre,
    titulo: c.titulo,
    bio: c.perfil_profesional ?? '',
  })),
  modules: BASE_MODULES,
  horasPresenciales: 22,
  horasSincronicas: 12,
  horasAsincronicas: 8,
  pricing: {
    mode: 'fixed',
    precioUf: 0,
    totalHours: 42,
    formaPago: 'Pago único al inicio',
    fixedUf: 85,
  },
  contentBlocks: universalBlocks,
  startMonth: 3,
  duration: 10,
};

// ── Case 4: Very long school name ──────────────────────────────────────────

const case4Config: ProposalConfig = {
  type: 'preparacion',
  schoolName:
    'Liceo Técnico Profesional Polivalente Bicentenario de Excelencia Académica San Francisco de Asís de la Patagonia Norte',
  programYear: 2026,
  serviceName: 'Programa de Preparación — Nombre de Establecimiento Largo',
  consultants: CONSULTORES_SEED.slice(0, 2).map((c) => ({
    nombre: c.nombre,
    titulo: c.titulo,
    bio: c.perfil_profesional ?? '',
  })),
  modules: BASE_MODULES,
  horasPresenciales: 22,
  horasSincronicas: 12,
  horasAsincronicas: 8,
  pricing: { mode: 'per_hour', precioUf: 1.1, totalHours: 42, formaPago: '2 cuotas iguales' },
  contentBlocks: universalBlocks,
  startMonth: 3,
  duration: 10,
};

// ── Case 5: Missing school logo (no schoolLogoPath) ────────────────────────

const case5Config: ProposalConfig = {
  type: 'evoluciona',
  schoolName: 'Escuela Sin Logo',
  // schoolLogoPath intentionally omitted
  programYear: 2026,
  serviceName: 'Programa Evoluciona — Sin Logo de Escuela',
  consultants: CONSULTORES_SEED.slice(0, 2).map((c) => ({
    nombre: c.nombre,
    titulo: c.titulo,
    bio: c.perfil_profesional ?? '',
  })),
  modules: BASE_MODULES,
  horasPresenciales: 22,
  horasSincronicas: 12,
  horasAsincronicas: 8,
  pricing: { mode: 'per_hour', precioUf: 1.2, totalHours: 42, formaPago: '3 cuotas iguales' },
  contentBlocks: universalBlocks,
  startMonth: 3,
  duration: 10,
};

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Building edge-case PDFs...');

  const cases: Array<{ label: string; config: ProposalConfig }> = [
    { label: '1-consultant', config: case1Config },
    { label: '6-consultants', config: case2Config },
    { label: 'fixed-uf-pricing', config: case3Config },
    { label: 'long-school-name', config: case4Config },
    { label: 'missing-logo', config: case5Config },
  ];

  const merged = await PDFDocument.create();

  for (const { label, config } of cases) {
    process.stdout.write(`  Generating ${label}...`);
    const buf = await generateProposal(config);
    const doc = await PDFDocument.load(buf);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
    console.log(` ${doc.getPageCount()} pages, ${(buf.length / 1024).toFixed(0)} KB`);
  }

  const outBuf = Buffer.from(await merged.save());
  const outPath = path.join(
    process.cwd(),
    'lib/propuestas/__tests__/edge-cases-output.pdf'
  );
  fs.writeFileSync(outPath, outBuf);
  console.log(
    `\n✓ Merged edge-cases PDF written to ${outPath} ` +
      `(${merged.getPageCount()} total pages, ${(outBuf.length / 1024).toFixed(1)} KB)`
  );
}

main().catch((err) => {
  console.error('Edge-case generation failed:', err);
  process.exit(1);
});
