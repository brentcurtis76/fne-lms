/**
 * Seed script for propuesta_* tables.
 * Run: npx tsx lib/propuestas/scripts/seed-db.ts
 *
 * Uses the service role key to bypass RLS.
 * Idempotent — safe to run multiple times.
 */
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// --- Import seed data (relative paths — tsx doesn't resolve @/ aliases) ---
import { FICHAS_SEED } from '../seeds/fichas-servicio';
import { CONSULTORES_SEED } from '../seeds/consultores';
import { DOCUMENTOS_SEED } from '../seeds/documentos';
import { BLOQUES_SEED } from '../seeds/contenido-bloques';
import { PLANTILLAS_SEED } from '../seeds/plantillas';

function check<T>(label: string, data: T[] | null, error: unknown): T[] {
  if (error && typeof error === 'object' && 'message' in error) {
    console.error(`  ${label}:`, error);
    process.exit(1);
  }
  if (!data) {
    console.error(`  ${label}: no data returned (error:`, error, ')');
    process.exit(1);
  }
  return data;
}

async function seed() {
  console.log('=== Seeding propuesta tables ===\n');

  // 1. Fichas — upsert on unique `folio`
  console.log('1/5  propuesta_fichas_servicio …');
  const { data: fichasRaw, error: fichasErr } = await supabase
    .from('propuesta_fichas_servicio')
    .upsert(FICHAS_SEED, { onConflict: 'folio' })
    .select('id, folio');

  const fichas = check('fichas', fichasRaw, fichasErr);
  console.log(`     ✓ ${fichas.length} fichas upserted`);

  // Build folio→id lookup for plantillas
  const folioMap = new Map<number, string>();
  for (const f of fichas) {
    folioMap.set(f.folio, f.id);
  }

  // 2. Consultores — no unique constraint; skip if already populated
  console.log('2/5  propuesta_consultores …');
  const { count: conCount } = await supabase
    .from('propuesta_consultores')
    .select('id', { count: 'exact', head: true });

  if (conCount && conCount > 0) {
    console.log(`     ⏭ already has ${conCount} rows — skipping`);
  } else {
    const { data, error } = await supabase
      .from('propuesta_consultores')
      .insert(CONSULTORES_SEED)
      .select('id');
    const cons = check('consultores', data, error);
    console.log(`     ✓ ${cons.length} consultores inserted`);
  }

  // 3. Documentos — no unique constraint; skip if already populated
  console.log('3/5  propuesta_documentos_biblioteca …');
  const { count: docCount } = await supabase
    .from('propuesta_documentos_biblioteca')
    .select('id', { count: 'exact', head: true });

  if (docCount && docCount > 0) {
    console.log(`     ⏭ already has ${docCount} rows — skipping`);
  } else {
    const { data, error } = await supabase
      .from('propuesta_documentos_biblioteca')
      .insert(DOCUMENTOS_SEED)
      .select('id');
    const docs = check('documentos', data, error);
    console.log(`     ✓ ${docs.length} documentos inserted`);
  }

  // 4. Contenido bloques — upsert on unique `clave`
  console.log('4/5  propuesta_contenido_bloques …');
  const { data: bloquesRaw, error: bloquesErr } = await supabase
    .from('propuesta_contenido_bloques')
    .upsert(BLOQUES_SEED, { onConflict: 'clave' })
    .select('id');

  const bloques = check('bloques', bloquesRaw, bloquesErr);
  console.log(`     ✓ ${bloques.length} bloques upserted`);

  // 5. Plantillas — resolve ficha_id, then skip-if-populated
  console.log('5/5  propuesta_plantillas …');
  const { count: plantCount } = await supabase
    .from('propuesta_plantillas')
    .select('id', { count: 'exact', head: true });

  if (plantCount && plantCount > 0) {
    console.log(`     ⏭ already has ${plantCount} rows — skipping`);
  } else {
    const folioByTipo: Record<string, number> = {
      evoluciona: 52244,
      preparacion: 46064,
    };

    const resolved = PLANTILLAS_SEED.map((p) => ({
      ...p,
      ficha_id: folioMap.get(folioByTipo[p.tipo_servicio] ?? 0) ?? null,
    }));

    const { data, error } = await supabase
      .from('propuesta_plantillas')
      .insert(resolved)
      .select('id');
    const plants = check('plantillas', data, error);
    console.log(`     ✓ ${plants.length} plantillas inserted`);
  }

  // --- Verification ---
  console.log('\n=== Verification ===');
  const tables = [
    'propuesta_fichas_servicio',
    'propuesta_consultores',
    'propuesta_documentos_biblioteca',
    'propuesta_contenido_bloques',
    'propuesta_plantillas',
  ] as const;

  for (const t of tables) {
    const { count } = await supabase.from(t).select('id', { count: 'exact', head: true });
    console.log(`  ${t}: ${count} rows`);
  }

  console.log('\n✅ Seed complete.');
}

seed().catch((err) => {
  console.error('\n❌ Seed failed:', err.message ?? err);
  process.exit(1);
});
