/**
 * Full Evoluciona proposal generator using seed data.
 * Run with: npx tsx lib/propuestas/scripts/generate-full.ts
 * Output: lib/propuestas/__tests__/full-evoluciona-output.pdf
 */
import path from 'path';
import fs from 'fs';
import { generateProposal } from '../generator';
import type { ProposalConfig } from '../generator';
import { BLOQUES_SEED } from '../seeds/contenido-bloques';
import { CONSULTORES_SEED } from '../seeds/consultores';
import '../fonts';

async function main() {
  console.log('Building full Evoluciona proposal PDF...');

  // Evoluciona content blocks (universal + evoluciona-specific, exclude Preparación-only)
  const evolBlocks = BLOQUES_SEED.filter(
    (b) => b.programa_tipo === null || b.programa_tipo === 'evoluciona'
  );

  const config: ProposalConfig = {
    type: 'evoluciona',
    schoolName: 'Liceo Bicentenario William Taylor',
    programYear: 2026,
    serviceName:
      'Asesoría Integral para Desarrollar una Cultura de Innovación Educativa Centrada en el Aprendizaje',

    consultants: CONSULTORES_SEED.map((c) => ({
      nombre: c.nombre,
      titulo: c.titulo,
      bio: c.perfil_profesional ?? '',
    })),

    modules: [
      {
        nombre: 'Módulo 1 — Diagnóstico y Fundamentos Relacionales',
        horas_presenciales: 16,
        horas_sincronicas: 8,
        horas_asincronicas: 8,
        mes: 3,
      },
      {
        nombre: 'Módulo 2 — Liderazgo Relacional y Distribuido',
        horas_presenciales: 12,
        horas_sincronicas: 8,
        horas_asincronicas: 4,
        mes: 4,
      },
      {
        nombre: 'Módulo 3 — Generación Tractor',
        horas_presenciales: 12,
        horas_sincronicas: 8,
        horas_asincronicas: 4,
        mes: 5,
      },
      {
        nombre: 'Módulo 4 — Proyecto Innova',
        horas_presenciales: 8,
        horas_sincronicas: 4,
        horas_asincronicas: 0,
        mes: 6,
      },
      {
        nombre: 'Módulo 5 — Comunidades de Crecimiento',
        horas_presenciales: 12,
        horas_sincronicas: 8,
        horas_asincronicas: 4,
        mes: 7,
      },
      {
        nombre: 'Módulo 6 — Estadía INSPIRA',
        horas_presenciales: 16,
        horas_sincronicas: 4,
        horas_asincronicas: 4,
        mes: 8,
      },
      {
        nombre: 'Módulo 7 — Plataforma de Crecimiento y Cierre',
        horas_presenciales: 4,
        horas_sincronicas: 4,
        horas_asincronicas: 0,
        mes: 10,
      },
    ],

    horasPresenciales: 80,
    horasSincronicas: 44,
    horasAsincronicas: 24,

    pricing: {
      mode: 'per_hour',
      precioUf: 1.2,
      totalHours: 148,
      formaPago: '3 cuotas iguales',
    },

    contentBlocks: evolBlocks.map((b) => ({
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
    'lib/propuestas/__tests__/full-evoluciona-output.pdf'
  );

  fs.writeFileSync(outPath, buffer);
  console.log(
    `✓ PDF written to ${outPath} (${(buffer.length / 1024).toFixed(1)} KB, ` +
      `${evolBlocks.length} content blocks, ${config.modules.length} modules)`
  );
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
