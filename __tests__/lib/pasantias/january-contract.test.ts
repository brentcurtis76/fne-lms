/**
 * PASANT-B001b — the January 2027 contract candidate and its prerequisite
 * register (docs/plan/pasantias-january-contract.md,
 * docs/plan/evidence/pasant-january/b001-contract-prerequisites.md).
 *
 * Independent oracle: expectations below are pinned from the approved PASANT
 * plan (rev 1, C002) and checked against the committed page-text snapshot of
 * the pinned brochure. Nothing is imported from lib/; prices are recomputed
 * from the contract's inputs and matched against the brochure's own text.
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

type Fact = { program: string; field: string; value: unknown; page: number; anchor: string };
type Pending = { id: string; decision: string; field: string; proposed: string; page: number; anchor: string };
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
  ids: { cohort: string; programs: string[] }; facts: Fact[]; pending: Pending[]; commercial: Commercial;
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
/** Pending (unpublishable) fields, pinned by identity: [id, decision, field, page]. */
const REQUIRED_PENDING: Array<[string, string, string, number]> = [
  ['P-01', 'DEC-01', 'inspira.host.sadako', 12], ['P-02', 'DEC-02', 'cohort.claim.rpa', 2],
  ['P-03', 'DEC-08', 'cohort.claim.trackRecord', 2], ['P-04', 'DEC-03', 'inspira.visits.presentation', 9],
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
  for (const fact of [...contract.facts, ...contract.pending]) {
    const name = `${'program' in fact ? fact.program : fact.id}.${fact.field} p${fact.page}`;
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
  const pending = keyed(contract.pending, (p) => p.id, REQUIRED_PENDING.map(([id]) => id), 'pending', errors);
  for (const [id, decision, field, page] of REQUIRED_PENDING) {
    const p = pending.get(id);
    if (p && json([p.decision, p.field, p.page]) !== json([decision, field, page])) {
      errors.push(`${id}: ${json([p.decision, p.field, p.page])}, pinned ${json([decision, field, page])}`);
    }
  }
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

  it('every fact and pending field is anchored on its cited page — no invented claims', () => {
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
    ['a dropped pending field', (c) => { c.pending = c.pending.filter((p) => p.id !== 'P-02'); }, 'P-02: missing pending'],
    ['a duplicated pending field', (c) => { c.pending.push({ ...c.pending[0] }); }, 'P-01: duplicate pending'],
    ['a pending field under another decision', (c) => { c.pending[3].decision = 'DEC-04'; }, 'P-04: ["DEC-04","inspira.visits.presentation",9], pinned ["DEC-03","inspira.visits.presentation",9]'],
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

  it('covers includes and excludes for both programs and holds unverified claims as pending', () => {
    expect(fact('both', 'includes')).toHaveLength(5);
    expect(fact('both', 'excludes')).toContain('Almuerzos de la segunda semana (solo en la Pasantía INSPIRA)');
    const published = contract.facts.map((f) => squash(f.anchor)).join('\n');
    for (const claim of ['RPA Mineduc', '400+ Pasantes', 'Jordi Mussons']) expect(published).not.toContain(squash(claim));
    expect(contract.pending.map((p) => p.decision)).toEqual(['DEC-01', 'DEC-02', 'DEC-08', 'DEC-03']);
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
  const allowed = /^(SUPPLIED FACT|HISTORICAL RECORD|PLAN DEFAULT|ROUTINE FREEZE|RECOMMENDED|UNRESOLVED|DECIDED)$/;

  it.each([
    [/Muss?ons vs Muss?ons/], [/RPA/], [/four-of-five/], [/Designed versus generated/], [/packaging/i],
    [/Truthful registration and direct-access success copy/], [/Program IDs/], [/ratification/], [/D-05/],
  ])('tracks %s', (topic) => {
    expect(row(topic), String(topic)).toBeDefined();
  });

  it('classes every row and backs each class with the evidence it requires', () => {
    expect(register.length).toBeGreaterThanOrEqual(19);
    for (const r of register) {
      expect(r.cls, r.id).toMatch(allowed);
      if (r.cls === 'SUPPLIED FACT') expect(r.evidence, r.id).toMatch(/84d83e15 p\d+/);
      if (r.cls === 'PLAN DEFAULT' || r.cls === 'ROUTINE FREEZE') expect(r.evidence, r.id).toMatch(/plan rev 1/);
      if (r.cls === 'DECIDED') expect(r.evidence, r.id).toMatch(/Brent \d{4}-\d{2}-\d{2}/);
      if (r.cls === 'UNRESOLVED' || r.cls === 'RECOMMENDED') expect(r.route, r.id).not.toMatch(/^(—|none|)$/);
      if (r.cls === 'UNRESOLVED') expect(r.blocks, r.id).not.toMatch(/^(—|)$/);
    }
  });

  it('leaves Brent-owned corrections unresolved without dated Brent evidence', () => {
    for (const topic of [/Muss?ons/, /RPA/, /four-of-five/, /Designed versus generated/, /ratification/, /D-05/]) {
      const r = row(topic);
      if (r?.cls !== 'DECIDED') expect(r?.cls, String(topic)).toBe('UNRESOLVED');
    }
    expect(row(/packaging/i)?.cls).toBe('PLAN DEFAULT');
    expect(row(/Program IDs/)?.cls).toBe('ROUTINE FREEZE');
    expect(row(/success copy/)?.cls).toBe('PLAN DEFAULT');
  });

  it('separates actual Brent instructions from agent proposals', () => {
    expect(registerDoc).toContain('## 2. Actual Brent instructions versus agent proposals');
    expect(registerDoc).toContain('2026-10-08T19:54:57-03:00, flight deck: "Approved in the flight deck."');
    expect(registerDoc).toMatch(/Agent proposals, not instructions:/);
  });
});

describe('D4 — A9 ownership and baseline', () => {
  const a9 = fencedJson<{ extracts: Array<{ path: string; lines: string[] }> }>(read(`${EVIDENCE}/b001-a9-snapshot.md`), 'a9');

  it('records writer release and receiver ACK as UNKNOWN with searched locations; an ACK cannot stand in for a release', () => {
    const release = row(/A9 writer release/);
    const ack = row(/Receiver ACK/);
    for (const r of [release, ack]) expect(r?.cls).toBe('UNRESOLVED');
    expect(release?.evidence).toMatch(/^UNKNOWN\. Searched: .*LEDGER\.md.*origin\/phase\/a9-verify/);
    expect(ack?.evidence).toMatch(/^UNKNOWN .*cannot substitute for the previous writer's release/);
  });

  it('recommends the refreshed 76349909 baseline and a relevant-path provenance port, without takeover', () => {
    expect(row(/Selected baseline/)).toMatchObject({ cls: 'RECOMMENDED' });
    expect(row(/Selected baseline/)?.evidence).toContain('76349909');
    const port = row(/relevant-path provenance port/);
    expect(port?.cls).toBe('RECOMMENDED');
    expect(port?.evidence).toMatch(/not the historical whole-19-commit cherry-pick/);
    expect(port?.route).toMatch(/only after R-12 and R-13/);
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

  it('review request names branch/base/count, scope, risk groups, evidence, scrutiny areas and limitations', () => {
    const request = read('docs/planning/reviews/fase-pasant-b001-contract-review-request.md');
    for (const heading of ['## Branch', '## Objective and scope', '## Files by risk', '## Test evidence', '## Scrutinize', '## Known limitations']) {
      expect(request).toContain(heading);
    }
    expect(request).toContain('0c8e5206afd51f4b8dbf81b2306f63e398edd819');
    expect(request).toMatch(/B001 (remains|stays) open/);
    expect(request.split('## Scrutinize')[1]?.split('## Known')[0].match(/^\d\. /gm)?.length).toBeGreaterThanOrEqual(3);
  });
});
