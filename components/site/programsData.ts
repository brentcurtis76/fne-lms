/**
 * The four programs of Fundación Nueva Educación. Titles, descriptions,
 * objectives, activities and results are carried over unchanged from the
 * previous /programas page; `JOURNEY` adds only how each one is presented.
 */
export interface Program {
  id: ProgramId;
  title: string;
  subtitle: string;
  duration?: string;
  description: string;
  objectives: string[];
  activities: string[];
  results?: string[];
}

export type ProgramId = 'aula-generativa' | 'inspira' | 'inicia' | 'evoluciona';

export const PROGRAMS: Program[] = [
  {
    id: 'aula-generativa',
    title: 'AULA GENERATIVA',
    subtitle: 'Ecosistema de relaciones saludables para el crecimiento',
    description: 'El aula generativa busca optimizar los procesos y elevar los resultados en el crecimiento y aprendizaje de cada estudiante, fortaleciendo la calidad de los vínculos entre pares.',
    objectives: [
      'Construcción de ecosistema de relaciones saludables en el aula',
      'Desarrollo de autonomía, interdependencia y trabajo colaborativo',
      'Orientación al crecimiento individual y colectivo',
      'Desarrollo de mentalidad de crecimiento y valores'
    ],
    activities: [
      'Programa de educación relacional',
      'Programa de innovación pedagógica en el aula',
      'Programa de crecimiento personal',
      'Programa de prácticas generativas',
      'Programa de comunidades de crecimiento'
    ],
    results: [
      'Calidad de vida para educadores con aulas con motor propio',
      'Vínculos seguros y prosociales entre pares',
      'Conexión positiva con las familias',
      'Superación de la dicotomía Convivencia/Aprendizaje',
      'Síntesis hacia la mirada generativa'
    ]
  },
  {
    id: 'inspira',
    title: 'INSPIRA',
    subtitle: 'Viaja y sumérgete en una escuela de vanguardia educativa',
    duration: '2 semanas',
    description: 'INSPIRA es una experiencia diseñada para ampliar la mirada pedagógica y entregar respuestas concretas sobre cómo alcanzar paso a paso una educación de vanguardia para Chile.',
    objectives: [
      'Visitas Pedagógicas: Jornadas en colegios de vanguardia para conocer el proyecto educativo',
      'Estadia Pedagógica: Trabajo pedagógico en aula junto a un educador de vanguardia',
      'Conversatorios con Expertos: Sesiones de diálogo con expertos en educación de Cataluña',
      'Talleres de síntesis: Síntesis de aprendizajes y recursos compartidos',
      'Plataforma de registro: Bitácora de viaje compartida con documentación del cambio'
    ],
    activities: [
      'Jornadas de visitas a colegios de vanguardia',
      'Trabajo pedagógico directo en aula',
      'Diálogos con expertos educativos',
      'Síntesis de aprendizajes y desafíos',
      'Registro multimedia del viaje'
    ]
  },
  {
    id: 'inicia',
    title: 'INICIA',
    subtitle: 'Introducción a la Nueva Educación',
    duration: '40-80 horas',
    description: 'Programa diseñado para establecimientos educacionales que desean conocer y discernir el inicio de un largo y profundo proceso de transformación de su cultura educativa.',
    objectives: [
      'Asesorar y formar al director y su equipo en liderazgo del cambio',
      'Acompañamiento al equipo de gestión para el proceso cultural',
      'Favorecer la emergencia de un sentido de urgencia compartido',
      'Visualizar un horizonte de transformación compartido',
      'Construir una línea base participativa rápida',
      'Identificar necesidades para implementación futura'
    ],
    activities: [
      'Asesoría Directiva y al equipo de gestión',
      'Talleres de formación con líderes de base',
      'Visitas internacionales a la escuela',
      'Plataforma de formación con cursos introductorios'
    ],
    results: [
      'Creación colectiva de proyecto de transformación',
      'Construcción de línea base de cambio',
      'Diseño de plan general para el primer año',
      'Elección de personas para INSPIRA en BCN'
    ]
  },
  {
    id: 'evoluciona',
    title: 'EVOLUCIONA',
    subtitle: 'Hacia una transformación profunda de la cultura educativa',
    duration: '5 años',
    description: 'Programa de evolución progresiva, estimado en 5 años de duración. Se deberá considerar el tamaño de la comunidad educativa, la velocidad de implementación y la claridad política del centro para avanzar.',
    objectives: [
      'Transformar la mirada pedagógica y generar un alto sentido de urgencia respecto de la imperiosa necesidad de una educación nueva',
      'Visualizar y ambicionar juntos un nuevo horizonte pedagógico',
      'Construir y recorrer una ruta de evolución cultural que en las 7 vías de evolución declaradas: Propósito, Personalización, Aprendizaje, Evaluación, Liderazgo, Familias y Trabajo Docente',
      'Alcanzar un diseño a la medida, progresivo y basado en victorias tempranas',
      'Evolucionar a partir de las fortalezas preexistentes',
      'Formar líderes capaces de conducir el cambio',
      'Comunicar el proceso interna y externamente',
      'Construir equipos de cambio misionarios y de alto desempeño',
      'Soñar, diseñar, implementar, evaluar y rediseñar junto a los equipos de terreno',
      'Institucionalizar los cambios y arraigar la nueva cultura'
    ],
    activities: [
      'Asesoría directiva para diseñar y liderar el cambio',
      'Visitas de asesores internacionales en terreno',
      'Asesoría técnica para la implementación de prácticas',
      'Plataforma de formación asincrónica, individual y en equipos',
      'Formación de líderes de base',
      'Formación de Comunidades de Crecimiento',
      'Implementación de Hub de Transformación'
    ],
    results: [
      'Migración completa de pre-kinder a 4 medio en nivel de profundidad diverso',
      'Amplia y apropiada implementación de nuevas prácticas y proceso pedagógicos',
      'Estudiantes autónomos, colaborativos y generativos',
      'Convivencia prosocial elevada',
      'Familias integradas al proyecto educativo, disposición creativa y de apoyo constante',
      'Una organización que ha hecho propio su proceso de cambio',
      'Líderes de base potentes movilizando la evolución constante',
      'Profesoras, profesores, profesionales y asistentes formados, integrados en equipos sinérgicos por etapas del desarrollo',
      'Clima laboral lleno de sentido, empuje y auto realización',
      'Procesos y recursos pedagógicos optimizados'
    ]
  }
];

export interface JourneyStep {
  id: ProgramId;
  /** Display name in sentence case (the data keeps the original capitals). */
  name: string;
  /** The two families the previous page grouped the programs into. */
  stage: 'Despegue' | 'Cambio cultural';
  /** Short kicker shown beside the stage. */
  detail: string;
  /** One-paragraph summary for the homepage doors. */
  summary: string;
  /** CSS gradient variable and line illustration (mask) of the program. */
  gradient: string;
  art: string;
}

/** Suggested order of the journey, as on the previous page: Inicia, Inspira, Aula Generativa, Evoluciona. */
export const JOURNEY: JourneyStep[] = [
  {
    id: 'inicia',
    name: 'Inicia',
    stage: 'Despegue',
    detail: '40 a 80 horas',
    summary:
      'Introducción a la Nueva Educación. Para establecimientos que quieren conocer y discernir el inicio de un proceso profundo de transformación de su cultura educativa.',
    gradient: 'var(--g-sol)',
    art: '/sitio/linea-growth.png',
  },
  {
    id: 'inspira',
    name: 'Inspira',
    stage: 'Despegue',
    detail: '2 semanas en Barcelona',
    summary:
      'Viaja y sumérgete en una escuela de vanguardia. Una experiencia para ampliar la mirada pedagógica, con respuestas concretas para Chile.',
    gradient: 'var(--g-coral)',
    art: '/sitio/linea-castellier.png',
  },
  {
    id: 'aula-generativa',
    name: 'Aula Generativa',
    stage: 'Cambio cultural',
    detail: 'En la sala de clases',
    summary:
      'Un ecosistema de relaciones saludables que eleva el crecimiento y el aprendizaje de cada estudiante, fortaleciendo la calidad de los vínculos entre pares.',
    gradient: 'var(--g-verde)',
    art: '/sitio/linea-huddle.png',
  },
  {
    id: 'evoluciona',
    name: 'Evoluciona',
    stage: 'Cambio cultural',
    detail: '5 años',
    summary:
      'Una transformación profunda de la cultura educativa: una ruta por las siete vías, a la medida, progresiva y basada en victorias tempranas.',
    gradient: 'var(--g-mar)',
    art: '/sitio/linea-hanging-bridge.png',
  },
];

export function programById(id: ProgramId): Program {
  const found = PROGRAMS.find((program) => program.id === id);
  if (!found) throw new Error(`Unknown program: ${id}`);
  return found;
}
