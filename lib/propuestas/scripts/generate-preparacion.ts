/**
 * Full Preparación proposal generator using seed data.
 * Run with: npx tsx lib/propuestas/scripts/generate-preparacion.ts
 * Output: lib/propuestas/__tests__/full-preparacion-output.pdf
 *
 * Preparación is an 88h program (no platform) with 6 methodology blocks.
 */
import path from 'path';
import fs from 'fs';
import { generateProposal } from '../generator';
import type { ProposalConfig } from '../generator';
import { BLOQUES_SEED } from '../seeds/contenido-bloques';
import { CONSULTORES_SEED } from '../seeds/consultores';
import '../fonts';

async function main() {
  console.log('Building full Preparación proposal PDF...');

  // Preparación uses universal blocks only (programa_tipo === null)
  // excludes evoluciona-specific blocks
  const prepBlocks = BLOQUES_SEED.filter((b) => b.programa_tipo === null);

  const config: ProposalConfig = {
    type: 'preparacion',
    schoolName: 'Escuela Básica Municipal de Llolleo',
    programYear: 2026,
    serviceName:
      'Asesoría de Preparación para la Mejora Educativa — Programa GENERA',

    consultants: CONSULTORES_SEED.map((c) => ({
      nombre: c.nombre,
      titulo: c.titulo,
      bio: c.perfil_profesional ?? '',
    })),

    modules: [
      {
        nombre: 'Módulo 1 — Diagnóstico Institucional y Relacional',
        horas_presenciales: 12,
        horas_sincronicas: 8,
        horas_asincronicas: 4,
        mes: 3,
      },
      {
        nombre: 'Módulo 2 — Fundamentos del Liderazgo Educativo',
        horas_presenciales: 10,
        horas_sincronicas: 6,
        horas_asincronicas: 4,
        mes: 4,
      },
      {
        nombre: 'Módulo 3 — Comunidad Profesional de Aprendizaje',
        horas_presenciales: 10,
        horas_sincronicas: 6,
        horas_asincronicas: 4,
        mes: 5,
      },
      {
        nombre: 'Módulo 4 — Gestión del Aula Relacional',
        horas_presenciales: 10,
        horas_sincronicas: 6,
        horas_asincronicas: 4,
        mes: 7,
      },
      {
        nombre: 'Módulo 5 — Plan de Mejora y Sostenibilidad',
        horas_presenciales: 6,
        horas_sincronicas: 4,
        horas_asincronicas: 2,
        mes: 9,
      },
      {
        nombre: 'Módulo 6 — Cierre y Evaluación',
        horas_presenciales: 4,
        horas_sincronicas: 2,
        horas_asincronicas: 2,
        mes: 11,
      },
    ],

    horasPresenciales: 52,
    horasSincronicas: 32,
    horasAsincronicas: 20,

    pricing: {
      mode: 'per_hour',
      precioUf: 1.0,
      totalHours: 88,
      formaPago: '2 cuotas iguales',
    },

    contentBlocks: prepBlocks.map((b) => ({
      key: b.clave,
      titulo: b.titulo,
      contenido: b.contenido as ProposalConfig['contentBlocks'][number]['contenido'],
      imagenes: b.imagenes ?? null,
    })),

    startMonth: 3,
    duration: 10,
  };

  const buffer = await generateProposal(config);

  const outPath = path.join(
    process.cwd(),
    'lib/propuestas/__tests__/full-preparacion-output.pdf'
  );

  fs.writeFileSync(outPath, buffer);
  console.log(
    `✓ PDF written to ${outPath} (${(buffer.length / 1024).toFixed(1)} KB, ` +
      `${prepBlocks.length} content blocks, ${config.modules.length} modules)`
  );
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
