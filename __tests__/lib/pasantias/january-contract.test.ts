/**
 * PASANT-B001b/B001c — the January 2027 contract candidate, its prerequisite
 * register and Brent's recorded answers (docs/plan/pasantias-january-contract.md,
 * docs/plan/evidence/pasant-january/b001-contract-prerequisites.md,
 * docs/plan/evidence/pasant-january/b001-brent-decisions.md).
 *
 * Independent oracle: expectations below are pinned from the approved PASANT
 * plan (rev 1, C002), Brent's messages as matched in the transcript and the
 * committed page-text snapshot of the pinned brochure. Nothing is imported from
 * lib/; prices are recomputed from the contract's inputs and matched against
 * the brochure's own text.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const CONTRACT_PATH = 'docs/plan/pasantias-january-contract.md';
const EVIDENCE = 'docs/plan/evidence/pasant-january';
const SOURCE_SHA256 = '84d83e153ee794a95d7a9e019359fc637237842ae0a7128f98cae332ff4efdb5';
const CANDIDATE = 'CANDIDATE — NOT RATIFIED — NOT ACTIVE';
const RECORD_PATH = `${EVIDENCE}/b001-brent-decisions.md`;

type Fact = { program: string; field: string; value: unknown; page: number; anchor: string };
type Decided = {
  id: string; decision: string; field: string; value: unknown; brochure: string; page: number; anchor: string;
  evidence: string; at: string; basis: string;
};
type Tier = 'standard' | 'discounted';
type Commercial = {
  programs: Record<string, {
    feeClp: number; discountedFeeClp: number; nights: number; returnDate: string;
    perPersonClp: Record<Tier, [number, number]>;
  }>;
  arrivalDate: string; lodgingEur: { doublePerPersonPerNight: [number, number]; singlePerNightApprox: number };
  flightClpApprox: number; eurClp: number; totalsRoundedToClp: number; teamSizes: [number, number];
};
type Contract = {
  status: string; source: { sha256: string; pages: number; version: string };
  ids: { cohort: string; programs: string[] }; facts: Fact[]; decided: Decided[]; pending: Array<{ id: string }>;
  commercial: Commercial;
};
type Page = { page: number; sha256: string; text: string };

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const fencedJson = <T>(doc: string, name: string): T => {
  const block = doc.match(/```json\n([\s\S]*?)\n```/);
  if (!block) throw new Error(`${name}: no fenced json block`);
  return JSON.parse(block[1]) as T;
};
const loadContract = (path: string) => fencedJson<Contract>(read(path), path);
const squash = (text: string) => text.normalize('NFKC').replace(/\s+/g, '');
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const clp = (n: number) => `$${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const cells = (line: string) => line.split('|').slice(1, -1).map((cell) => cell.trim());
const json = (value: unknown) => JSON.stringify(value);

/**
 * Every required public fact, pinned here from the committed source pages — never read back from the candidate:
 * [program.field, page, value, verbatim source evidence on that page]. ISO days and counts in each value must
 * appear in its evidence (asserted below). A ratified correction has to change this table and the contract.
 */
const REQUIRED_FACTS: Array<[string, number, unknown, string]> = [
  ['cohort.label', 1, 'Cohorte Enero 2027', 'COHORTE ENERO 2027'],
  ['cohort.span', 1, '2027-01-18/2027-01-29', 'Enero, 18 al 29 · 2027'],
  ['cohort.city', 2, 'Barcelona', 'Ciudad Barcelona'],
  ['cohort.together', 3, 'both programs travel together', 'Todos viajan juntos a Barcelona'],
  ['cohort.routing', 17, ['Pasantía INSPIRA', 'Mirada Profunda'], '¿Primera vez? Pasantía INSPIRA. ¿Ya viajaste? Mirada Profunda.'],
  ['cohort.places', 17, 'confirmed in booking order', 'Los cupos de la cohorte de enero se confirman por orden de reserva.'],
  ['cohort.contact', 17, ['+56 9 4162 3577', 'info@nuevaeducacion.org'], 'WHATSAPP +56 9 4162 3577'],
  ['inspira.name', 3, 'Pasantía INSPIRA', 'PASANTÍA INSPIRA VER PARA'],
  ['inspira.audience', 3, 'Equipos que viajan por primera vez', 'Equipos que viajan por primera vez'],
  ['inspira.dates', 3, '2027-01-18/2027-01-28', '18 al 28 de enero · 9 días en escuelas'],
  ['inspira.schoolDays', 5, 9, 'nueve días en escuelas, dos días libres'],
  ['inspira.schoolCount', 3, 6, '6 escuelas: una semana de inmersión en dos escuelas y una semana de visitas a cuatro'],
  ['inspira.week1', 4, '2027-01-18/2027-01-22 immersion', 'SEMANA 1 · LUN 18 — VIE 22 ENE INMERSIÓN'],
  ['inspira.immersionSchools', 5, ['Escola Virolai', 'Escola Sadako'], 'Cada pasante vive 2,5 días en Escola Virolai y 2,5 días en Escola Sadako.'],
  ['inspira.freeDays', 4, '2027-01-23/2027-01-24', 'un fin de semana libre · sábado 23 y domingo 24'],
  ['inspira.week2', 4, '2027-01-25/2027-01-28 visits, one school per day', 'SEMANA 2 · LUN 25 — JUE 28 ENE VISITAS Una escuela por día'],
  ['inspira.visitCount', 4, 4, 'Cada cohorte visita cuatro de estas cinco escuelas.'],
  ['inspira.visitCandidates', 4, ['Institut Escola El Puig', 'Escola La Maquinista', 'Escola Octavio Paz', 'Institut Angeleta Ferrer', 'Institut Escola Les Vinyes'], 'cuatro visitas que se eligen entre estos cinco proyectos'],
  ['inspira.visitSelection', 4, 'conditional: chosen with the group by interests and each school\'s availability', 'La selección y el orden se definen con el grupo, según sus intereses y la disponibilidad de cada escuela.'],
  ['inspira.fullDayOutside', 5, ['Institut Escola El Puig', 'Institut Escola Les Vinyes'], 'están fuera de Barcelona y toman el día completo'],
  ['inspira.lunches', 16, 'week 1 only (Virolai, Sadako)', 'Almuerzos: en la Pasantía INSPIRA, durante la primera semana (Escola Virolai y Escola Sadako).'],
  ['inspira.takeaway', 3, 'Inspiración y un mapa de lo posible', 'Inspiración y un mapa de lo posible'],
  ['mirada-profunda.name', 3, 'INSPIRA Mirada Profunda', 'INSPIRA MIRADA PROFUNDA COMPRENDER PARA'],
  ['mirada-profunda.audience', 3, 'Quienes ya viajaron con INSPIRA', 'Quienes ya viajaron con INSPIRA'],
  ['mirada-profunda.dates', 3, '2027-01-18/2027-01-29', '18 al 29 de enero · 10 días en escuelas'],
  ['mirada-profunda.schoolDays', 6, 10, 'Son diez días, cinco escuelas y dos días completos en cada una.'],
  ['mirada-profunda.schoolCount', 3, 5, '5 escuelas, dos días completos en cada una'],
  ['mirada-profunda.week1', 7, '2027-01-18/2027-01-22 five school days', 'Lunes 18 a viernes 22 de enero · cinco jornadas en escuelas'],
  ['mirada-profunda.freeDays', 7, '2027-01-23/2027-01-24', 'Sábado 23 y domingo 24 de enero'],
  ['mirada-profunda.week2', 7, '2027-01-25/2027-01-29 five school days', 'Lunes 25 a viernes 29 de enero · cinco jornadas en escuelas'],
  ['mirada-profunda.schools', 7, ['Escola Virolai', 'Escola Sadako', 'Institut Angeleta Ferrer', 'Institut Escola El Puig', 'Institut Escola Les Vinyes'], 'LAS CINCO ESCUELAS 2 DÍAS Escola Virolai 2 DÍAS Escola Sadako'],
  ['mirada-profunda.orderCaveat', 7, 'order confirmed per school, may change; one may split across Fri 22 / Mon 25', 'El orden de las escuelas se confirma con cada una según su disponibilidad y puede cambiar. Una de ellas puede repartir sus dos días entre el viernes 22 y el lunes 25.'],
  ['mirada-profunda.preparation', 6, 'a real school challenge defined with FNE before travel', 'Antes de viajar · Tu pregunta. Cada participante define, con el equipo FNE, un desafío real de su colegio.'],
  ['mirada-profunda.closing', 6, '2027-01-29 roadmap presentation', 'El viernes 29 cada participante presenta qué va a mover en marzo y cómo.'],
  ['mirada-profunda.followUp', 6, 'April online session', 'En abril, una sesión online para revisar qué se implementó y ajustar el rumbo.'],
  ['mirada-profunda.lunches', 16, 'every programme day', 'En Mirada Profunda, todos los días del programa.'],
  ['mirada-profunda.includes', 16, ['acompañamiento para definir tu pregunta antes del viaje', 'sesión online de seguimiento en abril'], 'Mirada Profunda: acompañamiento para definir tu pregunta antes del viaje y sesión online de seguimiento en abril.'],
  ['mirada-profunda.takeaway', 3, 'Cómo se hace por dentro, y una hoja de ruta para marzo', 'Cómo se hace por dentro, y una hoja de ruta para marzo'],
  ['both.dayStructure', 8, ['Presentación del proyecto educativo y entrevista con la dirección', 'Visita guiada, entrevistas con estudiantes y educadores', 'Talleres con expertos del movimiento de Nueva Educación'], 'Las jornadas se ordenan siempre igual en las escuelas que nos reciben'],
  ['both.includes', 16, ['El pago de las visitas a las escuelas.', 'Los talleres de la tarde con especialistas.', 'Los honorarios de la dirección del programa, los relatores y el equipo de facilitadores de FNE que acompañan a los pasantes.', 'Bibliografía básica recomendada para preparar el viaje, una bitácora y un sistema de registro de los aprendizajes, presentado al menos un mes antes del viaje.', 'Desayuno a media mañana en las escuelas.'], 'EL PROGRAMA INCLUYE Todo esto, cubierto'],
  ['both.excludes', 16, ['Traslados colegio – aeropuerto de Santiago – colegio', 'Traslados en Barcelona, incluido el transporte a El Puig y Les Vinyes', 'Cenas', 'Almuerzos de la segunda semana (solo en la Pasantía INSPIRA)', 'Seguros', 'Pasajes y alojamiento, salvo que los coordines a través de FNE'], 'NO INCLUYE Lo que corre por tu cuenta'],
];
/** Brent's messages as the PM matched them in the transcript: [id, time UTC, verbatim text]. Never read back from the record. */
const BRENT_MESSAGES: Array<[string, string, string]> = [
  ['M1', '2026-10-09T00:36:27.557Z', 'The brochure is the source of truth'],
  ['M2', '2026-10-09T00:39:14.785Z', '1. the name is Jordi Musons / Same numbers for January / 4 visits / Confirm it'],
  ['M3', '2026-10-09T00:40:06.782Z', '2. it should publish my  design  3. handoff is confirmed'],
];
const RPA = 'Fundación Nueva Educación es Agencia Técnica Educativa certificada por RPA Mineduc.';
const TRACK_RECORD = '400+ Pasantes han viajado con FNE 40+ Colegios participantes 12 Escuelas catalanas en la red';
const VISITS = 'En la Pasantía INSPIRA, las cuatro escuelas de la segunda semana se definen con el grupo';
/**
 * The B001b pending fields Brent answered: [id, decision, field, page, answer, brochure original, record row, message,
 * Brent's words, topic word]. The basis is derived: `explicit` only if Brent's words contain the topic word.
 */
const REQUIRED_DECIDED: Array<[string, string, string, number, unknown, string, string, string, string, string]> = [
  ['P-01', 'DEC-01', 'inspira.host.sadako', 12, 'Jordi Musons', 'Jordi Mussons', 'BD-01', 'M2', 'the name is Jordi Musons', 'name'],
  ['P-02', 'DEC-02', 'cohort.claim.rpa', 2, RPA, RPA, 'BD-04', 'M2', 'Confirm it', 'RPA'],
  ['P-03', 'DEC-08', 'cohort.claim.trackRecord', 2, ['400+ Pasantes han viajado con FNE', '40+ Colegios participantes', '12 Escuelas catalanas en la red'], TRACK_RECORD, 'BD-02', 'M2', 'Same numbers for January', 'numbers'],
  ['P-04', 'DEC-03', 'inspira.visits.presentation', 9, '4 visits, chosen with the group from the five candidates (\'cuatro de estas cinco\'); never a fixed list of four', VISITS, 'BD-03', 'M2', '4 visits', 'visits'],
];
/** Record rows that are not contract fields: [row, message, Brent's words]. */
const OTHER_ANSWERS: Array<[string, string, string]> = [
  ['BD-00', 'M1', 'The brochure is the source of truth'], ['BD-05', 'M3', 'it should publish my  design'], ['BD-06', 'M3', 'handoff is confirmed'],
];
/** Register rows Brent's answers resolve, and the record row that resolves each. */
const RESOLVED_ROWS: Array<[string, string]> = [
  ['R-02', 'BD-01'], ['R-03', 'BD-04'], ['R-04', 'BD-02'], ['R-05', 'BD-03'], ['R-07', 'BD-05'], ['R-12', 'BD-06'],
];
const STILL_OPEN = ['R-08', 'R-11', 'R-17'];
const PM = 'pasant-02-pm0-2e20';
const ORDER = 'be973700';
const BASELINE = '76349909621bc07a1c7ab8242cd3c3ececaed152';
const A9_ORIGINALS = ['82bc0e7b79a750d07f62da7cc5b322eca4d0194e', '9008bacddcf40a79aa4c051b11ab3a5baf33939b'];
/** Prior accepted evidence and review files: SHA-256 at fb12545a9 (B001a/B001b). They must not change. */
const RETAINED: Array<[string, string]> = [
  ['docs/planning/reviews/fase-pasant-b001-contract-review-request.md', 'f5dcbcd33a960e5577f232ae86cfd6003d869ed0ccccaa75cfedfdbc21110266'],
  ['docs/planning/reviews/fase-pasant-b001-discovery-review-request.md', 'dd43c10375b6432310f040efa7b411b0677f2c8134c44629464d9a37381e98c0'],
  [`${EVIDENCE}/b001-a9-snapshot.md`, '94bb0b573a59fb8f7076991684d87ede36e5133637641daad3aa2bfdaa68040c'],
  [`${EVIDENCE}/b001-reconciliation.md`, '57c867495bc08dfa6fc6df9fb466baae97691ea5b01d9694207e200cf9960e8f'],
  [`${EVIDENCE}/b001-source-snapshot.md`, 'cc816e2930d10010ef8ab015f797298e12467f67f959e90234f9a31cedb1f156'],
  [`${EVIDENCE}/b001-fact-matrix.md`, '86a3c7f6dbf17a6957616b9526ff226e9da4bc5f3b664d07c83fe155a495b873'],
];
/** Page 15 ("Si viajan 1, 2 o 10") prices teams of 1 to 10 people: 10 sizes × 2 tiers = 20 rows. */
const TEAM_SIZES: [number, number] = [1, 10];

/** Fails on a missing, duplicated or unlisted key; returns the items keyed once. */
function keyed<T>(items: T[], key: (item: T) => string, required: string[], kind: string, errors: string[]): Map<string, T> {
  const byKey = new Map<string, T>();
  for (const item of items) {
    const k = key(item);
    if (byKey.has(k)) errors.push(`${k}: duplicate ${kind}`);
    else if (!required.includes(k)) errors.push(`${k}: unexpected ${kind}`);
    byKey.set(k, item);
  }
  for (const k of required) if (!byKey.has(k)) errors.push(`${k}: missing ${kind}`);
  return byKey;
}

/**
 * Contract ↔ pinned source: provenance, page integrity, every anchor and list item on its cited page, and the
 * required fact and pending sets with their pinned values, pages and source evidence.
 */
function checkFacts(contract: Contract, pages: Page[]): string[] {
  const errors: string[] = [];
  const pageText = (page: number) => squash(pages[page - 1]?.text ?? '');
  if (contract.status !== CANDIDATE) errors.push(`status ${contract.status}`);
  if (contract.source.sha256 !== SOURCE_SHA256) errors.push('source sha256 mismatch');
  for (const page of pages) if (sha256(page.text) !== page.sha256) errors.push(`p${page.page} text hash mismatch`);
  for (const fact of contract.facts) {
    const name = `${fact.program}.${fact.field} p${fact.page}`;
    const text = pageText(fact.page);
    if (!text.includes(squash(fact.anchor))) errors.push(`${name}: anchor not on page`);
    const items = 'value' in fact && Array.isArray(fact.value) ? fact.value : [];
    for (const item of items) if (!text.includes(squash(String(item)))) errors.push(`${name}: item ${item} not on page`);
  }
  const facts = keyed(contract.facts, (f) => `${f.program}.${f.field}`, REQUIRED_FACTS.map(([k]) => k), 'fact', errors);
  for (const [key, page, value, evidence] of REQUIRED_FACTS) {
    if (!pageText(page).includes(squash(evidence))) errors.push(`${key}: source evidence not on p${page}`);
    const fact = facts.get(key);
    if (!fact) continue;
    if (fact.page !== page) errors.push(`${key}: page ${fact.page}, source p${page}`);
    if (json(fact.value) !== json(value)) errors.push(`${key}: value ${json(fact.value)}, source ${json(value)}`);
  }
  return errors;
}

/**
 * Brent's answers: the record's messages and rows against the pinned transcript text, and every `decided` entry against
 * the pinned answer, the brochure original on its page, its record row, message time and derived basis.
 */
function checkDecisions(contract: Contract, recordDoc: string, pages: Page[]): string[] {
  const errors: string[] = [];
  const pageText = (page: number) => squash(pages[page - 1]?.text ?? '');
  const rows = new Map(recordDoc.split('\n').filter((l) => /^\| (M|BD-)\d/.test(l)).map(cells).map((c) => [c[0], c]));
  const messages = new Map(BRENT_MESSAGES.map(([id, at, text]) => [id, { at, text }]));
  for (const [id, at, text] of BRENT_MESSAGES) {
    if (json(rows.get(id)?.filter((_, i) => i === 1 || i === 3)) !== json([at, `"${text}"`])) errors.push(`${id}: record differs from transcript`);
  }
  const answers = [...REQUIRED_DECIDED.map((d) => [d[6], d[7], d[8]] as [string, string, string]), ...OTHER_ANSWERS];
  for (const [row, message, words] of answers) {
    const r = rows.get(row);
    if (!r) errors.push(`${row}: missing from record`);
    else if (r[2] !== message || r[3] !== words || !messages.get(message)?.text.includes(words)) errors.push(`${row}: words differ from ${message}`);
  }
  if (json(rows.get('BD-07')?.slice(3, 5)) !== json(['NOT GIVEN', '—'])) errors.push('BD-07: whole-contract approval must stay NOT GIVEN');
  for (const p of contract.pending ?? []) if (REQUIRED_DECIDED.some(([id]) => id === p.id)) errors.push(`${p.id}: answered but pending`);
  const decided = keyed(contract.decided ?? [], (d) => d.id, REQUIRED_DECIDED.map(([id]) => id), 'decided', errors);
  for (const [id, decision, field, page, value, brochure, row, message, words, topic] of REQUIRED_DECIDED) {
    const d = decided.get(id);
    if (!d) continue;
    if (json([d.decision, d.field, d.page]) !== json([decision, field, page])) errors.push(`${id}: ${json([d.decision, d.field, d.page])}, pinned ${json([decision, field, page])}`);
    if (json(d.value) !== json(value)) errors.push(`${id}: value ${json(d.value)}, pinned ${json(value)}`);
    if (d.brochure !== brochure || !pageText(page).includes(squash(brochure))) errors.push(`${id}: brochure original ${json(d.brochure)} is not the p${page} text`);
    if (!pageText(page).includes(squash(d.anchor ?? '\0'))) errors.push(`${id}: anchor not on p${page}`);
    for (const item of Array.isArray(d.value) ? d.value : []) if (!pageText(page).includes(squash(String(item)))) errors.push(`${id}: item ${item} not on page`);
    if (d.evidence !== row || d.at !== messages.get(message)?.at) errors.push(`${id}: evidence ${d.evidence} ${d.at}, pinned ${row} ${messages.get(message)?.at}`);
    const basis = words.includes(topic) ? 'explicit' : 'interpreted';
    if (d.basis !== basis || rows.get(row)?.[4] !== basis) errors.push(`${id}: basis ${d.basis}/${rows.get(row)?.[4]}, words give ${basis}`);
  }
  return errors;
}

/** Register: class vocabulary and evidence, Brent-resolved rows DECIDED with their dated words, open rows still open. */
function checkRegister(rows: Array<Record<'id' | 'topic' | 'cls' | 'evidence' | 'blocks' | 'route', string>>): string[] {
  const errors: string[] = [];
  const allowed = /^(SUPPLIED FACT|HISTORICAL RECORD|PLAN DEFAULT|ROUTINE FREEZE|RECOMMENDED|PM RECORD|UNRESOLVED|DECIDED)$/;
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const r of rows) {
    if (!allowed.test(r.cls)) errors.push(`${r.id}: class ${r.cls}`);
    if (r.cls === 'SUPPLIED FACT' && !/84d83e15 p\d+/.test(r.evidence)) errors.push(`${r.id}: no brochure page`);
    if (['PLAN DEFAULT', 'ROUTINE FREEZE', 'PM RECORD'].includes(r.cls) && !/plan rev 1/.test(r.evidence)) errors.push(`${r.id}: no plan authority`);
    if (r.cls === 'PM RECORD' && !(r.evidence.includes(PM) && r.evidence.includes(ORDER))) errors.push(`${r.id}: PM record without ${PM} order`);
    if (r.cls === 'DECIDED' && !/Brent \d{4}-\d{2}-\d{2}/.test(r.evidence)) errors.push(`${r.id}: DECIDED without dated Brent evidence`);
    if (['UNRESOLVED', 'RECOMMENDED'].includes(r.cls) && /^(—|none|)$/.test(r.route)) errors.push(`${r.id}: no route`);
    if (r.cls === 'UNRESOLVED' && /^(—|)$/.test(r.blocks)) errors.push(`${r.id}: blocks nothing`);
  }
  const chile = (utc: string) => `${new Date(Date.parse(utc) - 3 * 3_600_000).toISOString().slice(0, 19)}-03:00`;
  const answers = [...REQUIRED_DECIDED.map((d) => [d[6], d[7], d[8]]), ...OTHER_ANSWERS];
  for (const [id, bd] of RESOLVED_ROWS) {
    const [, message, words] = answers.find(([row]) => row === bd) ?? [];
    const at = BRENT_MESSAGES.find(([m]) => m === message)?.[1] ?? '';
    const r = byId.get(id);
    if (r?.cls !== 'DECIDED') errors.push(`${id}: answered by ${bd} but ${r?.cls ?? 'missing'}`);
    else if (!r.evidence.includes(`Brent ${chile(at)} "${words}" (\`b001-brent-decisions.md\` ${bd}`)) errors.push(`${id}: evidence does not cite ${bd}`);
  }
  for (const id of STILL_OPEN) if (byId.get(id)?.cls !== 'UNRESOLVED') errors.push(`${id}: must stay UNRESOLVED`);
  return errors;
}

/** Commercial facts: brochure text on pages 14–15, arithmetic recomputed from the contract's inputs, team range pinned. */
function checkPrices(c: Commercial, pages: Page[]): string[] {
  const errors: string[] = [];
  const p14 = squash(pages[13].text);
  const [standardTable, discountedTable] = squash(pages[14].text).split(squash('COLEGIOS CON PROGRAMA ANUAL DE ASESORÍA FNE EQUIPO'));
  const expect14 = (text: string) => { if (!p14.includes(squash(text))) errors.push(`p14 lacks "${text}"`); };
  const { inspira, 'mirada-profunda': mp } = c.programs;
  const [eurLow, eurHigh] = c.lodgingEur.doublePerPersonPerNight;
  expect14(`PASANTÍA INSPIRA ${clp(inspira.feeClp)} ${clp(inspira.discountedFeeClp)}`);
  expect14(`INSPIRA MIRADA PROFUNDA ${clp(mp.feeClp)} ${clp(mp.discountedFeeClp)}`);
  expect14(`Habitación doble: €${eurLow} a €${eurHigh} por persona por noche`);
  expect14(`Habitación single: aprox. €${c.lodgingEur.singlePerNightApprox} por noche`);
  expect14(`Santiago – Barcelona – Santiago: aprox. ${clp(c.flightClpApprox)}`);
  expect14(`calculados con el euro a ${clp(c.eurClp)}`);
  for (const [label, p] of [['Pasantía INSPIRA', inspira], ['INSPIRA Mirada Profunda', mp]] as const) {
    const { standard: [lo, hi], discounted: [dlo, dhi] } = p.perPersonClp;
    expect14(`${label} (${p.nights} noches) ${clp(lo)} a ${clp(hi)} ${clp(dlo)} a ${clp(dhi)}`);
    const nights = (Date.parse(p.returnDate) - Date.parse(c.arrivalDate)) / 86_400_000;
    if (nights !== p.nights) errors.push(`${label}: ${p.nights} nights but ${c.arrivalDate}→${p.returnDate} is ${nights}`);
    for (const [tier, fee] of [['standard', p.feeClp], ['discounted', p.discountedFeeClp]] as const) {
      const total = (eur: number) =>
        Math.round((fee + c.flightClpApprox + p.nights * eur * c.eurClp) / c.totalsRoundedToClp) * c.totalsRoundedToClp;
      const stated = p.perPersonClp[tier];
      if (total(eurLow) !== stated[0] || total(eurHigh) !== stated[1]) {
        errors.push(`${label} ${tier}: stated ${stated} but inputs give ${total(eurLow)},${total(eurHigh)}`);
      }
    }
  }
  if (inspira.feeClp !== mp.feeClp || inspira.discountedFeeClp !== mp.discountedFeeClp) errors.push('page 15 has one programme-only column');
  const [minTeam, maxTeam] = TEAM_SIZES;
  if (json(c.teamSizes) !== json(TEAM_SIZES)) errors.push(`team sizes ${json(c.teamSizes)}, source ${minTeam}–${maxTeam}`);
  if (!squash(pages[14].text).includes(squash(`Si viajan ${minTeam}, 2 o ${maxTeam}`))) errors.push('p15 lacks the team-size range');
  for (const [tier, table, fee] of [['standard', standardTable, inspira.feeClp], ['discounted', discountedTable, inspira.discountedFeeClp]] as const) {
    for (let n = minTeam; n <= maxTeam; n += 1) {
      const [ilo, ihi] = inspira.perPersonClp[tier];
      const [mlo, mhi] = mp.perPersonClp[tier];
      const row = `${n} persona${n > 1 ? 's' : ''} ${clp(n * fee)} ${clp(n * ilo)} a ${clp(n * ihi)} ${clp(n * mlo)} a ${clp(n * mhi)}`;
      if (!(table ?? '').includes(squash(row))) errors.push(`p15 ${tier} lacks "${row}"`);
    }
  }
  return errors;
}

const contractDoc = read(CONTRACT_PATH);
const contract = loadContract(CONTRACT_PATH);
const pages = fencedJson<{ pages: Page[] }>(read(`${EVIDENCE}/b001-source-snapshot.md`), 'snapshot').pages;
const registerDoc = read(`${EVIDENCE}/b001-contract-prerequisites.md`);
const recordDoc = read(RECORD_PATH);
const register = registerDoc.split('\n').filter((l) => l.startsWith('| R-')).map(cells)
  .map(([id, topic, cls, evidence, blocks, route]) => ({ id, topic, cls, evidence, blocks, route }));
const fact = (program: string, field: string) => contract.facts.find((f) => f.program === program && f.field === field)?.value;
const row = (topic: RegExp) => register.find((r) => topic.test(r.topic));
const NUMBER_WORDS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
const factIn = (c: Contract, key: string) => {
  const target = c.facts.find((f) => `${f.program}.${f.field}` === key);
  if (!target) throw new Error(`no fact ${key}`);
  return target;
};

describe('D1 — two-program facts from the pinned brochure', () => {
  it('is a candidate only: NOT RATIFIED, NOT ACTIVE, and no product surface or PLAN.md cites it yet', () => {
    expect(contractDoc).toContain(`Status: ${CANDIDATE}`);
    expect(contract.status).toBe(CANDIDATE);
    expect(read('docs/plan/PLAN.md')).not.toContain('pasantias-january-contract');
    for (const path of ['pages/pasantias.tsx', 'lib/pasantias/cohort-public.ts', 'lib/pasantias/cohort-commercial.ts']) {
      expect(read(path), path).not.toContain('pasantias-january-contract');
    }
  });

  it('freezes the program IDs as an ordinary implementation choice', () => {
    expect(contract.ids).toEqual({ cohort: 'enero-2027', programs: ['inspira', 'mirada-profunda'] });
    expect(contractDoc).toMatch(/ordinary implementation choice/);
  });

  it('every fact is anchored on its cited page — no invented claims', () => {
    expect(contract.facts.length).toBeGreaterThanOrEqual(40);
    expect(checkFacts(contract, pages)).toEqual([]);
  });

  it('pins every required value to its source evidence: January 2027 ISO days and counts appear in it', () => {
    expect(REQUIRED_FACTS).toHaveLength(41);
    for (const [key, , value, evidence] of REQUIRED_FACTS) {
      const text = squash(evidence).toLowerCase();
      const has = (token: string) => new RegExp(`(?<!\\d)${token}(?!\\d)`).test(text);
      for (const iso of typeof value === 'string' ? value.match(/\d{4}-\d{2}-\d{2}/g) ?? [] : []) {
        expect(iso, key).toMatch(/^2027-01-/);
        expect(has(String(Number(iso.slice(8)))), `${key} ${iso}`).toBe(true);
      }
      if (typeof value === 'number') expect(has(String(value)) || has(NUMBER_WORDS[value]), key).toBe(true);
    }
  });

  it.each<[string, unknown]>([
    ['cohort.span', '2027-01-18/2027-01-30'],
    ['inspira.dates', '2027-01-18/2027-01-29'],
    ['inspira.week1', '2030-02-01/2030-02-05 immersion'],
    ['inspira.freeDays', '2027-01-24/2027-01-25'],
    ['inspira.week2', '2027-01-25/2027-01-29 visits, one school per day'],
    ['inspira.visitCount', 5],
    ['inspira.visitCandidates', ['Institut Escola El Puig', 'Escola La Maquinista', 'Escola Octavio Paz', 'Institut Angeleta Ferrer']],
    ['inspira.visitSelection', 'fixed: the first four candidates'],
    ['mirada-profunda.schoolDays', 12],
    ['mirada-profunda.week1', '2027-01-19/2027-01-23 five school days'],
    ['mirada-profunda.week2', '2027-01-25/2027-01-28 five school days'],
    ['mirada-profunda.orderCaveat', 'fixed order'],
    ['mirada-profunda.preparation', 'optional, during the trip'],
    ['mirada-profunda.closing', '2030-02-01 roadmap presentation'],
    ['mirada-profunda.followUp', 'May online session'],
  ])('rejects a changed %s value even with its anchor intact', (key, value) => {
    const mutated = structuredClone(contract);
    factIn(mutated, key).value = value;
    expect(checkFacts(mutated, pages).some((e) => e.startsWith(`${key}: value ${json(value)}, source `))).toBe(true);
  });

  it.each<[string, (c: Contract) => void, string]>([
    ['a dropped fact', (c) => { c.facts = c.facts.filter((f) => !(f.program === 'mirada-profunda' && f.field === 'closing')); }, 'mirada-profunda.closing: missing fact'],
    ['a duplicated fact', (c) => { c.facts.push({ ...factIn(c, 'inspira.week1'), value: '2030-02-01/2030-02-05 immersion' }); }, 'inspira.week1: duplicate fact'],
    ['an unlisted fact', (c) => { c.facts.push({ program: 'cohort', field: 'claim', value: '400+', page: 1, anchor: '400+ PASANTES' }); }, 'cohort.claim: unexpected fact'],
    ['a fact without its value', (c) => { delete (factIn(c, 'inspira.week1') as Partial<Fact>).value; }, 'inspira.week1: value undefined, source "2027-01-18/2027-01-22 immersion"'],
    ['a fact moved to another page', (c) => { factIn(c, 'inspira.week1').page = 5; }, 'inspira.week1: page 5, source p4'],
  ])('rejects %s', (_name, mutate, error) => {
    const mutated = structuredClone(contract);
    mutate(mutated);
    expect(checkFacts(mutated, pages)).toContain(error);
  });

  it.each<[string, string, unknown]>([
    ['inspira', 'audience', 'Equipos que viajan por primera vez'],
    ['mirada-profunda', 'audience', 'Quienes ya viajaron con INSPIRA'],
    ['inspira', 'dates', '2027-01-18/2027-01-28'], ['inspira', 'schoolDays', 9], ['inspira', 'schoolCount', 6],
    ['mirada-profunda', 'dates', '2027-01-18/2027-01-29'], ['mirada-profunda', 'schoolDays', 10], ['mirada-profunda', 'schoolCount', 5],
    ['inspira', 'immersionSchools', ['Escola Virolai', 'Escola Sadako']], ['inspira', 'visitCount', 4],
    ['inspira', 'visitCandidates', ['Institut Escola El Puig', 'Escola La Maquinista', 'Escola Octavio Paz', 'Institut Angeleta Ferrer', 'Institut Escola Les Vinyes']],
    ['mirada-profunda', 'schools', ['Escola Virolai', 'Escola Sadako', 'Institut Angeleta Ferrer', 'Institut Escola El Puig', 'Institut Escola Les Vinyes']],
    ['inspira', 'freeDays', '2027-01-23/2027-01-24'], ['mirada-profunda', 'freeDays', '2027-01-23/2027-01-24'],
    ['inspira', 'lunches', 'week 1 only (Virolai, Sadako)'], ['mirada-profunda', 'lunches', 'every programme day'],
    ['mirada-profunda', 'followUp', 'April online session'],
  ])('%s.%s matches the plan/brochure expectation', (program, field, expected) => {
    expect(fact(program, field)).toEqual(expected);
  });

  it('keeps the four-of-five rule conditional and the immersion + visit schools within the six-school count', () => {
    expect(String(fact('inspira', 'visitSelection'))).toMatch(/^conditional/);
    expect(2 + Number(fact('inspira', 'visitCount'))).toBe(fact('inspira', 'schoolCount'));
  });

  it('covers includes and excludes for both programs and keeps the answered claims out of the brochure fact set', () => {
    expect(fact('both', 'includes')).toHaveLength(5);
    expect(fact('both', 'excludes')).toContain('Almuerzos de la segunda semana (solo en la Pasantía INSPIRA)');
    const published = contract.facts.map((f) => squash(f.anchor)).join('\n');
    for (const claim of ['RPA Mineduc', '400+ Pasantes', 'Jordi Mussons']) expect(published).not.toContain(squash(claim));
    expect(contract.decided.map((d) => d.decision)).toEqual(['DEC-01', 'DEC-02', 'DEC-08', 'DEC-03']);
    expect(contract.pending).toEqual([]);
  });
});

describe('D1/D2 — Brent\'s recorded corrections, independently pinned', () => {
  it('records every answer with its message, time, words and basis, and every decided field against them', () => {
    expect(checkDecisions(contract, recordDoc, pages)).toEqual([]);
  });

  it('keeps the brochure canonical: the typo stays original provenance and the correction differs from it', () => {
    const host = contract.decided.find((d) => d.id === 'P-01');
    for (const page of [4, 12]) expect(squash(pages[page - 1].text)).toContain(squash('Jordi Mussons'));
    expect(squash(pages.map((p) => p.text).join(''))).not.toContain(squash('Jordi Musons'));
    expect(host).toMatchObject({ brochure: 'Jordi Mussons', value: 'Jordi Musons' });
    expect(BRENT_MESSAGES[1][2]).toContain(String(host?.value));
    expect(read('docs/plan/PLAN.md')).toMatch(/\| A-6 \|[^\n]*Jordi Musons — Director, Escola Sadako/);
    expect(contract.source.sha256).toBe(SOURCE_SHA256);
  });

  it('"Same numbers for January" gives the October Appendix A-9 track record, as printed on page 2', () => {
    const row = read('docs/plan/PLAN.md').split('\n').find((l) => l.startsWith('| A-9 |')) ?? '';
    expect(row).toMatch(/OK \(Brent 2026-07-31\)/);
    const a9 = row.split('confirmed correct')[0];
    const numbers = (text: string) => text.match(/\d+\+?(?= ?(pasantes|colegios|escuelas))/gi);
    const decided = contract.decided.find((d) => d.id === 'P-03')?.value as string[];
    expect(numbers(decided.join(' '))).toEqual(numbers(a9));
    expect(numbers(a9)).toEqual(['400+', '40+', '12']);
  });

  it('"4 visits" keeps the conditional four-of-five semantics', () => {
    const visits = String(contract.decided.find((d) => d.id === 'P-04')?.value);
    expect(Number(visits.match(/^(\d+) visits/)?.[1])).toBe(fact('inspira', 'visitCount'));
    expect(visits).toContain('cuatro de estas cinco');
    expect(visits).toMatch(/never a fixed list/);
    expect(String(fact('inspira', 'visitSelection'))).toMatch(/^conditional/);
    expect(fact('inspira', 'visitCandidates')).toHaveLength(5);
  });

  it.each<[string, (c: Contract) => void, string]>([
    ['the brochure typo as the corrected host', (c) => { c.decided[0].value = 'Jordi Mussons'; }, 'P-01: value "Jordi Mussons", pinned "Jordi Musons"'],
    ['another host spelling', (c) => { c.decided[0].value = 'Jordi Musón'; }, 'P-01: value "Jordi Musón", pinned "Jordi Musons"'],
    ['the typo erased from provenance', (c) => { c.decided[0].brochure = 'Jordi Musons'; }, 'P-01: brochure original "Jordi Musons" is not the p12 text'],
    ['changed track-record numbers', (c) => { c.decided[2].value = ['500+ Pasantes han viajado con FNE', '40+ Colegios participantes', '12 Escuelas catalanas en la red']; }, 'P-03: item 500+ Pasantes han viajado con FNE not on page'],
    ['five visits', (c) => { c.decided[3].value = '5 visits, chosen with the group from the five candidates (\'cuatro de estas cinco\'); never a fixed list of four'; }, 'P-04: value'],
    ['a fixed list of four visits', (c) => { c.decided[3].value = 'fixed: Institut Escola El Puig, Escola La Maquinista, Escola Octavio Paz, Institut Angeleta Ferrer'; }, 'P-04: value'],
    ['the interpreted RPA answer relabelled explicit', (c) => { c.decided[1].basis = 'explicit'; }, 'P-02: basis explicit/interpreted, words give interpreted'],
    ['a missing record row', (c) => { c.decided[0].evidence = 'BD-99'; }, 'P-01: evidence BD-99 2026-10-09T00:39:14.785Z, pinned BD-01 2026-10-09T00:39:14.785Z'],
    ['a mismatched message time', (c) => { c.decided[2].at = '2026-10-09T00:40:06.782Z'; }, 'P-03: evidence BD-02 2026-10-09T00:40:06.782Z, pinned BD-02 2026-10-09T00:39:14.785Z'],
    ['an answer moved back to pending', (c) => { c.pending.push({ id: 'P-02' }); }, 'P-02: answered but pending'],
    ['a dropped answer', (c) => { c.decided = c.decided.filter((d) => d.id !== 'P-02'); }, 'P-02: missing decided'],
    ['a duplicated answer', (c) => { c.decided.push({ ...c.decided[0] }); }, 'P-01: duplicate decided'],
    ['an answer under another decision', (c) => { c.decided[3].decision = 'DEC-04'; }, 'P-04: ["DEC-04","inspira.visits.presentation",9], pinned ["DEC-03","inspira.visits.presentation",9]'],
    ['an absent decided block', (c) => { delete (c as Partial<Contract>).decided; }, 'P-01: missing decided'],
  ])('rejects %s', (_name, mutate, error) => {
    const mutated = structuredClone(contract);
    mutate(mutated);
    expect(checkDecisions(mutated, recordDoc, pages).some((e) => e.startsWith(error))).toBe(true);
  });

  it.each<[string, string, string, string]>([
    ['a corrected name put in Brent\'s mouth', 'the name is Jordi Musons |', 'the name is Jordi Mussons |', 'BD-01: words differ from M2'],
    ['a changed message time', '| M2 | 2026-10-09T00:39:14.785Z', '| M2 | 2026-10-09T00:39:15.785Z', 'M2: record differs from transcript'],
    ['a dropped record row', '| BD-06 |', '| XX-06 |', 'BD-06: missing from record'],
    ['an invented whole-contract approval', '| — | NOT GIVEN | — |', '| M3 | GIVEN | explicit |', 'BD-07: whole-contract approval must stay NOT GIVEN'],
    ['an interpreted answer recorded as explicit', '| Confirm it | interpreted |', '| Confirm it | explicit |', 'P-02: basis interpreted/explicit, words give interpreted'],
  ])('rejects a decision record with %s', (_name, from, to, error) => {
    expect(recordDoc).toContain(from);
    expect(checkDecisions(contract, recordDoc.replace(from, to), pages)).toContain(error);
  });

  it('rejects unsupported ratification and false canonical activation', () => {
    expect(checkFacts({ ...contract, status: 'CANDIDATE — RATIFIED — ACTIVE' }, pages)).toContain('status CANDIDATE — RATIFIED — ACTIVE');
    expect(recordDoc).toContain('**Whole-contract approval: NOT GIVEN.**');
    expect(contractDoc).toMatch(/Whole-contract approval: \*\*NOT GIVEN\*\* \(BD-07\)/);
    expect(contractDoc).toMatch(/the field answers in `decided` are recorded but are not that ratification/);
  });

  it('fails for an absent or malformed decision record', () => {
    expect(() => read('docs/plan/evidence/pasant-january/b001-brent-decisions-missing.md')).toThrow();
    const errors = checkDecisions(contract, '# no rows', pages);
    expect(errors).toEqual(expect.arrayContaining(['M1: record differs from transcript', 'BD-00: missing from record', 'BD-07: whole-contract approval must stay NOT GIVEN']));
  });
});

describe('D2 — independent price oracle for both programs', () => {
  it('CLP fees and discounts, EUR lodging, exchange rate, per-person totals and all 20 team rows match the brochure', () => {
    expect(checkPrices(contract.commercial, pages)).toEqual([]);
  });

  it.each<[string, (c: Commercial) => void]>([
    ['INSPIRA discounted fee', (c) => { c.programs.inspira.discountedFeeClp = 2_100_000; }],
    ['Mirada Profunda standard high total', (c) => { c.programs['mirada-profunda'].perPersonClp.standard[1] = 5_000_000; }],
    ['Mirada Profunda discounted high total', (c) => { c.programs['mirada-profunda'].perPersonClp.discounted[1] = 4_500_000; }],
    ['EUR lodging high', (c) => { c.lodgingEur.doublePerPersonPerNight[1] = 85; }],
    ['exchange rate', (c) => { c.eurClp = 1_000; }],
    ['Mirada Profunda nights', (c) => { c.programs['mirada-profunda'].nights = 12; }],
  ])('fails when one price input is mutated: %s', (_name, mutate) => {
    const mutated = structuredClone(contract.commercial);
    mutate(mutated);
    expect(checkPrices(mutated, pages).length).toBeGreaterThan(0);
  });

  it.each<[string, [number, number]]>([
    ['narrowed to one size', [1, 1]], ['reversed', [10, 1]], ['short at the top', [1, 9]], ['short at the bottom', [2, 10]], ['widened', [0, 11]],
  ])('rejects a team range %s even though the remaining rows match', (_name, sizes) => {
    const mutated = structuredClone(contract.commercial);
    mutated.teamSizes = sizes;
    expect(checkPrices(mutated, pages)).toContain(`team sizes ${json(sizes)}, source 1–10`);
  });

  const tiers = ['standard', 'discounted'] as const;
  it.each(tiers.flatMap((tier) => Array.from({ length: 10 }, (_, i) => [tier, i + 1] as const)))(
    'checks the %s row for %i people on page 15, whatever range the candidate states',
    (tier, n) => {
      const header = squash('COLEGIOS CON PROGRAMA ANUAL DE ASESORÍA FNE EQUIPO');
      const tables = squash(pages[14].text).split(header);
      const i = tiers.indexOf(tier);
      tables[i] = tables[i].replace(`${n}persona`, `${n}xpersona`);
      const corrupted = pages.map((p) => (p.page === 15 ? { ...p, text: tables.join(header) } : p));
      const narrowed = { ...contract.commercial, teamSizes: [1, 1] as [number, number] };
      for (const c of [contract.commercial, narrowed]) {
        expect(checkPrices(c, corrupted).some((e) => e.startsWith(`p15 ${tier} lacks "${n} persona`))).toBe(true);
      }
    },
  );

  it.each([['INSPIRA', '$45.000.000'], ['Mirada Profunda', '$46.000.000']])(
    'checks the %s column of the last discounted row',
    (_program, amount) => {
      const header = squash('COLEGIOS CON PROGRAMA ANUAL DE ASESORÍA FNE EQUIPO');
      const [standard, discounted] = squash(pages[14].text).split(header);
      const corrupted = pages.map((p) => (p.page === 15 ? { ...p, text: standard + header + discounted.replace(amount, '$1') } : p));
      expect(checkPrices(contract.commercial, corrupted).some((e) => e.startsWith('p15 discounted lacks "10 personas'))).toBe(true);
    },
  );

  it('keeps commercial facts brochure-only', () => {
    expect(contractDoc).toMatch(/"exposure": "brochure-only"/);
    expect(contractDoc).toMatch(/never in client bundles, pages,\s+the price-free ficha, transactional email or client fixtures/);
  });
});

describe('D3 — prerequisite register', () => {
  it.each([
    [/Muss?ons vs Muss?ons/], [/RPA/], [/four-of-five/], [/Designed versus generated/], [/packaging/i],
    [/Truthful registration and direct-access success copy/], [/Program IDs/], [/ratification/], [/D-05/],
  ])('tracks %s', (topic) => {
    expect(row(topic), String(topic)).toBeDefined();
  });

  it('classes every row, backs each class with its evidence, marks answered rows DECIDED and keeps open rows open', () => {
    expect(register.length).toBeGreaterThanOrEqual(19);
    expect(checkRegister(register)).toEqual([]);
    expect(row(/packaging/i)?.cls).toBe('PLAN DEFAULT');
    expect(row(/Program IDs/)?.cls).toBe('ROUTINE FREEZE');
    expect(row(/success copy/)?.cls).toBe('PLAN DEFAULT');
  });

  it.each<[string, string, Partial<Record<'cls' | 'evidence' | 'blocks' | 'route', string>>, string]>([
    ['an answered row labelled unanswered', 'R-02', { cls: 'UNRESOLVED' }, 'R-02: answered by BD-01 but UNRESOLVED'],
    ['an answered row citing no answer', 'R-07', { evidence: 'Brent 2026-10-08 said so' }, 'R-07: evidence does not cite BD-05'],
    ['an answer with the wrong time', 'R-12', { evidence: 'Brent 2026-10-08T21:39:14-03:00 "handoff is confirmed" (`b001-brent-decisions.md` BD-06)' }, 'R-12: evidence does not cite BD-06'],
    ['an invented ratification', 'R-11', { cls: 'DECIDED' }, 'R-11: must stay UNRESOLVED'],
    ['a D-05 release gate marked decided', 'R-08', { cls: 'DECIDED' }, 'R-08: must stay UNRESOLVED'],
    ['a PM record without the PM', 'R-13', { evidence: 'ACK under plan rev 1' }, `R-13: PM record without ${PM} order`],
    ['an unknown class', 'R-14', { cls: 'TAKEN OVER' }, 'R-14: class TAKEN OVER'],
    ['a DECIDED row without dated Brent evidence', 'R-06', { cls: 'DECIDED' }, 'R-06: DECIDED without dated Brent evidence'],
  ])('rejects %s', (_name, id, change, error) => {
    expect(checkRegister(register.map((r) => (r.id === id ? { ...r, ...change } : r)))).toContain(error);
  });

  it('separates actual Brent instructions from agent proposals and PM records', () => {
    expect(registerDoc).toContain('## 2. Actual Brent instructions versus agent proposals');
    expect(registerDoc).toContain('2026-10-08T19:54:57-03:00, flight deck: "Approved in the flight deck."');
    expect(registerDoc).toMatch(/BD-04 is interpreted; the rest name their topic\. Whole-contract approval was NOT GIVEN \(BD-07\)/);
    expect(registerDoc).toMatch(/Agent proposals, not instructions:/);
    expect(registerDoc).toMatch(/PM\s+records \(R-13 to R-15\) are routine choices under plan rev 1, not Brent decisions/);
  });
});

describe('D4 — A9 ownership and baseline', () => {
  const a9 = fencedJson<{ extracts: Array<{ path: string; lines: string[] }> }>(read(`${EVIDENCE}/b001-a9-snapshot.md`), 'a9');

  it('records Brent\'s handoff confirmation, keeps the superseded UNKNOWN finding linked, and the named PM ACK after it', () => {
    const release = row(/A9 writer release/);
    expect(release?.cls).toBe('DECIDED');
    expect(release?.evidence).toMatch(/BD-06, explicit\)\. Superseded PASANT-03 finding, kept: UNKNOWN in .*LEDGER\.md.*origin\/phase\/a9-verify/);
    const ack = row(/Receiver ACK/);
    expect(ack).toMatchObject({ cls: 'PM RECORD' });
    expect(ack?.evidence).toMatch(/follows R-12 and does not substitute for it/);
    expect(ack?.route).toMatch(/not takeover by inactivity/);
    expect(recordDoc).toMatch(new RegExp(`\\*\\*Receiver ACK\\*\\*: \`${PM}\` ACKs the Brent-confirmed A9 handoff \\(BD-06\\)`));
  });

  it('records the selected baseline and the relevant-path provenance port with exact refs, no code ported here', () => {
    const baseline = row(/Selected baseline/);
    expect(baseline?.cls).toBe('PM RECORD');
    expect(baseline?.evidence).toContain(BASELINE);
    const port = row(/relevant-path provenance port/);
    expect(port?.cls).toBe('PM RECORD');
    for (const sha of A9_ORIGINALS) expect(port?.evidence).toContain(sha);
    expect(port?.evidence).toMatch(/not the historical whole-19-commit cherry-pick/);
    expect(port?.route).toMatch(/later scoped B001 work, not B001c/);
    for (const sha of [BASELINE, ...A9_ORIGINALS]) expect(recordDoc).toContain(sha);
    expect(recordDoc).toContain('No code is ported in B001c.');
  });

  it('preserves A9 counters and the owner-row results exactly as the A9 LEDGER records them', () => {
    const counters = row(/A9 counters/);
    expect(counters?.cls).toBe('HISTORICAL RECORD');
    expect(counters?.evidence).toMatch(/r1–r4; Sol rounds 1, 2, 3 FAIL/);
    const ledger = a9.extracts.find((x) => x.path === 'docs/plan/LEDGER.md')?.lines.join('\n') ?? '';
    for (const [id, result] of [['A2-9', 'PASS'], ['A2-11', 'FAIL'], ['A2-12', 'FAIL'], ['A2-13', 'BLOCKED']]) {
      expect(ledger).toMatch(new RegExp(`${id} \\([^)]*\\) \\*\\*${result}\\*\\*`));
      expect(counters?.evidence).toContain(`${id} **${result}**`);
    }
  });
});

describe('D5 — historical boundaries and publication gate', () => {
  it('retains the October legal and consent decisions and excludes Correos with its backlog preserved', () => {
    const retained = contractDoc.split('## 6.')[1]?.split('## 7.')[0] ?? '';
    for (const id of ['D-01', 'D-02', 'D-03', 'D-04', 'D-11', 'D-12', 'A-10', 'A-13', 'A-14', 'A-15']) expect(retained, id).toContain(id);
    expect(retained).toMatch(/\*\*Excluded\*\*: Correos[\s\S]*backlog\s+is preserved, not cancelled/);
    expect(retained).toMatch(/must not\s+promise that an email was sent or will arrive/);
  });

  it('records the Brent-owned D-05 gate for designed publication and scopes what it blocks', () => {
    const gate = contractDoc.split('## 7.')[1] ?? '';
    for (const text of ['Brent approves the final file hash and the exact new-version object key', 'before the deployment that changes BROCHURE_VERSION', 'create-only']) {
      expect(squash(gate)).toContain(squash(text));
    }
    expect(gate).toMatch(/blocks only the release that changes BROCHURE_VERSION/);
    expect(row(/D-05/)?.blocks).toBe('only the release that changes BROCHURE_VERSION');
  });

  it('publishes the designed file and routes its "Mussons" typo to the Brent-owned release, not a local blocker', () => {
    const gate = squash(contractDoc.split('## 7.')[1]?.split('## 8.')[0] ?? '');
    for (const text of ['Publication mode (DEC-05) is **designed upload**', '"it should publish my design"', 'The designed file still spells the host "Mussons"', 'not a local development blocker', 'Brent supplies the corrected designed file']) {
      expect(gate).toContain(squash(text));
    }
    expect(row(/D-05/)?.evidence).toMatch(/still spells "Mussons"/);
    expect(row(/D-05/)?.route).toMatch(/^Brent-owned release: corrected designed file, final hash, object key, upload and verification; not a local development blocker$/);
  });

  it('offers a compact sign-off candidate that names exactly the open register rows and claims no approval', () => {
    const signoff = contractDoc.split('## 8.')[1] ?? '';
    expect(signoff).toMatch(/^ Sign-off candidate \(for Brent's Decide question — not an approval\)/);
    expect(register.filter((r) => r.cls === 'UNRESOLVED').map((r) => r.id)).toEqual(STILL_OPEN);
    for (const id of STILL_OPEN) expect(signoff).toContain(id);
    expect(signoff).toMatch(/BD-04 is interpreted/);
  });
});

describe('D6 — portable evidence', () => {
  it('reads only committed files: no lib/ imports, no git or PDF access, no skips', () => {
    const own = readFileSync(__filename, 'utf8').split('\n');
    const imports = own.filter((line) => line.startsWith('import ')).map((line) => line.match(/from '([^']+)'/)?.[1]);
    expect(imports).toEqual(['node:crypto', 'node:fs', 'node:path', 'vitest']);
    expect(own.filter((line) => /^\s*(it|describe|test)\.(skip|skipIf|todo|only)\b/.test(line))).toEqual([]);
  });

  it('fails for an absent or mismatched candidate', () => {
    expect(() => loadContract('docs/plan/pasantias-january-contract-missing.md')).toThrow();
    expect(() => fencedJson('# no data', 'empty')).toThrow(/no fenced json block/);
    expect(checkFacts({ ...contract, source: { ...contract.source, sha256: '0'.repeat(64) } }, pages)).toContain('source sha256 mismatch');
    expect(checkFacts({ ...contract, status: 'RATIFIED' }, pages)).toContain('status RATIFIED');
  });

  it('fails for corrupted source facts', () => {
    const corrupted = pages.map((p) => (p.page === 14 ? { ...p, text: p.text.replace(/€\s*7\s*5/, '€ 8 5') } : p));
    expect(checkFacts(contract, corrupted)).toContain('p14 text hash mismatch');
    expect(checkPrices(contract.commercial, corrupted).length).toBeGreaterThan(0);
    const moved = pages.map((p) => (p.page === 3 ? { ...p, text: p.text.replace(/1\s*0(\s*días\s*en\s*escuelas)/, '1 1$1') } : p));
    expect(checkFacts(contract, moved).some((e) => e.startsWith('mirada-profunda.dates'))).toBe(true);
  });

  it('leaves prior accepted evidence and review files byte-identical', () => {
    for (const [path, hash] of RETAINED) expect(sha256(read(path)), path).toBe(hash);
  });

  it('B001c review request names branch/base/count, risk groups, checks, 3–5 scrutiny areas and the retained full gates', () => {
    const request = read('docs/planning/reviews/fase-pasant-b001-corrections-review-request.md');
    for (const heading of ['## Branch', '## Objective and scope', '## Files by risk', '## Test evidence', '## Scrutinize', '## Known limitations']) {
      expect(request).toContain(heading);
    }
    expect(request).toContain('fb12545a9877726caf23dd2e6196f3865a9c33fc');
    expect(request).toContain(BASELINE);
    expect(request).toMatch(/B001 (remains|stays) open/);
    expect(request).toMatch(/npm run type-check, npm run lint, npm test and npm run build[^.]*deferred[^.]*never waived/);
    const areas = request.split('## Scrutinize')[1]?.split('## Known')[0].match(/^\d\. /gm)?.length ?? 0;
    expect(areas).toBeGreaterThanOrEqual(3);
    expect(areas).toBeLessThanOrEqual(5);
  });

  it('B001b review request names branch/base/count, scope, risk groups, evidence, scrutiny areas and limitations', () => {
    const request = read('docs/planning/reviews/fase-pasant-b001-contract-review-request.md');
    for (const heading of ['## Branch', '## Objective and scope', '## Files by risk', '## Test evidence', '## Scrutinize', '## Known limitations']) {
      expect(request).toContain(heading);
    }
    expect(request).toContain('0c8e5206afd51f4b8dbf81b2306f63e398edd819');
    expect(request).toMatch(/B001 (remains|stays) open/);
    expect(request.split('## Scrutinize')[1]?.split('## Known')[0].match(/^\d\. /gm)?.length).toBeGreaterThanOrEqual(3);
  });
});
