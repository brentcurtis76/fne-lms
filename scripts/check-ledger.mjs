#!/usr/bin/env node
/**
 * check-ledger.mjs — local audit tooling for the Santa Marta claim/work ledgers.
 *
 * NOT product code. NOT wired into CI. No dependencies: the CSV parser below is
 * self-contained and RFC 4180 compatible (quoted fields, embedded commas,
 * newlines and doubled quotes). Output is deterministic: stable sort order, no
 * timestamps, no randomness.
 *
 *   node scripts/check-ledger.mjs
 *
 * Exits non-zero if any check fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => path.join(ROOT, p);

const CLAIMS = R('docs/reviews/santa-marta-claims.csv');
const WORK = R('docs/reviews/santa-marta-work-items.csv');
const MAPF = R('docs/reviews/santa-marta-work-claim-map.csv');
const LEGACY = R('docs/reviews/archive/santa-marta-promise-ledger-legacy-161.csv');
const PROTOCOL = R('docs/reviews/santa-marta-release-protocol-2026-08-25.md');
const PLANDOC = R('docs/reviews/santa-marta-combined-plan-2026-08-25.md');
const REPORTDOC = R('docs/reviews/santa-marta-ledger-normalization-report-2026-08-25.md');
const PSTATE = R('PROJECT_STATE.md');
const BASELINE = R('supabase/migrations/00000000000000_baseline.sql');

// ── Frozen expectations ──────────────────────────────────────────────────────
const EXPECTED_CLAIMS = 160;
const EXPECTED_P0_CLAIMS = 36;
const LEGACY_SHA256 = '009f14abccec97d7ada4b559c9aaeb24ac5b7aab54563a5c1151e511dc2c7fe9';

/**
 * The ONLY permitted transformation of the legacy id set. Declared explicitly so
 * that no other id can vanish, change identity, or be invented without failing.
 * The resulting single claim maps to three distinct remediation work items since
 * the approved B2b governance split (2026-08-27): W-B2b-01 (the fourteen
 * repository-unused tables), W-B2c-01 (the learning-path security boundary:
 * learning_paths + learning_path_courses and their functions), and W-B10a-01
 * (the six remaining referenced tables). W-PC-06 maps to SWEEP-MI-APRENDIZAJE-09
 * instead and is an evidence dependency, not a remediation, so it never counts here.
 */
const PERMITTED_ID_TRANSFORM = {
  from: ['SWEEP-PRIOR-AUDIT-09a', 'SWEEP-PRIOR-AUDIT-09b'],
  to: 'SWEEP-PRIOR-AUDIT-09',
  expectedWorkItems: 3,
};

const CANONICAL_BATCHES = [
  'B1a', 'B1b', 'B1c', 'B2a', 'B2b', 'B2c', 'B3a', 'B3b', 'B3c', 'B4a', 'B4b', 'B4c', 'B4d',
  'B5', 'B6a', 'B6b', 'B6c', 'B6d', 'B7a', 'B7b', 'B8a', 'B8b', 'B8c', 'B9a',
  'B10a', 'B10b', 'B10c',
];
const CANONICAL_BRANCH = {
  B1a: 'fix/observ', B1b: 'fix/horas-rep', B1c: 'fix/gate-score', B2a: 'fix/red-super',
  B2b: 'fix/rls-anon', B2c: 'fix/rls-learn', B3a: 'fix/meet-save', B3b: 'fix/mail-truth', B3c: 'fix/meet-notnull',
  B4a: 'fix/sess-route', B4b: 'fix/consultor', B4c: 'fix/attendees', B4d: 'fix/sess-close',
  B5: 'fix/snapshot', B6a: 'fix/plan-pct', B6b: 'fix/nav-dir', B6c: 'fix/net-tabs',
  B6d: 'fix/lp-views', B7a: 'fix/ws-name', B7b: 'fix/feed-srv', B8a: 'fix/lic-cron',
  B8b: 'fix/feriados', B8c: 'fix/lic-audit', B9a: 'fix/assign-rec', B10a: 'fix/rls-grupo-b',
  B10b: 'fix/notif-mail', B10c: 'auth/rebase-z7',
};

/**
 * Approved scope sets of the B2b/B2c/B10a split (owner decision 2026-08-27).
 * The B2C_FUNCTIONS names are the exact baseline identifiers, verified against
 * supabase/migrations/00000000000000_baseline.sql and the two API callers
 * (pages/api/learning-paths/session/start.ts, end.ts). The two RETIRED_FN_NAMES
 * were misnamed in an earlier draft, do not exist in the schema, and must never
 * reappear in active governance documents. The D-RLS units are the deferred
 * broader-RLS research (protocol §9); they are prose-governed, never ledger rows.
 */
const B2B_TABLES = ['answers', 'assignments', 'course_prerequisites', 'deleted_blocks',
  'deleted_courses', 'deleted_lessons', 'deleted_modules', 'menu_permissions',
  'metadata_sync_log', 'profiles_role_backup', 'questions', 'quizzes',
  'student_answers', 'submissions'];
const B2C_TABLES = ['learning_paths', 'learning_path_courses'];
const B2C_FUNCTIONS = ['create_full_learning_path', 'update_full_learning_path',
  'batch_assign_learning_path', 'start_learning_path_session',
  'end_learning_path_session', 'auth_is_learning_path_member'];
const B10A_TABLES = ['group_assignment_discussions', 'growth_community_transformation_access',
  'instructors', 'modules', 'propuesta_rate_limits', 'qa_tester_time_logs'];
const RETIRED_FN_NAMES = ['start_learning_session', 'end_learning_session'];
const DEFERRED_RLS_UNITS = ['D-RLS-01', 'D-RLS-02', 'D-RLS-03'];
const DEFERRED_RLS_FUNCTIONS = ['has_transformation_access', 'get_available_assignment_templates',
  'cleanup_propuesta_rate_limits', 'has_global_workspace_access', 'submit_quiz'];

const CLAIM_HEADERS = ['claim_id', 'claim_kind', 'classification_basis', 'bloque', 'claim_text',
  'estado', 'severidad', 'verificacion', 'evidencia_prod', 'autoridad_aceptacion',
  'firmado_por', 'fecha_firma'];
const WORK_HEADERS = ['work_id', 'title', 'status', 'priority', 'lote', 'rama', 'delivery_mode',
  'clase_migracion', 'dueno', 'triage_owner', 'gate_salida', 'compensacion_reversion',
  'authorization_owner', 'execution_owner', 'authorization_status', 'notes'];
const MAP_HEADERS = ['work_id', 'claim_id'];

const KINDS = ['EXPLICIT_PROMISE', 'IMPLIED_COMMITMENT', 'OPERATIONAL_PRECONDITION',
  'AUDIT_FINDING', 'REVIEW_REQUIRED'];
const STATUSES = ['SCHEDULED', 'ACTIVE', 'BACKLOG', 'BLOCKED', 'DONE'];
const MODES = ['MERGE', 'DATA', 'PRODUCTION_CHECK', 'DOCUMENTATION'];
const CLASSES = ['0', '1', '2', '3', 'BLOCKED'];
const AUTH = ['UNAUTHORIZED', 'AUTHORIZED', 'NOT_APPLICABLE'];
const ESTADOS = ['BROKEN', 'CONDITIONAL', 'MISSING', 'READY', 'REFUTED', 'FUTURE_DISCLOSED', 'UNVERIFIABLE'];
const SEVERIDADES = ['P0', 'P1', 'P2', 'NONE'];
const VERIFICACIONES = ['1-agent', '1-lens', '2-lens'];
const ACTIONABLE = new Set(['BROKEN', 'CONDITIONAL', 'MISSING']);

// Never a real owner, in any casing or with any trailing annotation.
const PLACEHOLDER = /^(sin asignar|por asignar|tbd|n\/?a|none|pendiente|datos|-{1,}|\?+)\b/i;
const isRealOwner = (v) => { const s = (v || '').trim(); return s !== '' && !PLACEHOLDER.test(s); };

// ── RFC 4180 parser ──────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false, i = 0;
  if (text.charCodeAt(0) === 0xFEFF) i = 1;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* normalized away */ }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (quoted) throw new Error('unterminated quoted field');
  return rows;
}
function readTable(file) {
  if (!fs.existsSync(file)) return { missing: true, headers: [], rows: [] };
  const rows = parseCSV(fs.readFileSync(file, 'utf8'));
  const headers = rows[0] || [];
  const bad = [];
  const objs = rows.slice(1).map((r, n) => {
    if (r.length !== headers.length) bad.push({ line: n + 2, got: r.length });
    return Object.fromEntries(headers.map((h, k) => [h, r[k] ?? '']));
  });
  return { missing: false, headers, rows: objs, ragged: bad };
}

// ── Failure collection ───────────────────────────────────────────────────────
const failures = [];
const notes = [];
const fail = (check, msg) => failures.push({ check, msg });
const sortedJoin = (a, n = 12) => {
  const s = [...a].sort();
  return s.length <= n ? s.join(', ') : s.slice(0, n).join(', ') + ` … (+${s.length - n} más)`;
};

// ── Load ─────────────────────────────────────────────────────────────────────
const claimsT = readTable(CLAIMS);
const workT = readTable(WORK);
const mapT = readTable(MAPF);

for (const [name, t, want] of [['claims', claimsT, CLAIM_HEADERS], ['work-items', workT, WORK_HEADERS], ['map', mapT, MAP_HEADERS]]) {
  if (t.missing) { fail('06 schema', `${name}: archivo ausente`); continue; }
  if (t.headers.join(',') !== want.join(',')) {
    fail('06 schema', `${name}: cabeceras inesperadas.\n      esperadas: ${want.join(',')}\n      obtenidas: ${t.headers.join(',')}`);
  }
  for (const b of t.ragged || []) fail('06 schema', `${name}: línea ${b.line} tiene ${b.got} campos, se esperaban ${t.headers.length}`);
}
const claims = claimsT.rows, work = workT.rows, links = mapT.rows;

// ── 17a. Byte preservation of the archived legacy ledger ─────────────────────
if (!fs.existsSync(LEGACY)) {
  fail('17 conservación', `el ledger legacy archivado no existe en ${path.relative(ROOT, LEGACY)}`);
} else {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(LEGACY)).digest('hex');
  if (sha !== LEGACY_SHA256) {
    fail('17 conservación', `SHA-256 del ledger legacy archivado cambió.\n      esperado: ${LEGACY_SHA256}\n      obtenido: ${sha}`);
  } else {
    notes.push(`conservación de bytes OK — SHA-256 ${sha}`);
  }
}

// ── 17b. ID conservation ─────────────────────────────────────────────────────
if (fs.existsSync(LEGACY)) {
  const legacy = readTable(LEGACY).rows;
  const legacyIds = new Set(legacy.map(r => r.id));
  const claimIds = new Set(claims.map(c => c.claim_id));
  const { from, to, expectedWorkItems } = PERMITTED_ID_TRANSFORM;

  const disappeared = [...legacyIds].filter(id => !claimIds.has(id) && !from.includes(id));
  if (disappeared.length) fail('17 conservación', `ids legacy desaparecidos sin transformación declarada: ${sortedJoin(disappeared)}`);

  const invented = [...claimIds].filter(id => !legacyIds.has(id) && id !== to);
  if (invented.length) fail('17 conservación', `ids inventados (no están en el legacy y no son la transformación declarada): ${sortedJoin(invented)}`);

  for (const f of from) if (claimIds.has(f)) fail('17 conservación', `${f} debía fusionarse en ${to} y sigue presente como reclamación`);
  if (!claimIds.has(to)) fail('17 conservación', `la reclamación canónica ${to} no existe`);

  const n = links.filter(l => l.claim_id === to).length;
  if (n !== expectedWorkItems) fail('17 conservación', `${to} debe mapear a exactamente ${expectedWorkItems} work items; mapea a ${n}`);
  if (!failures.some(f => f.check.startsWith('17'))) notes.push(`conservación de ids OK — ${legacyIds.size} ids legacy, transformación declarada ${from.join(' + ')} → ${to}`);
}

// ── 01/02/03. Counts and identity ────────────────────────────────────────────
const claimIdList = claims.map(c => c.claim_id);
const uniqueClaimIds = new Set(claimIdList);
if (uniqueClaimIds.size !== EXPECTED_CLAIMS) fail('01 conteo', `claim_id únicos = ${uniqueClaimIds.size}; se exigen exactamente ${EXPECTED_CLAIMS}`);

const p0 = new Set(claims.filter(c => c.severidad === 'P0').map(c => c.claim_id));
if (p0.size !== EXPECTED_P0_CLAIMS) fail('02 conteo P0', `reclamaciones P0 únicas = ${p0.size}; se exigen exactamente ${EXPECTED_P0_CLAIMS}`);

const dupClaims = claimIdList.filter((v, i) => claimIdList.indexOf(v) !== i);
if (dupClaims.length) fail('03 duplicados', `claim_id duplicados: ${sortedJoin(new Set(dupClaims))}`);
const workIdList = work.map(w => w.work_id);
const dupWork = workIdList.filter((v, i) => workIdList.indexOf(v) !== i);
if (dupWork.length) fail('03 duplicados', `work_id duplicados: ${sortedJoin(new Set(dupWork))}`);

// ── 04. Dangling references ──────────────────────────────────────────────────
const workIds = new Set(workIdList);
const danglingC = new Set(links.filter(l => !uniqueClaimIds.has(l.claim_id)).map(l => l.claim_id));
const danglingW = new Set(links.filter(l => !workIds.has(l.work_id)).map(l => l.work_id));
if (danglingC.size) fail('04 referencias', `el mapa nombra claim_id inexistentes: ${sortedJoin(danglingC)}`);
if (danglingW.size) fail('04 referencias', `el mapa nombra work_id inexistentes: ${sortedJoin(danglingW)}`);

const dupPairs = new Set();
{
  const seen = new Set();
  for (const l of links) { const k = l.work_id + ' ' + l.claim_id; if (seen.has(k)) dupPairs.add(k); seen.add(k); }
}
if (dupPairs.size) fail('04 referencias', `pares work_id,claim_id duplicados: ${dupPairs.size}`);
for (const l of links) {
  if (/[;|]/.test(l.claim_id) || /[;|]/.test(l.work_id)) fail('04 referencias', `celda con lista embebida — un par por fila: ${l.work_id} / ${l.claim_id}`);
}

// ── 05. Referential integrity ────────────────────────────────────────────────
const byWork = new Map(work.map(w => [w.work_id, w]));
const claimsOfWork = new Map(), worksOfClaim = new Map();
for (const l of links) {
  if (!claimsOfWork.has(l.work_id)) claimsOfWork.set(l.work_id, []);
  claimsOfWork.get(l.work_id).push(l.claim_id);
  if (!worksOfClaim.has(l.claim_id)) worksOfClaim.set(l.claim_id, []);
  worksOfClaim.get(l.claim_id).push(l.work_id);
}
// A PRODUCTION_CHECK gathers evidence; it is not a remediation.
const remediationOf = (cid) => (worksOfClaim.get(cid) || []).filter(w => byWork.get(w)?.delivery_mode !== 'PRODUCTION_CHECK');

const unmapped = claims.filter(c => ACTIONABLE.has(c.estado) && remediationOf(c.claim_id).length === 0).map(c => c.claim_id);
if (unmapped.length) fail('05 integridad', `reclamaciones accionables sin work item de remediación (${unmapped.length}): ${sortedJoin(unmapped)}`);

const refuted = claims.filter(c => c.estado === 'REFUTED' && (worksOfClaim.get(c.claim_id) || []).length > 0).map(c => c.claim_id);
if (refuted.length) fail('05 integridad', `reclamaciones REFUTED con enlace de trabajo: ${sortedJoin(refuted)}`);

const orphanWork = work.filter(w => !(claimsOfWork.get(w.work_id) || []).length).map(w => w.work_id);
if (orphanWork.length) fail('05 integridad', `work items sin ninguna reclamación: ${sortedJoin(orphanWork)}`);

const backlogState = claims.filter(c => /BACKLOG/i.test(Object.values(c).join(' '))).map(c => c.claim_id);
if (backlogState.length) fail('05 integridad', `el esquema de reclamaciones no lleva estado de backlog; aparece en: ${sortedJoin(backlogState)}`);

// ── 07/08. Enums and mandatory identity fields ───────────────────────────────
for (const c of claims) {
  if (!c.claim_id.trim()) fail('08 identidad', 'fila de reclamación sin claim_id');
  if (!KINDS.includes(c.claim_kind)) fail('07 enum', `${c.claim_id}: claim_kind inválido «${c.claim_kind}»`);
  if (!ESTADOS.includes(c.estado)) fail('07 enum', `${c.claim_id}: estado inválido «${c.estado}»`);
  if (!SEVERIDADES.includes(c.severidad)) fail('07 enum', `${c.claim_id}: severidad inválida «${c.severidad}»`);
  if (!VERIFICACIONES.includes(c.verificacion)) fail('07 enum', `${c.claim_id}: verificacion inválida «${c.verificacion}»`);
  if (!c.claim_text.trim()) fail('08 identidad', `${c.claim_id}: claim_text vacío`);
  for (const col of ['lote', 'rama', 'dueno', 'status', 'delivery_mode']) {
    if (col in c) fail('06 schema', `${c.claim_id}: la reclamación no debe llevar la columna «${col}»`);
  }
}
for (const w of work) {
  if (!w.work_id.trim()) fail('08 identidad', 'fila de work item sin work_id');
  if (!w.title.trim()) fail('08 identidad', `${w.work_id}: title vacío`);
  if (!STATUSES.includes(w.status)) fail('07 enum', `${w.work_id}: status inválido «${w.status}»`);
  if (!MODES.includes(w.delivery_mode)) fail('07 enum', `${w.work_id}: delivery_mode inválido «${w.delivery_mode}»`);
  if (!CLASSES.includes(w.clase_migracion)) fail('07 enum', `${w.work_id}: clase_migracion inválida «${w.clase_migracion}»`);
  if (!AUTH.includes(w.authorization_status)) fail('07 enum', `${w.work_id}: authorization_status inválido «${w.authorization_status}»`);
}
for (const l of links) {
  if (!l.work_id.trim() || !l.claim_id.trim()) fail('08 identidad', 'fila del mapa con work_id o claim_id vacío');
}

// ── 09. classification_basis, kind-specific ──────────────────────────────────
const LOCATOR = /(lámina\s+\d+|guión[^,;]{0,40}[AB]·\d{2}|p\.\s?\d+|REGLA DE HONESTIDAD)/i;
const CODE_LOCATOR = /(\.tsx?\b|\.sql\b|\.js\b|\.json\b|docs\/reviews\/|PROJECT_STATE|CLAUDE\.md|AGENTS\.md|supabase\/|pages\/|lib\/|components\/|utils\/|scripts\/|git\s)/i;
for (const c of claims) {
  const b = (c.classification_basis || '').trim();
  const bad = (why) => fail('09 provenance', `${c.claim_id} (${c.claim_kind}): classification_basis ${why}`);
  if (!b) { bad('vacío'); continue; }
  switch (c.claim_kind) {
    case 'EXPLICIT_PROMISE':
      if (!LOCATOR.test(b)) bad('sin número de lámina ni localizador del guión');
      break;
    case 'IMPLIED_COMMITMENT':
      if (!LOCATOR.test(b)) bad('sin localizador de presentación');
      if (!/inferencia/i.test(b)) bad('sin la inferencia declarada');
      break;
    case 'OPERATIONAL_PRECONDITION': {
      const cited = [...uniqueClaimIds].filter(id => b.includes(id));
      if (!cited.length) bad('sin claim_id explícito/implícito enlazado que exista en el ledger');
      if (!/base técnica/i.test(b)) bad('sin base técnica declarada');
      break;
    }
    case 'AUDIT_FINDING':
      if (!CODE_LOCATOR.test(b)) bad('sin referencia a artefacto de auditoría ni localizador de código');
      break;
    case 'REVIEW_REQUIRED':
      if (!/(sin localizador|falta|no se pudo|indetermin)/i.test(b)) bad('sin explicación de qué provenencia falta');
      break;
  }
}

// ── 10/11/12/13. Batches and branches ────────────────────────────────────────
const mergeItems = work.filter(w => w.delivery_mode === 'MERGE');
const batches = [...new Set(mergeItems.map(w => w.lote).filter(Boolean))].sort();
if (batches.length !== 27) fail('10 lotes', `lotes de fusión distintos = ${batches.length}; se exigen exactamente 27`);
const missingB = CANONICAL_BATCHES.filter(b => !batches.includes(b));
const extraB = batches.filter(b => !CANONICAL_BATCHES.includes(b));
if (missingB.length) fail('11 lotes', `lotes canónicos ausentes: ${sortedJoin(missingB, 27)}`);
if (extraB.length) fail('11 lotes', `lotes de fusión fuera de la lista canónica: ${sortedJoin(extraB, 27)}`);

const branchesOfLote = new Map();
for (const w of work) {
  if (w.lote) {
    if (!branchesOfLote.has(w.lote)) branchesOfLote.set(w.lote, new Set());
    if (w.rama) branchesOfLote.get(w.lote).add(w.rama);
  }
  if (w.delivery_mode === 'MERGE' && !w.rama.trim()) fail('12 ramas', `${w.work_id}: work item MERGE sin rama`);
  if (w.delivery_mode !== 'MERGE' && w.rama.trim()) fail('12 ramas', `${w.work_id}: work item ${w.delivery_mode} con rama «${w.rama}»`);
  if (w.rama.length > 20) fail('13 ramas', `${w.work_id}: rama «${w.rama}» tiene ${w.rama.length} caracteres (máximo 20 — nombres largos rompen el DNS de preview de Vercel)`);
  if (w.lote && w.delivery_mode !== 'MERGE') fail('12 ramas', `${w.work_id}: lote «${w.lote}» en un work item ${w.delivery_mode}; un lote es un contenedor de fusión`);
}
for (const [lote, set] of [...branchesOfLote].sort()) {
  if (set.size > 1) fail('12 ramas', `el lote ${lote} mapea a más de una rama distinta: ${sortedJoin(set)}`);
  const only = [...set][0];
  if (CANONICAL_BRANCH[lote] && only && only !== CANONICAL_BRANCH[lote]) {
    fail('12 ramas', `el lote ${lote} debe usar la rama «${CANONICAL_BRANCH[lote]}»; usa «${only}»`);
  }
}

// ── 16. Ownership, mode-aware ────────────────────────────────────────────────
const p0Linked = new Set(links.filter(l => p0.has(l.claim_id)).map(l => l.work_id));
let pcExceptions = 0;
const unownedWork = [];
for (const w of [...work].sort((a, b) => a.work_id.localeCompare(b.work_id))) {
  const real = isRealOwner(w.dueno);
  const triage = isRealOwner(w.triage_owner);

  if (w.delivery_mode === 'PRODUCTION_CHECK') {
    // Explicit exception: `dueno` is intentionally inapplicable and must not fail,
    // even when the item is P0-linked. It must be EMPTY — not a placeholder. A
    // placeholder is not "no owner", it is an unfilled field pretending to be one.
    if (w.dueno.trim() !== '') {
      fail('16 propiedad', `${w.work_id}: PRODUCTION_CHECK exige dueno vacío, no «${w.dueno}»; la propiedad no es la pregunta que responde`);
    }
    pcExceptions++;
    if (w.authorization_status === 'UNAUTHORIZED' && w.status !== 'BLOCKED') {
      fail('16 propiedad', `${w.work_id}: UNAUTHORIZED exige status BLOCKED; está en ${w.status}`);
    }
    if (w.authorization_status === 'AUTHORIZED' && w.status === 'SCHEDULED' && !isRealOwner(w.execution_owner)) {
      fail('16 propiedad', `${w.work_id}: AUTORIZADO y SCHEDULED exige execution_owner poblado`);
    }
    if (isRealOwner(w.execution_owner) && w.execution_owner.trim() === (w.authorization_owner || '').trim()) {
      fail('16 propiedad', `${w.work_id}: execution_owner reutiliza authorization_owner en silencio; responden preguntas distintas`);
    }
    if (!isRealOwner(w.authorization_owner)) {
      fail('16 propiedad', `${w.work_id}: PRODUCTION_CHECK sin authorization_owner real`);
    }
    continue;
  }

  // "Any P0-linked item requires a real `dueno`, REGARDLESS OF STATUS." This is
  // checked BEFORE the DONE exemption — a finished item still needs a name against it.
  if (p0Linked.has(w.work_id) && !real) {
    fail('16 propiedad', `${w.work_id} (${w.status}): enlazado a una reclamación P0 y sin dueno real («${w.dueno || ''}»)`);
    unownedWork.push(w.work_id); continue;
  }
  if (w.status === 'DONE') continue;
  if ((w.status === 'SCHEDULED' || w.status === 'ACTIVE') && !real) {
    fail('16 propiedad', `${w.work_id}: status ${w.status} exige dueno real («${w.dueno || ''}»)`);
    unownedWork.push(w.work_id); continue;
  }
  if (!real && !triage) {
    fail('16 propiedad', `${w.work_id} (${w.status}): sin dueno real y sin triage_owner nombrado`);
    unownedWork.push(w.work_id);
  }
}

const unownedClaims = new Set();
for (const wid of unownedWork) for (const cid of claimsOfWork.get(wid) || []) unownedClaims.add(cid);
const unownedP0 = new Set([...unownedClaims].filter(c => p0.has(c)));

// ── 14/15. Protocol reconciliation ───────────────────────────────────────────
const p0Links = links.filter(l => p0.has(l.claim_id));
const ACTUAL = {
  total_claims: uniqueClaimIds.size,
  unique_p0_claims: p0.size,
  total_work_items: work.length,
  total_claim_work_links: links.length,
  p0_claim_work_links: p0Links.length,
  unique_p0_claims_with_links: new Set(p0Links.map(l => l.claim_id)).size,
  merge_batches: batches,
};

let protoText = '';
if (!fs.existsSync(PROTOCOL)) {
  fail('14 reconciliación', 'el protocolo activo no existe');
} else {
  protoText = fs.readFileSync(PROTOCOL, 'utf8');
  const m = protoText.match(/<!--\s*LEDGER-SUMMARY:BEGIN\s*-->([\s\S]*?)<!--\s*LEDGER-SUMMARY:END\s*-->/);
  if (!m) {
    fail('14 reconciliación', 'no hay bloque LEDGER-SUMMARY en el protocolo');
  } else {
    // Raw JSON between the markers — no fence-stripping step, by design.
    let block;
    try { block = JSON.parse(m[1]); }
    catch (e) { fail('14 reconciliación', `el bloque LEDGER-SUMMARY no es JSON válido: ${e.message}`); }
    if (block) {
      for (const k of Object.keys(ACTUAL)) {
        if (!(k in block)) { fail('14 reconciliación', `LEDGER-SUMMARY sin la clave «${k}»`); continue; }
        const a = ACTUAL[k], b = block[k];
        const same = Array.isArray(a) ? JSON.stringify([...a].sort()) === JSON.stringify([...(b || [])].sort()) : a === b;
        if (!same) fail('14 reconciliación', `LEDGER-SUMMARY.${k} = ${JSON.stringify(b)}; los ledgers dicen ${JSON.stringify(a)}`);
      }
      for (const k of Object.keys(block)) if (!(k in ACTUAL)) fail('14 reconciliación', `LEDGER-SUMMARY tiene la clave inesperada «${k}»`);
    }
  }

  // 14b — Active-prose reconciliation. The JSON block alone is not enough: the
  // protocol's narrative tables and sentences carry their own numbers, and a
  // contradiction there is exactly as wrong as one in the block. Every figure
  // below must appear in the prose and must equal the ledgers.
  const tally = (rows, key) => rows.reduce((m, r) => (m[r[key]] = (m[r[key]] || 0) + 1, m), {});
  const statusCount = tally(work, 'status');
  const modeCount2 = tally(work, 'delivery_mode');
  const verifCount = tally(claims, 'verificacion');

  // label → expected number, matched as "LABEL … <n>" within a short window.
  const proseLabels = [
    ...STATUSES.map(s => [s, statusCount[s] || 0]),
    ...MODES.map(m2 => [m2, modeCount2[m2] || 0]),
  ];
  for (const [label, expected] of proseLabels) {
    if (expected === 0) continue;                       // absent categories need no prose
    const re = new RegExp('`?' + label + '`?[^\\n0-9]{0,40}(\\d+)', 'g');
    const found = [...protoText.matchAll(re)].map(m2 => Number(m2[1]));
    if (!found.length) {
      fail('14 reconciliación', `el protocolo no declara el conteo de «${label}» (los ledgers dicen ${expected})`);
    } else if (!found.includes(expected)) {
      fail('14 reconciliación', `el protocolo declara ${found.join('/')} para «${label}»; los ledgers dicen ${expected}`);
    }
  }
  const vPat = [
    [/(\d+)\s+tienen verificación de un solo agente/i, verifCount['1-agent'] || 0, '1-agent'],
    [/(\d+)\s+de una lente/i, verifCount['1-lens'] || 0, '1-lens'],
    [/(\d+)\s+de dos(?:\s+lentes)?/i, verifCount['2-lens'] || 0, '2-lens'],
  ];
  for (const [re, expected, label] of vPat) {
    const m2 = protoText.match(re);
    if (!m2) fail('14 reconciliación', `el protocolo no declara el conteo de verificación «${label}» (los ledgers dicen ${expected})`);
    else if (Number(m2[1]) !== expected) fail('14 reconciliación', `el protocolo declara ${m2[1]} para verificación «${label}»; los ledgers dicen ${expected}`);
  }
  // Depth-of-verification claims about P0 must match the data, not aspiration.
  const p0Weak = claims.filter(c => c.severidad === 'P0' && c.verificacion !== '2-lens').map(c => c.claim_id);
  if (/P0[^.\n]{0,60}(están|todas)[^.\n]{0,40}dos lentes/i.test(protoText) && p0Weak.length) {
    fail('14 reconciliación', `el protocolo afirma que las P0 están a dos lentes; ${p0Weak.length} de ${p0.size} no lo están: ${sortedJoin(p0Weak, 20)}`);
  }

  // 15 — P0 conflation and stale current-tense counts.
  const HIST = /(histór|legacy|heredad|superad|antes de la normalización)/i;
  protoText.split('\n').forEach((line, i) => {
    const n = i + 1;
    if (HIST.test(line)) return;                       // labelled historical: allowed
    if (/LEDGER-SUMMARY|check-ledger\.mjs/.test(line)) return;
    for (const re of [/(\d+)\s+(?:reclamaciones|promesas|claims|filas)\s+P0/gi,
                      /P0\s*(?:únicas?|unicas?)\s*[:=]?\s*(\d+)/gi]) {
      for (const mm of line.matchAll(re)) {
        if (Number(mm[1]) !== ACTUAL.unique_p0_claims) {
          fail('15 conflación P0', `protocolo:${n} presenta ${mm[1]} como número de reclamaciones P0; son ${ACTUAL.unique_p0_claims} (37/54 son enlaces, no reclamaciones) — «${line.trim().slice(0, 120)}»`);
        }
      }
    }
    for (const mm of line.matchAll(/cola operativa P0 es\s*\*?\*?(\d+)/gi)) {
      if (Number(mm[1]) !== ACTUAL.p0_claim_work_links && Number(mm[1]) !== ACTUAL.unique_p0_claims) {
        fail('15 conflación P0', `protocolo:${n} declara una cola P0 de ${mm[1]}, que no es ni las ${ACTUAL.unique_p0_claims} reclamaciones P0 ni los ${ACTUAL.p0_claim_work_links} enlaces P0`);
      }
    }
    for (const stale of ['161 filas', 'las 161', '134 de 161', '37, no 36', '37 y no 36']) {
      if (line.includes(stale)) fail('15 conflación P0', `protocolo:${n} conserva un conteo obsoleto en presente: «${stale}»`);
    }
  });

  // Task 8 — DROP is categorically prohibited (AGENTS.md:37, CLAUDE.md:54).
  for (const [i, line] of protoText.split('\n').entries()) {
    if (/DROP\s+(POLICY|TABLE|COLUMN|CONSTRAINT|INDEX|SCHEMA)/i.test(line) && !/nunca|prohib|jamás|never/i.test(line)) {
      fail('15 conflación P0', `protocolo:${i + 1} propone un DROP: «${line.trim().slice(0, 120)}»`);
    }
  }
  if (!/reconciliad[oa]s?\s+contra\s+los\s+ledgers?\s+por\s+`?scripts\/check-ledger\.mjs`?/i.test(protoText)) {
    fail('14 reconciliación', 'el protocolo no declara que sus cifras se reconcilian contra los ledgers por `scripts/check-ledger.mjs`');
  }
}

// ── 18. Approved split scopes: B2b (14) / B2c (2 tables + 6 fns) / B10a (6) ──
// EXACT set comparison, not token presence. The scope a work item encodes is the
// union of its gate_salida's parenthesized identifier lists — comma-separated,
// lowercase snake_case only. That encoded set must EQUAL the approved set:
// missing, renamed, duplicated, cross-set or arbitrary extra identifiers all fail.
const hasToken = (text, name) => new RegExp(`(^|[^A-Za-z0-9_])${name}([^A-Za-z0-9_]|$)`).test(text);
{
  const ID_LIST = /^[a-z][a-z0-9_]*(?:\s*,\s*[a-z][a-z0-9_]*)*$/;
  const encodedScope = (text) => {
    const ids = [];
    for (const m of text.matchAll(/\(([^)]*)\)/g)) {
      const inner = m[1].trim();
      if (ID_LIST.test(inner)) ids.push(...inner.split(',').map(s => s.trim()));
    }
    return ids;
  };
  const SETS = [
    ['W-B2b-01', B2B_TABLES, 'las catorce tablas aprobadas'],
    ['W-B2c-01', [...B2C_TABLES, ...B2C_FUNCTIONS], 'las dos tablas y las seis funciones exactas'],
    ['W-B10a-01', B10A_TABLES, 'las seis tablas aprobadas'],
  ];
  const FOREIGN = {
    'W-B2b-01': [...B2C_TABLES, ...B2C_FUNCTIONS, ...B10A_TABLES],
    'W-B2c-01': [...B2B_TABLES, ...B10A_TABLES],
    'W-B10a-01': [...B2B_TABLES, ...B2C_TABLES, ...B2C_FUNCTIONS],
  };
  for (const [wid, approved, label] of SETS) {
    const w = byWork.get(wid);
    if (!w) { fail('18 alcance', `${wid}: no existe en el ledger de trabajo`); continue; }
    const scope = w.gate_salida || '';
    const ids = encodedScope(scope);
    if (!ids.length) { fail('18 alcance', `${wid}: gate_salida no contiene ninguna lista explícita de identificadores entre paréntesis`); continue; }
    const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
    if (dup.length) fail('18 alcance', `${wid}: identificadores duplicados en su lista explícita: ${sortedJoin(dup)}`);
    const enc = new Set(ids), app = new Set(approved);
    const missing = approved.filter(n => !enc.has(n));
    const extra = [...enc].filter(n => !app.has(n)).sort();
    if (missing.length) fail('18 alcance', `${wid}: su lista explícita omite ${label}: faltan ${sortedJoin(missing)}`);
    if (extra.length) fail('18 alcance', `${wid}: su lista explícita añade identificadores fuera del conjunto aprobado: ${sortedJoin(extra)}`);
    // Belt and braces: a foreign identifier anywhere in the scope field fails even
    // if it were smuggled outside the parenthesized lists.
    for (const n of FOREIGN[wid]) if (hasToken(scope, n)) fail('18 alcance', `${wid}: gate_salida nombra «${n}», que pertenece a otro conjunto del split`);
  }
  const union = [...B2B_TABLES, ...B2C_TABLES, ...B10A_TABLES];
  if (B2B_TABLES.length !== 14 || B2C_TABLES.length !== 2 || B10A_TABLES.length !== 6 || new Set(union).size !== union.length) {
    fail('18 alcance', `los conjuntos B2b/B2c/B10a deben ser disjuntos y sumar 14 + 2 + 6 = 22; hay ${new Set(union).size} nombres únicos sobre ${union.length} declarados`);
  }
  if (!failures.some(f => f.check.startsWith('18'))) notes.push('alcance del split OK — igualdad exacta de conjuntos: B2b 14 tablas + B2c 2 tablas y 6 funciones + B10a 6 tablas, disjuntos (22)');
}

// ── 19. B2c functions are real SECURITY DEFINER baseline objects; retired names gone
{
  if (!fs.existsSync(BASELINE)) {
    fail('19 funciones', 'el baseline comprometido no existe; no se puede verificar el inventario de funciones B2c');
  } else {
    const base = fs.readFileSync(BASELINE, 'utf8');
    for (const fn of B2C_FUNCTIONS) {
      const m = base.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION "public"\\."${fn}"\\s*\\(`));
      if (!m) { fail('19 funciones', `${fn}: no existe como función de public en el baseline comprometido`); continue; }
      const dollar = base.indexOf('$', m.index);
      const header = base.slice(m.index, dollar === -1 ? m.index + 2000 : dollar);
      if (!/SECURITY\s+DEFINER/.test(header)) fail('19 funciones', `${fn}: no está declarada SECURITY DEFINER en el baseline`);
    }
    for (const bad of RETIRED_FN_NAMES) if (base.includes(bad)) fail('19 funciones', `el baseline contiene el nombre retirado «${bad}» — el inventario B2c estaría mal derivado`);
  }
  const ACTIVE_DOCS = [[WORK, 'work-items'], [MAPF, 'work-claim-map'], [PROTOCOL, 'protocolo'],
    [PLANDOC, 'plan combinado'], [REPORTDOC, 'informe de normalización'], [PSTATE, 'PROJECT_STATE']];
  for (const [file, label] of ACTIVE_DOCS) {
    if (!fs.existsSync(file)) continue; // a missing governing file already fails its own check
    const text = fs.readFileSync(file, 'utf8');
    for (const bad of RETIRED_FN_NAMES) {
      if (text.includes(bad)) fail('19 funciones', `${label}: contiene el nombre de función retirado «${bad}»; los nombres reales son start_learning_path_session / end_learning_path_session`);
    }
  }
  if (!failures.some(f => f.check.startsWith('19'))) notes.push('funciones B2c OK — las seis existen SECURITY DEFINER en el baseline; los dos nombres retirados están ausentes de los documentos activos');
}

// ── 20. Deferred broader-RLS units stay present in EVERY governing location ──
{
  const GOVERNING = [
    ['el protocolo', protoText],
    ['el informe de normalización', fs.existsSync(REPORTDOC) ? fs.readFileSync(REPORTDOC, 'utf8') : ''],
    ['PROJECT_STATE', fs.existsSync(PSTATE) ? fs.readFileSync(PSTATE, 'utf8') : ''],
  ];
  for (const u of DEFERRED_RLS_UNITS) {
    for (const [where, text] of GOVERNING) {
      if (!text.includes(u)) fail('20 diferidos', `${where} no conserva la unidad diferida ${u}`);
    }
  }
  for (const f2 of DEFERRED_RLS_FUNCTIONS) {
    if (!hasToken(protoText, f2)) fail('20 diferidos', `el protocolo no conserva la función diferida ${f2} (D-RLS-01/02)`);
  }
  if (!protoText.includes('565faa0d')) fail('20 diferidos', 'el protocolo no ancla la evidencia de investigación aparcada al head 565faa0d');
  if (!failures.some(f => f.check.startsWith('20'))) notes.push('unidades diferidas OK — D-RLS-01/02/03 presentes en protocolo, informe y PROJECT_STATE, con sus cinco funciones y el ancla 565faa0d');
}

// ── Report ───────────────────────────────────────────────────────────────────
const L = [];
L.push('santa-marta ledger check');
L.push('='.repeat(72));
L.push('');
L.push('CIFRAS');
L.push(`  reclamaciones congeladas                 ${ACTUAL.total_claims}`);
L.push(`  reclamaciones P0 únicas                  ${ACTUAL.unique_p0_claims}`);
L.push(`  work items                               ${ACTUAL.total_work_items}`);
L.push(`  enlaces reclamación↔trabajo              ${ACTUAL.total_claim_work_links}`);
L.push(`  enlaces P0 reclamación↔trabajo           ${ACTUAL.p0_claim_work_links}`);
L.push(`  reclamaciones P0 únicas con enlace       ${ACTUAL.unique_p0_claims_with_links}`);
L.push(`  lotes de fusión distintos                ${ACTUAL.merge_batches.length}`);
L.push('');
const modeCount = {};
for (const w of work) modeCount[w.delivery_mode] = (modeCount[w.delivery_mode] || 0) + 1;
L.push('WORK ITEMS POR MODO');
for (const k of MODES) L.push(`  ${k.padEnd(18)} ${modeCount[k] || 0}`);
L.push('');
L.push('PROPIEDAD (tres números distintos, nunca fusionados)');
L.push(`  work items sin dueño (excluida la excepción PRODUCTION_CHECK)   ${unownedWork.length}`);
L.push(`  reclamaciones únicas enlazadas a esos work items                ${unownedClaims.size}`);
L.push(`  reclamaciones P0 únicas enlazadas a esos work items             ${unownedP0.size}`);
L.push(`  excepción PRODUCTION_CHECK: dueno vacío a propósito             ${pcExceptions}`);
if (unownedP0.size) L.push(`    P0 sin dueño: ${sortedJoin(unownedP0, 20)}`);
L.push('');
for (const n of notes) L.push(`  · ${n}`);
L.push('');
if (failures.length) {
  const groups = new Map();
  for (const f of failures) { if (!groups.has(f.check)) groups.set(f.check, []); groups.get(f.check).push(f.msg); }
  L.push(`FALLOS: ${failures.length}`);
  L.push('-'.repeat(72));
  for (const [check, msgs] of [...groups].sort()) {
    L.push(`[${check}] ${msgs.length}`);
    for (const m of msgs.sort()) L.push(`  ✗ ${m}`);
    L.push('');
  }
} else {
  L.push('FALLOS: 0');
}
console.log(L.join('\n'));
process.exit(failures.length ? 1 : 0);
