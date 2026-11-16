// Invented sample content: courses, lessons, blocks, learning paths, upcoming courses, quizzes, assignments.
// Areas 02-panel (course parts of /dashboard), 03-aprendizaje, 04-cursos, 05-tareas.
//
// Id space: UUIDs 5eed0010-0000-4000-8000-00000000XXXX. No integer ids are needed.
// Safe to run twice: every row has a fixed id. Tables whose triggers stamp now() on UPDATE (lesson_assignments,
// lesson_assignment_submissions, upcoming_courses) and tables whose UPDATE fires side effects (lesson_progress
// recomputes the enrolment) are written insert-if-missing, so a second run touches nothing there.
import { deflateSync } from 'node:zlib';
import { stack } from '../lib.mjs';

export const name = 'cursos, aprendizaje y tareas';

const id = (n) => `5eed0010-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

// ---------------------------------------------------------------- ids
const I = { inst1: id(0x001), inst2: id(0x002) };
const C = { c1: id(0x101), c2: id(0x102), c3: id(0x103), c4: id(0x104), c5: id(0x105) };
const M = { m1: id(0x201), m2: id(0x202), m3: id(0x203), m4: id(0x204) };
const L = {};
for (let i = 1; i <= 12; i++) L[`l${i}`] = id(0x300 + i);
const B = {}; // blocks: filled as they are defined
const P = { p1: id(0x801), p2: id(0x802), p3: id(0x803) };
const G = { g1: id(0xc01), g2: id(0xc02), g3: id(0xc03), g4: id(0xc04), g5: id(0xc05), g6: id(0xc06) };
const LA = { la1: id(0xb01), la2: id(0xb02), la3: id(0xb03), la4: id(0xb04), la5: id(0xb05), la6: id(0xb06) };
const QS = { qs1: id(0xa01), qs2: id(0xa02), qs3: id(0xa03), qs4: id(0xa04) };
const THREAD = id(0xd01);
const COMMUNITY = 'e2e00000-0000-4000-8000-000000000c01'; // fixture community (primary school)
const SCHOOL = 990001;

const ts = (d) => new Date(d).toISOString();

// ---------------------------------------------------------------- tiny local files (image + PDF)
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(w, h, [r, g, b], [r2, g2, b2]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      const band = y > h * 0.62; // a flat two-band picture: sky and floor
      raw[o] = band ? r2 : r; raw[o + 1] = band ? g2 : g; raw[o + 2] = band ? b2 : b;
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function pdf(text) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = `BT /F1 14 Tf 60 780 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const BUCKET = 'course-assets';
const FILES = {
  aula: { path: 'harness/10-cursos/aula-sintetica.png', type: 'image/png', body: () => png(480, 270, [186, 214, 235], [222, 196, 160]) },
  patio: { path: 'harness/10-cursos/patio-sintetico.png', type: 'image/png', body: () => png(480, 270, [204, 228, 200], [170, 170, 170]) },
  rubrica: { path: 'harness/10-cursos/rubrica-sintetica.pdf', type: 'application/pdf', body: () => pdf('Rubrica sintetica E2E - documento de prueba') },
  pauta: { path: 'harness/10-cursos/pauta-observacion-sintetica.pdf', type: 'application/pdf', body: () => pdf('Pauta de observacion sintetica E2E') },
};
let FILE_URL = {};
function fileUrls() {
  const base = stack().API_URL.replace(/\/$/, '');
  FILE_URL = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, `${base}/storage/v1/object/public/${BUCKET}/${f.path}`]));
}

// ---------------------------------------------------------------- helpers
async function put(supabase, table, rows, { onConflict = 'id', ignore = false } = {}) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict, ignoreDuplicates: ignore });
  if (error) throw new Error(`${table}: ${error.message}`);
}

// ---------------------------------------------------------------- content
const html = (...parts) => parts.join('');

function courses(u) {
  const base = {
    created_by: u.admin, is_self_paced: true, thumbnail_url: null,
    prerequisites: [], completion_criteria: { requires_all_lessons: true, overall_passing_score: 70 }, analytics_data: {},
  };
  return [
    { ...base, id: C.c1, created_at: ts('2026-10-01T10:00:00-03:00'), status: 'published', structure_type: 'structured',
      title: 'Curso Sintetico E2E — Evaluación formativa en el aula',
      description: 'Herramientas prácticas para recoger evidencia del aprendizaje durante la clase y retroalimentar a tiempo. Curso de prueba con contenido inventado.',
      instructor_id: I.inst1, estimated_duration_hours: 12, difficulty_level: 'intermediate',
      learning_objectives: ['Diseñar preguntas que hagan visible el pensamiento', 'Usar rúbricas para retroalimentar', 'Ajustar la clase según la evidencia'] },
    { ...base, id: C.c2, created_at: ts('2026-10-02T10:00:00-03:00'), status: 'published', structure_type: 'simple',
      title: 'Curso Sintetico E2E — Convivencia escolar y clima de aula',
      description: 'Acuerdos de convivencia, rutinas y manejo de conflictos en la sala. Curso de prueba con contenido inventado.',
      instructor_id: I.inst2, estimated_duration_hours: 6, difficulty_level: 'beginner',
      learning_objectives: ['Construir acuerdos de aula con el curso', 'Prevenir y abordar conflictos'] },
    { ...base, id: C.c3, created_at: ts('2026-10-03T10:00:00-03:00'), status: 'published', structure_type: 'structured',
      title: 'Curso Sintetico E2E — Aprendizaje basado en proyectos',
      description: 'Cómo planificar, acompañar y evaluar un proyecto interdisciplinario de cuatro semanas. Curso de prueba con contenido inventado.',
      instructor_id: I.inst1, estimated_duration_hours: 10, difficulty_level: 'intermediate',
      learning_objectives: ['Formular una pregunta guía', 'Planificar hitos y productos'] },
    { ...base, id: C.c4, created_at: ts('2026-10-04T10:00:00-03:00'), status: 'published', structure_type: 'structured',
      title: 'Curso Sintetico E2E — Liderazgo pedagógico',
      description: 'Acompañamiento docente, observación de clases y conversaciones de retroalimentación entre pares. Curso de prueba con contenido inventado.',
      instructor_id: I.inst2, estimated_duration_hours: 8, difficulty_level: 'advanced',
      learning_objectives: ['Observar clases con foco', 'Conducir conversaciones de retroalimentación'] },
    { ...base, id: C.c5, created_at: ts('2026-11-05T10:00:00-03:00'), status: 'draft', structure_type: 'simple',
      title: 'Curso Sintetico E2E — Lectura en voz alta (borrador)',
      description: 'Borrador de un curso breve sobre lectura compartida en primer ciclo. Curso de prueba con contenido inventado.',
      instructor_id: I.inst2, estimated_duration_hours: 3, difficulty_level: 'beginner', learning_objectives: [] },
  ];
}

const modules = () => [
  { id: M.m1, course_id: C.c1, title: 'Módulo 1 — Hacer visible el aprendizaje', description: 'Preguntas, tickets de salida y evidencia en la clase.', order_number: 1, order: 1, created_at: ts('2026-10-01T10:05:00-03:00') },
  { id: M.m2, course_id: C.c1, title: 'Módulo 2 — Retroalimentar para avanzar', description: 'Rúbricas, comentarios y ajustes a la planificación.', order_number: 2, order: 2, created_at: ts('2026-10-01T10:06:00-03:00') },
  { id: M.m3, course_id: C.c3, title: 'Módulo 1 — Diseñar el proyecto', description: 'Pregunta guía, producto final e hitos.', order_number: 1, order: 1, created_at: ts('2026-10-03T10:05:00-03:00') },
  { id: M.m4, course_id: C.c4, title: 'Módulo 1 — Observar y conversar', description: 'Observación de aula y retroalimentación entre pares.', order_number: 1, order: 1, created_at: ts('2026-10-04T10:05:00-03:00') },
];

function lessons() {
  const l = (key, course_id, module_id, order_number, title, minutes, created) => ({
    id: L[key], course_id, module_id, order_number, title, estimated_duration_minutes: minutes,
    lesson_type: 'standard', is_mandatory: true, created_at: ts(created),
  });
  return [
    l('l1', C.c1, M.m1, 1, 'Lección 1 — Preguntas que hacen pensar', 45, '2026-10-01T10:10:00-03:00'),
    l('l2', C.c1, M.m1, 2, 'Lección 2 — Tickets de salida', 25, '2026-10-01T10:11:00-03:00'),
    l('l3', C.c1, M.m2, 1, 'Lección 3 — Rúbricas compartidas', 35, '2026-10-01T10:12:00-03:00'),
    l('l4', C.c1, M.m2, 2, 'Lección 4 — Ajustar la planificación', 20, '2026-10-01T10:13:00-03:00'),
    l('l5', C.c2, null, 1, 'Lección 1 — Acuerdos de convivencia', 20, '2026-10-02T10:10:00-03:00'),
    l('l6', C.c2, null, 2, 'Lección 2 — Rutinas que ordenan la clase', 20, '2026-10-02T10:11:00-03:00'),
    l('l7', C.c2, null, 3, 'Lección 3 — Cuando aparece un conflicto', 25, '2026-10-02T10:12:00-03:00'),
    l('l8', C.c3, M.m3, 1, 'Lección 1 — La pregunta guía', 30, '2026-10-03T10:10:00-03:00'),
    l('l9', C.c3, M.m3, 2, 'Lección 2 — Hitos y productos', 30, '2026-10-03T10:11:00-03:00'),
    l('l10', C.c4, M.m4, 1, 'Lección 1 — Observación con foco', 30, '2026-10-04T10:10:00-03:00'),
    l('l11', C.c4, M.m4, 2, 'Lección 2 — Conversaciones de retroalimentación', 30, '2026-10-04T10:11:00-03:00'),
    l('l12', C.c5, null, 1, 'Lección 1 — Elegir el texto', 15, '2026-11-05T10:10:00-03:00'),
  ];
}

// The quiz of lesson 1: one multiple choice, one true/false, one open question (so a reviewer has work).
const QUIZ = {
  title: 'Quiz — Preguntas abiertas y cerradas',
  description: 'Comprueba lo que aprendiste en esta lección.',
  instructions: 'Responde las tres preguntas. La pregunta abierta la revisa tu consultor.',
  questions: [
    { id: 'q1', type: 'multiple-choice', points: 2, question: '¿Qué tipo de pregunta invita más a explicar el razonamiento?',
      options: [{ id: 'q1a', text: '¿Cuál es la respuesta correcta?', isCorrect: false },
        { id: 'q1b', text: '¿Cómo llegaste a esa respuesta?', isCorrect: true },
        { id: 'q1c', text: '¿Terminaste la guía?', isCorrect: false }],
      explanation: 'Pedir el camino hace visible el pensamiento.' },
    { id: 'q2', type: 'true-false', points: 1, question: 'Un ticket de salida debe calificarse siempre con nota.',
      options: [{ id: 'q2t', text: 'Verdadero', isCorrect: false }, { id: 'q2f', text: 'Falso', isCorrect: true }],
      explanation: 'Su propósito es recoger evidencia, no calificar.' },
    { id: 'q3', type: 'open-ended', points: 5, question: 'Describe una pregunta que usarías mañana en tu clase y qué esperas observar.',
      options: [], characterLimit: 800,
      gradingGuidelines: 'Valorar que la pregunta sea abierta y que se indique qué evidencia se espera.',
      expectedAnswer: 'Una pregunta abierta ligada al objetivo, con una descripción concreta de la evidencia esperada.' },
  ],
  totalPoints: 8, allowRetries: true, showResults: true, randomizeQuestions: false, randomizeAnswers: false,
};

function blocks() {
  const out = [];
  let n = 0x400;
  const b = (key, lesson, course, position, type, payload, minutes = 5) => {
    B[key] = id(++n);
    out.push({ id: B[key], lesson_id: lesson, course_id: course, position, type, payload,
      estimated_duration_minutes: minutes, interaction_required: true, is_visible: true, block_weight: 1.0,
      completion_tracking: { track_time: true, track_interaction: true }, analytics_data: {} });
  };
  const text = (title, ...p) => ({ title, content: html(...p) });
  const video = (title, v) => ({ title, url: `https://www.youtube.com/watch?v=${v}`, caption: 'Video de prueba (sin contenido real).' });

  // Lesson 1 of course 1: every block type the player knows.
  b('l1Text', L.l1, C.c1, 0, 'text', text('¿Por qué preguntar distinto?',
    '<h2>Preguntas que hacen pensar</h2>',
    '<p>Las preguntas cerradas nos dicen <strong>si</strong> el curso llegó a la respuesta; las preguntas abiertas nos muestran <em>cómo</em> llegó. En esta lección revisamos tres tipos de preguntas y practicamos cómo usarlas en los primeros minutos de la clase.</p>',
    '<ul><li>Preguntas de razonamiento: «¿cómo lo supiste?»</li><li>Preguntas de comparación: «¿en qué se parecen?»</li><li>Preguntas de transferencia: «¿dónde más sirve esto?»</li></ul>',
    '<p>Al final de la lección vas a diseñar una pregunta para tu próxima clase.</p>'), 8);
  b('l1Video', L.l1, C.c1, 1, 'video', video('Una clase con preguntas abiertas', 'E2Esint0001'), 12);
  b('l1Image', L.l1, C.c1, 2, 'image', { title: 'Organización de la sala', images: [
    { id: 'img1', src: FILE_URL.aula, alt: 'Esquema de una sala con mesas en grupos', caption: 'Mesas en grupos de cuatro para conversar.' },
    { id: 'img2', src: FILE_URL.patio, alt: 'Esquema de un patio con zonas de juego', caption: 'Zonas del patio para actividades al aire libre.' }] }, 3);
  b('l1Quiz', L.l1, C.c1, 3, 'quiz', QUIZ, 10);
  b('l1Download', L.l1, C.c1, 4, 'download', { title: 'Material para descargar', description: 'Plantillas para usar en tu clase.',
    allowBulkDownload: true, requireAuth: true, files: [
      { id: 'f1', name: 'Rúbrica de preguntas abiertas.pdf', originalName: 'rubrica-sintetica.pdf', url: FILE_URL.rubrica, size: 1024, type: 'application/pdf', description: 'Rúbrica de cuatro niveles.', uploadedAt: ts('2026-10-01T10:20:00-03:00') },
      { id: 'f2', name: 'Pauta de observación.pdf', originalName: 'pauta-observacion-sintetica.pdf', url: FILE_URL.pauta, size: 980, type: 'application/pdf', description: 'Pauta para observar una clase entre pares.', uploadedAt: ts('2026-10-01T10:21:00-03:00') }] }, 2);
  b('l1Links', L.l1, C.c1, 5, 'external-links', { title: 'Para profundizar', description: 'Lecturas y recursos complementarios (enlaces de prueba).',
    groupByCategory: true, showThumbnails: false, showDescriptions: true, links: [
      { id: 'k1', title: 'Guía de preguntas para la clase', url: 'https://recursos.example.org/guia-preguntas', description: 'Ejemplos por asignatura.', category: 'Lecturas', openInNewTab: true, isActive: true },
      { id: 'k2', title: 'Banco de tickets de salida', url: 'https://recursos.example.org/tickets-salida', description: 'Formatos listos para imprimir.', category: 'Herramientas', openInNewTab: true, isActive: true },
      { id: 'k3', title: 'Artículo: la evaluación como conversación', url: 'https://recursos.example.org/evaluacion-conversacion', description: 'Lectura de diez minutos.', category: 'Lecturas', openInNewTab: true, isActive: true }] }, 5);
  b('l1Group', L.l1, C.c1, 6, 'group-assignment', { title: 'Tarea grupal — Banco de preguntas del ciclo',
    description: 'En grupo, reúnan diez preguntas abiertas que hayan funcionado en sus clases.',
    instructions: 'Cada integrante aporta al menos dos preguntas y explica en qué momento de la clase la usó. Entreguen un documento único.',
    resources: [{ id: 'r1', type: 'link', title: 'Plantilla del banco de preguntas', url: 'https://recursos.example.org/plantilla-banco', description: 'Copien la plantilla y complétenla.' }] }, 30);
  b('l1Biblio', L.l1, C.c1, 7, 'bibliography', { title: 'Bibliografía y recursos', description: 'Referencias inventadas para la prueba.',
    showCategories: true, sortBy: 'manual', items: [
      { id: 'bi1', type: 'pdf', title: 'Rúbrica de preguntas abiertas', description: 'Documento de apoyo.', url: FILE_URL.rubrica, author: 'Equipo Sintetico E2E', year: '2026', category: 'Documentos', filename: 'rubrica-sintetica.pdf', filesize: 1024 },
      { id: 'bi2', type: 'link', title: 'Evaluar para aprender: notas de clase', description: 'Apunte breve.', url: 'https://recursos.example.org/notas-evaluar', author: 'Autora Sintetica', year: '2025', category: 'Lecturas' },
      { id: 'bi3', type: 'image', title: 'Esquema de sala en grupos', description: 'Imagen de referencia.', url: FILE_URL.aula, author: 'Equipo Sintetico E2E', year: '2026', category: 'Imágenes' }] }, 3);

  b('l2Text', L.l2, C.c1, 0, 'text', text('Qué es un ticket de salida',
    '<h2>Tickets de salida</h2><p>Un ticket de salida es una pregunta breve que el curso responde en los últimos cinco minutos. Sirve para decidir cómo empieza la clase siguiente.</p>'), 6);
  b('l2Video', L.l2, C.c1, 1, 'video', video('Tres tickets de salida en acción', 'E2Esint0002'), 10);
  b('l2Download', L.l2, C.c1, 2, 'download', { title: 'Plantilla de ticket', description: 'Imprime y recorta.', allowBulkDownload: false, requireAuth: true, files: [
    { id: 'f3', name: 'Plantilla de ticket de salida.pdf', originalName: 'rubrica-sintetica.pdf', url: FILE_URL.rubrica, size: 1024, type: 'application/pdf', uploadedAt: ts('2026-10-01T10:22:00-03:00') }] }, 2);

  b('l3Text', L.l3, C.c1, 0, 'text', text('Rúbricas que se entienden',
    '<h2>Rúbricas compartidas</h2><p>Una rúbrica sirve cuando el curso la entiende antes de empezar. Revisamos cómo escribir descriptores en lenguaje de estudiante.</p>'), 8);
  b('l3Group', L.l3, C.c1, 1, 'group-assignment', { title: 'Tarea grupal — Rúbrica para una tarea real',
    description: 'Construyan juntos una rúbrica de cuatro niveles para una tarea de su asignatura.',
    instructions: 'Elijan una tarea que vayan a aplicar este mes. Escriban los descriptores y pruébenlos con dos trabajos de ejemplo.', resources: [] }, 40);
  b('l3Links', L.l3, C.c1, 2, 'external-links', { title: 'Ejemplos de rúbricas', groupByCategory: false, showThumbnails: false, showDescriptions: true, links: [
    { id: 'k4', title: 'Rúbricas de escritura', url: 'https://recursos.example.org/rubricas-escritura', description: 'Primer y segundo ciclo.', openInNewTab: true, isActive: true }] }, 4);

  b('l4Text', L.l4, C.c1, 0, 'text', text('De la evidencia a la decisión',
    '<h2>Ajustar la planificación</h2><p>Con la evidencia de la semana, decide qué repasar, qué acelerar y a quién acompañar de cerca.</p>'), 8);
  b('l4Video', L.l4, C.c1, 1, 'video', video('Una reunión de planificación', 'E2Esint0003'), 12);

  // Course 2 (simple, lessons directly under the course).
  b('l5Text', L.l5, C.c2, 0, 'text', text('Construir acuerdos', '<h2>Acuerdos de convivencia</h2><p>Los acuerdos funcionan cuando el curso participa en escribirlos y los revisa cada mes.</p>'), 8);
  b('l5Video', L.l5, C.c2, 1, 'video', video('Asamblea de curso', 'E2Esint0004'), 10);
  b('l6Text', L.l6, C.c2, 0, 'text', text('Rutinas', '<h2>Rutinas que ordenan</h2><p>Entrada, cambio de actividad y cierre: tres rutinas que ahorran tiempo de clase.</p>'), 8);
  b('l6Image', L.l6, C.c2, 1, 'image', { title: 'La sala al comenzar', images: [{ id: 'img3', src: FILE_URL.aula, alt: 'Esquema de sala', caption: 'Materiales listos antes de la entrada.' }] }, 2);
  b('l7Text', L.l7, C.c2, 0, 'text', text('Conflictos', '<h2>Cuando aparece un conflicto</h2><p>Escuchar a cada parte, nombrar lo ocurrido y acordar una reparación.</p>'), 10);
  b('l7Biblio', L.l7, C.c2, 1, 'bibliography', { title: 'Lecturas', showCategories: false, sortBy: 'title', items: [
    { id: 'bi4', type: 'link', title: 'Mediación entre estudiantes', url: 'https://recursos.example.org/mediacion', author: 'Autor Sintetico', year: '2024' }] }, 3);

  // Course 3 (not started by the docente) — holds a group assignment with no group yet.
  b('l8Text', L.l8, C.c3, 0, 'text', text('La pregunta guía', '<h2>La pregunta guía</h2><p>Una buena pregunta guía es abierta, desafiante y conectada con la comunidad.</p>'), 8);
  b('l8Group', L.l8, C.c3, 1, 'group-assignment', { title: 'Tarea grupal — Pregunta guía del proyecto',
    description: 'En grupo, propongan una pregunta guía para un proyecto de cuatro semanas.',
    instructions: 'Escriban tres versiones de la pregunta y elijan una justificando la elección.', resources: [] }, 30);
  b('l9Text', L.l9, C.c3, 0, 'text', text('Hitos', '<h2>Hitos y productos</h2><p>Divide el proyecto en hitos semanales con un producto visible en cada uno.</p>'), 8);
  b('l9Video', L.l9, C.c3, 1, 'video', video('Un proyecto en cuatro semanas', 'E2Esint0005'), 10);

  // Course 4 (learning path only).
  b('l10Text', L.l10, C.c4, 0, 'text', text('Observar con foco', '<h2>Observación con foco</h2><p>Acordar un foco antes de entrar a la sala hace la observación más útil para ambos.</p>'), 8);
  b('l10Download', L.l10, C.c4, 1, 'download', { title: 'Pauta de observación', allowBulkDownload: false, requireAuth: true, files: [
    { id: 'f4', name: 'Pauta de observación.pdf', originalName: 'pauta-observacion-sintetica.pdf', url: FILE_URL.pauta, size: 980, type: 'application/pdf', uploadedAt: ts('2026-10-04T10:20:00-03:00') }] }, 2);
  b('l11Text', L.l11, C.c4, 0, 'text', text('Conversar', '<h2>Conversaciones de retroalimentación</h2><p>Empezar por lo observado, preguntar antes de sugerir y cerrar con un compromiso.</p>'), 8);
  b('l11Video', L.l11, C.c4, 1, 'video', video('Una conversación entre pares', 'E2Esint0006'), 12);

  // Course 5 (draft).
  b('l12Text', L.l12, C.c5, 0, 'text', text('Elegir el texto', '<p>Borrador: criterios para elegir un texto de lectura compartida.</p>'), 5);
  return out;
}

// Which blocks each learner has completed: [user key, lesson key, block keys, completed day].
function progressPlan() {
  const L1 = ['l1Text', 'l1Video', 'l1Image', 'l1Quiz', 'l1Download', 'l1Links', 'l1Group', 'l1Biblio'];
  const L2 = ['l2Text', 'l2Video', 'l2Download'];
  return [
    // docente, course 1 in progress: lesson 2 complete, lesson 1 at 3 of 8 blocks (the lesson opens on the quiz).
    ['docente', 'l1', L1.slice(0, 3), '2026-10-20'],
    ['docente', 'l2', L2, '2026-10-22'],
    // docente, course 2 complete.
    ['docente', 'l5', ['l5Text', 'l5Video'], '2026-10-08'],
    ['docente', 'l6', ['l6Text', 'l6Image'], '2026-10-09'],
    ['docente', 'l7', ['l7Text', 'l7Biblio'], '2026-10-10'],
    // gcLeader: course 1 half done, courses 2 and 4 complete.
    ['gcLeader', 'l1', L1, '2026-10-15'],
    ['gcLeader', 'l2', L2, '2026-10-16'],
    ['gcLeader', 'l5', ['l5Text', 'l5Video'], '2026-10-06'],
    ['gcLeader', 'l6', ['l6Text', 'l6Image'], '2026-10-06'],
    ['gcLeader', 'l7', ['l7Text', 'l7Biblio'], '2026-10-07'],
    ['gcLeader', 'l10', ['l10Text', 'l10Download'], '2026-10-12'],
    ['gcLeader', 'l11', ['l11Text', 'l11Video'], '2026-10-13'],
    // a second docente: course 1 started.
    ['inactiveConsultor', 'l1', L1.slice(0, 4), '2026-10-27'],
    // directivo: course 4 half done.
    ['directivo', 'l10', ['l10Text', 'l10Download'], '2026-11-03'],
    // generationLeader: course 1 started, quiz sent.
    ['generationLeader', 'l1', L1.slice(0, 4), '2026-10-24'],
  ];
}

export async function seed({ supabase, users: u }) {
  fileUrls();

  // ---- local files for image, download and bibliography blocks (bucket course-assets, public)
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.id === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error && !/exist/i.test(error.message)) throw new Error(`bucket ${BUCKET}: ${error.message}`);
  }
  for (const f of Object.values(FILES)) {
    const { error } = await supabase.storage.from(BUCKET).upload(f.path, f.body(), { contentType: f.type, upsert: true });
    if (error) throw new Error(`upload ${f.path}: ${error.message}`);
  }

  // ---- instructors (course cards, course builder)
  await put(supabase, 'instructors', [
    { id: I.inst1, full_name: 'Instructora Sintetica E2E', specialty: 'Evaluación para el aprendizaje', bio: 'Perfil inventado para pruebas.', photo_url: null, created_at: ts('2026-09-20T10:00:00-03:00') },
    { id: I.inst2, full_name: 'Instructor Sintetico E2E', specialty: 'Convivencia y liderazgo', bio: 'Perfil inventado para pruebas.', photo_url: null, created_at: ts('2026-09-20T10:01:00-03:00') },
  ]);

  // ---- courses, modules, lessons, blocks (/student/course, /student/lesson, /admin/course-builder/*)
  await put(supabase, 'courses', courses(u));
  await put(supabase, 'modules', modules());
  await put(supabase, 'lessons', lessons());
  const allBlocks = blocks();
  await put(supabase, 'blocks', allBlocks);

  // ---- learning paths (/my-paths, /mi-aprendizaje/ruta/[id], /admin/learning-paths/*)
  // Courses go in before any assignment so the enrol-on-add trigger has nobody to enrol.
  await put(supabase, 'learning_paths', [
    { id: P.p1, name: 'Ruta Sintetica E2E — Evaluación para el aprendizaje', description: 'Tres cursos para incorporar la evaluación formativa en la práctica diaria.', is_active: true, path_data: {}, created_by: u.admin, created_at: ts('2026-10-05T09:00:00-03:00'), updated_at: ts('2026-10-05T09:00:00-03:00') },
    { id: P.p2, name: 'Ruta Sintetica E2E — Convivencia y liderazgo', description: 'Convivencia escolar y liderazgo pedagógico para equipos de ciclo.', is_active: true, path_data: {}, created_by: u.admin, created_at: ts('2026-10-05T09:10:00-03:00'), updated_at: ts('2026-10-05T09:10:00-03:00') },
    { id: P.p3, name: 'Ruta Sintetica E2E — Proyectos en primer ciclo', description: 'Ruta en preparación para el colegio sintético.', school_id: SCHOOL, is_active: true, path_data: {}, created_by: u.admin, created_at: ts('2026-11-02T09:00:00-03:00'), updated_at: ts('2026-11-02T09:00:00-03:00') },
  ]);
  await put(supabase, 'learning_path_courses', [
    { id: id(0x811), learning_path_id: P.p1, course_id: C.c1, sequence_order: 1, is_required: true, created_at: ts('2026-10-05T09:01:00-03:00') },
    { id: id(0x812), learning_path_id: P.p1, course_id: C.c3, sequence_order: 2, is_required: true, created_at: ts('2026-10-05T09:01:00-03:00') },
    { id: id(0x813), learning_path_id: P.p1, course_id: C.c4, sequence_order: 3, is_required: false, created_at: ts('2026-10-05T09:01:00-03:00') },
    { id: id(0x814), learning_path_id: P.p2, course_id: C.c2, sequence_order: 1, is_required: true, created_at: ts('2026-10-05T09:11:00-03:00') },
    { id: id(0x815), learning_path_id: P.p2, course_id: C.c4, sequence_order: 2, is_required: true, created_at: ts('2026-10-05T09:11:00-03:00') },
    { id: id(0x816), learning_path_id: P.p3, course_id: C.c3, sequence_order: 1, is_required: true, created_at: ts('2026-11-02T09:01:00-03:00') },
  ]);
  const lpa = [
    // docente: path 1 in progress (course 1 of 3).
    { id: id(0x821), path_id: P.p1, user_id: u.docente, progress: 8, started: '2026-10-06T10:00:00-03:00', last: '2026-10-22T18:00:00-03:00', done: null, seq: 1, minutes: 95 },
    // gcLeader: path 2 complete.
    { id: id(0x822), path_id: P.p2, user_id: u.gcLeader, progress: 100, started: '2026-10-06T09:00:00-03:00', last: '2026-10-13T17:00:00-03:00', done: '2026-10-13T17:00:00-03:00', seq: 2, minutes: 240 },
    // directivo: path 2 started.
    { id: id(0x823), path_id: P.p2, user_id: u.directivo, progress: 25, started: '2026-11-03T09:00:00-03:00', last: '2026-11-03T11:00:00-03:00', done: null, seq: 2, minutes: 40 },
    // inactiveConsultor (a second docente): path 1 assigned, started.
    { id: id(0x824), path_id: P.p1, user_id: u.inactiveConsultor, progress: 0, started: '2026-10-27T10:00:00-03:00', last: '2026-10-27T11:00:00-03:00', done: null, seq: 1, minutes: 20 },
  ];
  // The assignment triggers mirror each row into learning_path_user_progress and stamp now() on any UPDATE, so the
  // mirror rows go in first with fixed dates (the trigger's own insert then does nothing), and both tables are
  // insert-if-missing.
  await put(supabase, 'learning_path_user_progress', lpa.map((a, i) => ({
    id: id(0x831 + i),
    path_id: a.path_id, user_id: a.user_id, started_at: ts(a.started), last_activity_at: ts(a.last),
    completed_at: a.done && ts(a.done), current_course_sequence: a.seq, total_time_spent_minutes: a.minutes,
    created_at: ts('2026-10-05T12:00:00-03:00'), updated_at: ts(a.last),
  })), { onConflict: 'path_id,user_id', ignore: true });
  await put(supabase, 'learning_path_assignments', lpa.map((a) => ({
    id: a.id, path_id: a.path_id, user_id: a.user_id, assigned_by: u.admin, assigned_at: ts('2026-10-05T12:00:00-03:00'),
    progress_percentage: a.progress, started_at: ts(a.started), last_activity_at: ts(a.last), completed_at: a.done && ts(a.done),
    current_course_sequence: a.seq, total_time_spent_minutes: a.minutes,
  })), { ignore: true });

  // ---- block progress (course page / lesson page check marks, /mi-aprendizaje progress bars)
  // Insert-if-missing: an UPDATE would re-fire the enrolment recompute trigger.
  const blockByKey = Object.fromEntries(allBlocks.map((x) => [Object.keys(B).find((k) => B[k] === x.id), x]));
  // Row id = learner slot × 0x1000 + the block's own number, so the plan can change without shifting ids.
  const LEARNERS = ['docente', 'gcLeader', 'inactiveConsultor', 'directivo', 'generationLeader'];
  const progress = [];
  for (const [user, lesson, keys, day] of progressPlan()) {
    keys.forEach((k, i) => {
      const at = ts(`${day}T${String(10 + i).padStart(2, '0')}:15:00-03:00`);
      const blockNo = parseInt(B[k].slice(-4), 16) - 0x400;
      progress.push({ id: id(0x10000 + (LEARNERS.indexOf(user) + 1) * 0x1000 + blockNo), user_id: u[user], lesson_id: L[lesson], block_id: B[k], completed_at: at,
        time_spent: (blockByKey[k].estimated_duration_minutes || 5) * 60, completion_data: { completed: true },
        created_at: at, updated_at: at });
    });
  }
  await put(supabase, 'lesson_progress', progress, { ignore: true });

  // ---- enrolments (/mi-aprendizaje, /dashboard, report screens, assignment matrix). Written after progress so
  // these values are the final ones. Progress follows the database rule: lessons with every block done / lessons.
  const enr = (n, user, course, o) => ({
    id: id(0x600 + n), user_id: u[user], course_id: course, enrolled_by: u.admin, enrollment_type: o.type || 'assigned',
    enrolled_at: ts(o.at), created_at: ts(o.at), updated_at: ts(o.updated || o.at), status: o.status || 'active',
    progress_percentage: o.pct || 0, lessons_completed: o.done || 0, total_lessons: o.total, is_completed: (o.pct || 0) >= 100,
    completed_at: (o.pct || 0) >= 100 ? ts(o.updated) : null, total_time_spent_seconds: o.secs || 0,
    has_passed: (o.pct || 0) >= 100, overall_score: o.score ?? null, enrollment_data: {},
    access_origin: o.path ? 'learning_path' : 'independent', source_path_id: o.path || null, access_origin_set_at: ts(o.at),
    completion_notification_sent: (o.pct || 0) >= 100,
  });
  await put(supabase, 'course_enrollments', [
    enr(1, 'docente', C.c1, { at: '2026-10-06T10:00:00-03:00', updated: '2026-10-22T18:00:00-03:00', pct: 25, done: 1, total: 4, secs: 5700 }),
    enr(2, 'docente', C.c2, { at: '2026-10-06T10:00:00-03:00', updated: '2026-10-10T12:00:00-03:00', pct: 100, done: 3, total: 3, secs: 3900, score: 92, status: 'completed' }),
    enr(3, 'docente', C.c3, { at: '2026-10-06T10:00:00-03:00', total: 2 }),
    enr(4, 'docente', C.c4, { at: '2026-10-06T10:00:00-03:00', total: 2, path: P.p1 }),
    enr(5, 'gcLeader', C.c1, { at: '2026-10-05T12:00:00-03:00', updated: '2026-10-16T12:00:00-03:00', pct: 50, done: 2, total: 4, secs: 6000 }),
    enr(6, 'gcLeader', C.c2, { at: '2026-10-05T12:00:00-03:00', updated: '2026-10-07T12:00:00-03:00', pct: 100, done: 3, total: 3, secs: 3600, score: 88, status: 'completed', path: P.p2 }),
    enr(7, 'gcLeader', C.c4, { at: '2026-10-05T12:00:00-03:00', updated: '2026-10-13T17:00:00-03:00', pct: 100, done: 2, total: 2, secs: 3000, score: 95, status: 'completed', path: P.p2 }),
    enr(8, 'inactiveConsultor', C.c1, { at: '2026-10-27T10:00:00-03:00', updated: '2026-10-27T13:00:00-03:00', total: 4, secs: 1800 }),
    enr(9, 'communityManager', C.c1, { at: '2026-10-28T10:00:00-03:00', total: 4 }),
    enr(10, 'generationLeader', C.c2, { at: '2026-10-08T10:00:00-03:00', total: 3, status: 'paused' }),
    enr(11, 'generationLeader', C.c3, { at: '2026-10-08T10:00:00-03:00', total: 2, status: 'dropped' }),
    enr(12, 'generationLeader', C.c1, { at: '2026-10-08T10:00:00-03:00', total: 4, type: 'self_enrolled' }),
    enr(13, 'directivo', C.c4, { at: '2026-11-03T09:00:00-03:00', updated: '2026-11-03T11:00:00-03:00', pct: 50, done: 1, total: 2, secs: 1500, path: P.p2 }),
    enr(14, 'directivo', C.c2, { at: '2026-11-03T09:00:00-03:00', total: 3, path: P.p2 }),
    enr(15, 'inactiveConsultor', C.c3, { at: '2026-10-27T10:00:00-03:00', total: 2, path: P.p1 }),
    enr(16, 'inactiveConsultor', C.c4, { at: '2026-10-27T10:00:00-03:00', total: 2, path: P.p1 }),
  ]);

  // ---- direct course assignments (/dashboard "Mis cursos" for non-admins, /admin/assignment-matrix, /admin/courses/[id]/assign)
  const ca = (n, user, course, status, pct, at, due = null, priority = 'normal') => ({
    id: id(0x700 + n), course_id: course, teacher_id: u[user], assigned_by: u.admin, assigned_at: ts(at),
    assignment_type: 'individual', status, progress_percentage: pct, due_date: due && ts(due), priority,
    notes: null, assignment_data: {},
  });
  await put(supabase, 'course_assignments', [
    ca(1, 'docente', C.c1, 'active', 25, '2026-10-06T10:00:00-03:00', '2030-03-31T23:59:00-03:00', 'high'),
    ca(2, 'docente', C.c2, 'completed', 100, '2026-10-06T10:00:00-03:00'),
    ca(3, 'docente', C.c3, 'pending', 0, '2026-10-06T10:00:00-03:00', '2030-06-30T23:59:00-03:00'),
    ca(4, 'gcLeader', C.c1, 'active', 50, '2026-10-05T12:00:00-03:00'),
    ca(5, 'inactiveConsultor', C.c1, 'active', 0, '2026-10-27T10:00:00-03:00'),
    ca(6, 'communityManager', C.c1, 'overdue', 0, '2026-10-28T10:00:00-03:00', '2026-11-10T23:59:00-03:00', 'urgent'),
    ca(7, 'generationLeader', C.c2, 'cancelled', 0, '2026-10-08T10:00:00-03:00', null, 'low'),
  ]);

  // ---- assignment matrix history (/admin/assignment-matrix audit tab)
  const audit = (n, action, entity, content_type, content, source, at, path = null) => ({
    id: id(0xf10 + n), action, entity_type: 'user', entity_id: u[entity], content_type, content_id: content, source,
    source_learning_path_id: path, performed_by: u.admin, performed_at: ts(at), metadata: {},
  });
  await put(supabase, 'assignment_audit_log', [
    audit(1, 'assigned', 'docente', 'course', C.c1, 'direct', '2026-10-06T10:00:00-03:00'),
    audit(2, 'assigned', 'docente', 'learning_path', P.p1, 'direct', '2026-10-06T10:01:00-03:00'),
    audit(3, 'assigned', 'docente', 'course', C.c4, 'learning_path', '2026-10-06T10:01:00-03:00', P.p1),
    audit(4, 'assigned', 'gcLeader', 'learning_path', P.p2, 'direct', '2026-10-05T12:00:00-03:00'),
    audit(5, 'unassigned', 'generationLeader', 'course', C.c2, 'direct', '2026-10-20T15:30:00-03:00'),
  ]);

  // ---- completions and badges (/dashboard "Mis logros", certificate states)
  await put(supabase, 'course_completions', [
    { id: id(0xe41), user_id: u.docente, course_id: C.c2, completion_type: 'course', completed_at: ts('2026-10-10T12:00:00-03:00'), completion_notification_sent: true, created_at: ts('2026-10-10T12:00:00-03:00') },
    { id: id(0xe42), user_id: u.gcLeader, course_id: C.c4, completion_type: 'course', completed_at: ts('2026-10-13T17:00:00-03:00'), completion_notification_sent: true, created_at: ts('2026-10-13T17:00:00-03:00') },
    { id: id(0xe43), user_id: u.gcLeader, course_id: C.c2, completion_type: 'course', completed_at: ts('2026-10-07T12:00:00-03:00'), completion_notification_sent: true, created_at: ts('2026-10-07T12:00:00-03:00') },
  ]);
  await put(supabase, 'badges', [
    { id: id(0xe01), name: 'Curso completado', description: 'Completaste todas las lecciones de un curso.', badge_type: 'course_completion', icon_name: 'genera', color_primary: '#fbbf24', color_secondary: '#0a0a0a', criteria: { type: 'course_completion' }, points_value: 100, is_active: true, created_at: ts('2026-09-15T10:00:00-03:00'), updated_at: ts('2026-09-15T10:00:00-03:00') },
    { id: id(0xe02), name: 'Primera ruta iniciada', description: 'Comenzaste tu primera ruta de aprendizaje.', badge_type: 'milestone', icon_name: 'genera', color_primary: '#00365b', color_secondary: '#fbbf24', criteria: { type: 'first_path' }, points_value: 20, is_active: true, created_at: ts('2026-09-15T10:00:00-03:00'), updated_at: ts('2026-09-15T10:00:00-03:00') },
  ]);
  await put(supabase, 'user_badges', [
    { id: id(0xe11), user_id: u.docente, badge_id: id(0xe01), course_id: C.c2, earned_at: ts('2026-10-10T12:00:00-03:00'), displayed_in_community: true, metadata: { course_name: 'Curso Sintetico E2E — Convivencia escolar y clima de aula', completed_at: ts('2026-10-10T12:00:00-03:00') }, created_at: ts('2026-10-10T12:00:00-03:00') },
    { id: id(0xe12), user_id: u.docente, badge_id: id(0xe02), course_id: null, earned_at: ts('2026-10-06T10:05:00-03:00'), displayed_in_community: true, metadata: {}, created_at: ts('2026-10-06T10:05:00-03:00') },
    { id: id(0xe13), user_id: u.gcLeader, badge_id: id(0xe01), course_id: C.c4, earned_at: ts('2026-10-13T17:00:00-03:00'), displayed_in_community: true, metadata: { course_name: 'Curso Sintetico E2E — Liderazgo pedagógico' }, created_at: ts('2026-10-13T17:00:00-03:00') },
  ]);

  // ---- upcoming courses (/admin/upcoming-courses, /dashboard "Próximos cursos"); one hidden
  const up = (n, title, description, inst, date, order, active) => ({
    id: id(0x900 + n), title, description, instructor_id: inst, thumbnail_url: null, estimated_release_date: date,
    display_order: order, is_active: active, created_by: u.admin, created_at: ts(`2026-10-${10 + n}T09:00:00-03:00`),
    updated_at: ts(`2026-10-${10 + n}T09:00:00-03:00`),
  });
  await put(supabase, 'upcoming_courses', [
    up(1, 'Curso Sintetico E2E — Lectura y escritura en todas las asignaturas', 'Estrategias de alfabetización disciplinar para segundo ciclo.', I.inst1, '2030-03-02', 1, true),
    up(2, 'Curso Sintetico E2E — Matemática con material concreto', 'Secuencias didácticas con material manipulable para primer ciclo.', I.inst2, '2030-05-04', 2, true),
    up(3, 'Curso Sintetico E2E — Inclusión y diseño universal', 'Planificar una clase accesible para todo el curso.', I.inst1, '2030-08-03', 3, true),
    up(4, 'Curso Sintetico E2E — Ciudadanía digital (en pausa)', 'Curso en revisión; no se muestra a los docentes.', null, '2030-10-05', 4, false),
  ], { ignore: true });

  // ---- quiz submissions (/quiz-reviews, /quiz-reviews/[id]); two pending review, one needing review, one passed
  const answers = (mc, tf, text) => ({ q1: { selectedOption: mc }, q2: { selectedOption: tf }, q3: { text } });
  const open = (text) => [{ question_id: 'q3', question: QUIZ.questions[2].question, response: text, points: 5,
    expectedAnswer: QUIZ.questions[2].expectedAnswer, gradingGuidelines: QUIZ.questions[2].gradingGuidelines }];
  const qs = (qid, user, at, mc, tf, text, extra = {}) => ({
    id: qid, lesson_id: L.l1, block_id: B.l1Quiz, student_id: u[user], course_id: C.c1,
    auto_graded_score: (mc === 'q1b' ? 2 : 0) + (tf === 'q2f' ? 1 : 0), manual_graded_score: 0,
    total_possible_points: 8, auto_gradable_points: 3, manual_gradable_points: 5, grading_status: 'pending_review',
    review_status: 'pending', submitted_at: ts(at), answers: answers(mc, tf, text), open_responses: open(text),
    grading_feedback: null, time_spent: 420, attempt_number: 1, ...extra,
  });
  await put(supabase, 'quiz_submissions', [
    qs(QS.qs1, 'generationLeader', '2026-10-24T13:15:00-03:00', 'q1b', 'q2f',
      'Les preguntaría «¿cómo sabes que tu resultado es razonable?» después de resolver el problema de fracciones. Espero escuchar estimaciones y comparaciones con casos conocidos.'),
    qs(QS.qs2, 'inactiveConsultor', '2026-10-27T13:15:00-03:00', 'q1b', 'q2t',
      'Usaría «¿en qué se parecen estos dos textos?» al comenzar la clase de lenguaje. Espero que nombren el propósito de cada texto.'),
    qs(QS.qs3, 'gcLeader', '2026-10-15T13:15:00-03:00', 'q1b', 'q2f',
      'Preguntaría «¿dónde más podrías usar esta estrategia?» al cierre. Espero ejemplos fuera de la asignatura.',
      { grading_status: 'completed', review_status: 'pass', manual_graded_score: 5, graded_at: ts('2026-10-16T10:00:00-03:00'), graded_by: u.consultorAssigned,
        grading_feedback: { q3: { score: 5, feedback: 'Pregunta clara y evidencia bien descrita.' } }, general_feedback: 'Muy buen trabajo.' }),
    qs(QS.qs4, 'communityManager', '2026-10-29T13:15:00-03:00', 'q1a', 'q2t', 'Preguntaría si terminaron la guía.',
      { grading_status: 'completed', review_status: 'needs_review', manual_graded_score: 1, graded_at: ts('2026-10-30T10:00:00-03:00'), graded_by: u.consultorAssigned,
        grading_feedback: { q3: { score: 1, feedback: 'La pregunta es cerrada; revisa los ejemplos de la lección.' } }, general_feedback: 'Te sugiero repasar la lección y volver a intentarlo.' }),
  ]);

  // ---- consultor scope: the consultor's review screens need students. Module 30 (sessions) gives consultorAssigned
  // a school-wide assignment to school 990001, which covers every learner here; nothing is added by this module.

  // ---- lesson assignments (/assignments, /assignments/[id], /assignments/[id]/submissions, workspace groups page)
  const la = (key, o) => ({
    id: LA[key], course_id: o.course, lesson_id: o.lesson, created_by: u[o.by], title: o.title, description: o.description,
    instructions: o.instructions, due_date: o.due && ts(o.due), points: o.points ?? 100, assignment_type: o.type,
    assignment_for: o.group ? 'group' : 'individual', assigned_to_community_id: o.group ? COMMUNITY : null,
    max_group_size: o.group ? 4 : null, min_group_size: o.group ? 2 : null, require_all_members_submit: false,
    group_assignments: o.groups || null, resources: o.resources || [], is_published: o.published,
    allow_late_submission: true, max_attempts: 1, created_at: ts(o.at), updated_at: ts(o.at),
  });
  await put(supabase, 'lesson_assignments', [
    la('la1', { course: C.c1, lesson: L.l2, by: 'consultorAssigned', type: 'task', published: true, at: '2026-10-07T09:00:00-03:00', due: '2030-03-15T23:59:00-03:00',
      title: 'Planificación de una clase con evaluación formativa',
      description: 'Planifica una clase de 90 minutos que incluya una pregunta abierta y un ticket de salida.',
      instructions: 'Usa la plantilla del curso. Indica el objetivo, la pregunta y qué harás con las respuestas.',
      resources: [{ id: 'res1', title: 'Plantilla de planificación', url: FILE_URL.rubrica, type: 'file' }] }),
    la('la2', { course: C.c1, lesson: L.l3, by: 'consultorAssigned', type: 'group', group: true, published: true, at: '2026-10-08T09:00:00-03:00', due: '2030-04-10T23:59:00-03:00', points: 50,
      title: 'Proyecto colaborativo: rúbrica de ciclo',
      description: 'En grupos de la comunidad, construyan una rúbrica común para el ciclo.',
      instructions: 'Repartan los criterios entre los integrantes y consoliden un solo documento.',
      groups: [{ group_id: G.g5, name: 'Grupo Rúbricas 1', members: [{ user_id: u.docente, role: 'leader' }, { user_id: u.gcLeader, role: 'member' }] }] }),
    la('la3', { course: C.c3, lesson: L.l8, by: 'consultorAssigned', type: 'essay', published: false, at: '2026-11-04T09:00:00-03:00', due: '2030-05-20T23:59:00-03:00',
      title: 'Reflexión escrita sobre la pregunta guía (borrador)', description: 'Ensayo breve sobre una pregunta guía que hayas usado.' }),
    la('la4', { course: C.c2, lesson: L.l7, by: 'admin', type: 'presentation', published: true, at: '2026-10-02T11:00:00-03:00', due: '2026-10-30T23:59:00-03:00', points: 80,
      title: 'Presentación: mapa de convivencia del curso', description: 'Presenta los acuerdos de tu curso y cómo los revisan.' }),
    la('la5', { course: C.c4, lesson: L.l10, by: 'admin', type: 'quiz', published: false, at: '2026-11-06T11:00:00-03:00',
      title: 'Autoevaluación de observación (borrador)', description: 'Preguntas breves sobre la pauta de observación.' }),
    la('la6', { course: C.c3, lesson: L.l9, by: 'admin', type: 'project', published: true, at: '2026-10-03T11:00:00-03:00', due: '2030-06-15T23:59:00-03:00', points: 120,
      title: 'Proyecto: plan de hitos de cuatro semanas', description: 'Entrega el calendario de hitos y productos de tu proyecto.' }),
  ], { ignore: true });

  // Individual submissions in every status: draft, submitted, graded (on time and late), returned.
  const sub = (n, assignment, user, status, o = {}) => ({
    id: id(0xb40 + n), assignment_id: LA[assignment], student_id: u[user], submitted_by: u[user], status,
    content: o.content || null, attachment_urls: o.files || [], submitted_at: o.submitted && ts(o.submitted),
    graded_at: o.graded && ts(o.graded), graded_by: o.graded ? u[o.grader || 'consultorAssigned'] : null,
    score: o.score ?? null, feedback: o.feedback || null, attempt_number: 1, is_late: !!o.late, is_original: true,
    created_at: ts(o.created || o.submitted || '2026-10-25T10:00:00-03:00'), updated_at: ts(o.graded || o.submitted || o.created || '2026-10-25T10:00:00-03:00'),
  });
  await put(supabase, 'lesson_assignment_submissions', [
    sub(1, 'la1', 'docente', 'submitted', { submitted: '2026-10-23T20:10:00-03:00', content: 'Adjunto mi planificación para 4° básico: la pregunta abierta es «¿cómo sabes que tu resultado es razonable?» y el ticket de salida pide un ejemplo propio.', files: [FILE_URL.rubrica] }),
    sub(2, 'la1', 'gcLeader', 'graded', { submitted: '2026-10-17T19:00:00-03:00', graded: '2026-10-19T10:00:00-03:00', score: 92, content: 'Planificación de lenguaje para 6° básico con pregunta de comparación entre textos.', feedback: 'Excelente uso de la pregunta de comparación. Detalla un poco más qué harás con los tickets.' }),
    sub(3, 'la1', 'inactiveConsultor', 'returned', { submitted: '2026-10-28T18:00:00-03:00', graded: '2026-10-30T09:30:00-03:00', content: 'Planificación inicial, sin ticket de salida.', feedback: 'Falta el ticket de salida. Agrégalo y vuelve a enviar.' }),
    sub(4, 'la1', 'communityManager', 'draft', { created: '2026-10-29T17:00:00-03:00', content: 'Borrador en preparación.' }),
    sub(5, 'la4', 'docente', 'graded', { submitted: '2026-10-31T09:00:00-03:00', graded: '2026-11-02T12:00:00-03:00', grader: 'admin', score: 78, late: true, content: 'Presentación del mapa de convivencia de 4° básico.', feedback: 'Buen trabajo; se entregó un día tarde.' }),
    sub(6, 'la4', 'gcLeader', 'submitted', { submitted: '2026-10-29T16:00:00-03:00', content: 'Presentación del curso 6° básico.' }),
    sub(7, 'la2', 'docente', 'submitted', { submitted: '2026-10-25T18:30:00-03:00', content: 'Entrega del grupo: rúbrica de ciclo con cinco criterios.' }),
  ], { ignore: true });

  // ---- group work on group-assignment blocks (/mi-aprendizaje/tareas, /admin/assignment-review/[id],
  // /community/workspace/assignments/[id]/discussion). School-only groups (no community) except one on the
  // lesson assignment, which carries the fixture community for the workspace groups page.
  const grp = (gid, assignment, nameText, at, community = null) => ({
    id: gid, assignment_id: assignment, community_id: community, school_id: SCHOOL, name: nameText,
    is_consultant_managed: false, created_at: ts(at), updated_at: ts(at),
  });
  await put(supabase, 'group_assignment_groups', [
    grp(G.g1, B.l1Group, 'Grupo Preguntas 1', '2026-10-18T10:00:00-03:00'),
    grp(G.g2, B.l1Group, 'Grupo Preguntas 2', '2026-10-18T10:05:00-03:00'),
    grp(G.g3, B.l1Group, 'Grupo Preguntas 3', '2026-10-18T10:10:00-03:00'),
    grp(G.g4, B.l3Group, 'Grupo Rúbrica Real', '2026-10-24T10:00:00-03:00'),
    grp(G.g5, LA.la2, 'Grupo Rúbricas 1', '2026-10-09T10:00:00-03:00', COMMUNITY),
    grp(G.g6, LA.la2, 'Grupo Rúbricas 2', '2026-10-09T10:05:00-03:00'),
  ]);
  const mem = (n, gid, assignment, user, role, at) => ({ id: id(0xc20 + n), group_id: gid, assignment_id: assignment, user_id: u[user], role, joined_at: ts(at) });
  await put(supabase, 'group_assignment_members', [
    mem(1, G.g1, B.l1Group, 'docente', 'leader', '2026-10-18T10:00:00-03:00'),
    mem(2, G.g1, B.l1Group, 'gcLeader', 'member', '2026-10-18T10:02:00-03:00'),
    mem(3, G.g2, B.l1Group, 'inactiveConsultor', 'leader', '2026-10-18T10:05:00-03:00'),
    mem(4, G.g2, B.l1Group, 'communityManager', 'member', '2026-10-18T10:06:00-03:00'),
    mem(5, G.g3, B.l1Group, 'generationLeader', 'leader', '2026-10-18T10:10:00-03:00'),
    mem(6, G.g4, B.l3Group, 'docente', 'leader', '2026-10-24T10:00:00-03:00'),
    mem(7, G.g4, B.l3Group, 'inactiveConsultor', 'member', '2026-10-24T10:01:00-03:00'),
    mem(8, G.g5, LA.la2, 'docente', 'leader', '2026-10-09T10:00:00-03:00'),
    mem(9, G.g5, LA.la2, 'gcLeader', 'member', '2026-10-09T10:01:00-03:00'),
    mem(10, G.g6, LA.la2, 'communityManager', 'leader', '2026-10-09T10:05:00-03:00'),
  ]);
  // One row per member (the app writes one per member): submitted, graded, pending.
  const gsub = (n, assignment, gid, user, status, o = {}) => ({
    id: id(0xc60 + n), assignment_id: assignment, group_id: gid, user_id: u[user], status, content: o.content || null,
    file_url: o.file || null, grade: o.grade ?? null, feedback: o.feedback || null, submitted_at: o.submitted && ts(o.submitted),
    graded_at: o.graded && ts(o.graded), graded_by: o.graded ? u.consultorAssigned : null,
    created_at: ts(o.submitted || o.created), updated_at: ts(o.graded || o.submitted || o.created),
  });
  const g1Text = 'Banco de diez preguntas abiertas para el primer ciclo, con el momento de la clase en que cada una funcionó.';
  const g2Text = 'Banco de preguntas de lenguaje y ciencias, ordenadas por tipo (razonamiento, comparación, transferencia).';
  const g4Text = 'Rúbrica de cuatro niveles para la escritura de un texto informativo, probada con dos trabajos.';
  await put(supabase, 'group_assignment_submissions', [
    gsub(1, B.l1Group, G.g1, 'docente', 'submitted', { submitted: '2026-10-21T19:00:00-03:00', content: g1Text, file: FILE_URL.rubrica }),
    gsub(2, B.l1Group, G.g1, 'gcLeader', 'submitted', { submitted: '2026-10-21T19:00:00-03:00', content: g1Text, file: FILE_URL.rubrica }),
    gsub(3, B.l1Group, G.g2, 'inactiveConsultor', 'graded', { submitted: '2026-10-28T19:00:00-03:00', graded: '2026-10-30T11:00:00-03:00', grade: 6.5, content: g2Text, feedback: 'Muy buena variedad de preguntas. Agreguen un ejemplo de transferencia.' }),
    gsub(4, B.l1Group, G.g2, 'communityManager', 'graded', { submitted: '2026-10-28T19:00:00-03:00', graded: '2026-10-30T11:00:00-03:00', grade: 6.5, content: g2Text, feedback: 'Muy buena variedad de preguntas. Agreguen un ejemplo de transferencia.' }),
    gsub(5, B.l1Group, G.g3, 'generationLeader', 'pending', { created: '2026-10-19T10:00:00-03:00', content: 'Borrador del grupo.' }),
    gsub(6, B.l3Group, G.g4, 'docente', 'graded', { submitted: '2026-10-26T18:00:00-03:00', graded: '2026-10-29T09:00:00-03:00', grade: 7.0, content: g4Text, feedback: 'Rúbrica clara y bien probada. ¡Felicitaciones!' }),
    gsub(7, B.l3Group, G.g4, 'inactiveConsultor', 'graded', { submitted: '2026-10-26T18:00:00-03:00', graded: '2026-10-29T09:00:00-03:00', grade: 7.0, content: g4Text, feedback: 'Rúbrica clara y bien probada. ¡Felicitaciones!' }),
  ]);

  // Group discussion thread of "Grupo Preguntas 1" (what get_or_create_group_discussion would create) and three messages.
  await put(supabase, 'message_threads', [{
    id: THREAD, workspace_id: null, thread_title: 'Discusión: Tarea grupal — Banco de preguntas del ciclo',
    description: 'Discusión grupal para Tarea grupal — Banco de preguntas del ciclo (Curso Sintetico E2E — Evaluación formativa en el aula)',
    created_by: u.docente, custom_category_name: 'group-assignment', assignment_group_id: G.g1, category: 'general',
    is_pinned: false, is_locked: false, is_archived: false, message_count: 3, participant_count: 2,
    last_message_at: ts('2026-10-20T21:05:00-03:00'), created_at: ts('2026-10-18T10:15:00-03:00'), updated_at: ts('2026-10-20T21:05:00-03:00'),
  }]);
  await put(supabase, 'group_assignment_discussions', [{
    id: id(0xd11), assignment_id: B.l1Group, group_id: G.g1, workspace_id: null, thread_id: THREAD, created_at: ts('2026-10-18T10:15:00-03:00'),
  }]);
  const msg = (n, user, content, at) => ({ id: id(0xd20 + n), workspace_id: null, thread_id: THREAD, author_id: u[user], content,
    content_html: null, message_type: 'regular', is_edited: false, is_deleted: false, created_at: ts(at), updated_at: ts(at) });
  await put(supabase, 'community_messages', [
    msg(1, 'docente', 'Hola, propongo que cada uno suba sus dos preguntas antes del jueves.', '2026-10-18T10:20:00-03:00'),
    msg(2, 'gcLeader', 'De acuerdo. Yo agrego las de lenguaje y una de ciencias.', '2026-10-19T08:40:00-03:00'),
    msg(3, 'docente', 'Listo, consolidé el documento. Revísenlo y lo entregamos mañana.', '2026-10-20T21:05:00-03:00'),
  ]);
}

// ---------------------------------------------------------------- ids for addresses with a changing part
const course = { courseId: C.c1 };
export const params = {
  '/student/course/[courseId]': { default: course },
  '/student/lesson/[lessonId]': { default: { lessonId: L.l1 } },
  '/courses/[id]': { default: { id: C.c1 } },
  // A path opens only for someone assigned to it: P1 (docente), P2 (lider_comunidad complete, directivo started).
  '/mi-aprendizaje/ruta/[id]': { default: { id: P.p1 }, lider_comunidad: { id: P.p2 }, equipo_directivo: { id: P.p2 } },
  '/my-paths/[id]': { default: { id: P.p1 }, lider_comunidad: { id: P.p2 }, equipo_directivo: { id: P.p2 } },
  '/admin/course-builder/[courseId]': { default: course },
  '/admin/course-builder/[courseId]/edit': { default: course },
  '/admin/course-builder/[courseId]/[moduleId]': { default: { courseId: C.c1, moduleId: M.m1 } },
  '/admin/course-builder/[courseId]/[moduleId]/[lessonId]': { default: { courseId: C.c1, moduleId: M.m1, lessonId: L.l1 } },
  '/admin/course-builder/[courseId]/lesson/[lessonId]': { default: { courseId: C.c2, lessonId: L.l5 } },
  '/admin/courses/[id]/assign': { default: { id: C.c1 } },
  '/admin/learning-paths/[id]/assign': { default: { id: P.p1 } },
  '/admin/learning-paths/[id]/edit': { default: { id: P.p1 } },
  // Group-assignment ids are block ids: 0x407 is the group block of lesson 1 (three groups). The discussion opens for
  // members of "Grupo Preguntas 1" who hold a community (lider_comunidad); others are sent away by the middleware.
  '/admin/assignment-review/[id]': { default: { id: id(0x407) } },
  '/assignments/[id]': { default: { id: LA.la1 } },
  '/assignments/[id]/submissions': { default: { id: LA.la1 } },
  '/community/workspace/assignments/[id]/discussion': { default: { id: id(0x407) } },
  '/community/workspace/assignments/[id]/groups': { default: { id: LA.la2 } },
  '/quiz-reviews/[id]': { default: { id: QS.qs1 } },
};

// More states of the same addresses worth a picture of their own.
export const variants = [
  { route: '/student/course/[courseId]', name: 'simple', values: { courseId: C.c2 }, roles: ['admin', 'docente'] }, // a course without modules
];
