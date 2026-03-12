import type { PropuestaConsultorInsert } from '@/lib/propuestas/types';

/**
 * Seed data for propuesta_consultores
 * FNE team consultant profiles.
 * Note: foto_path and cv_pdf_path are placeholder storage paths —
 * actual files must be uploaded to Supabase storage separately.
 */
export const CONSULTORES_SEED: PropuestaConsultorInsert[] = [
  {
    nombre: 'Arnoldo Cisternas Chávez',
    titulo: 'Director del Programa y Asesor Directivo',
    categoria: 'comite_internacional',
    perfil_profesional:
      'Psicólogo organizacional y Doctor en Ciencias de la Gestión (ESADE, Barcelona). Director del Instituto Relacional (Barcelona y Chile) y Director Metodológico del programa Los Pellines. Especialista en gestión del cambio, liderazgo educativo y metodologías relacionales. Ha liderado procesos de transformación organizacional en escuelas y comunidades educativas en Chile y Europa, aplicando el enfoque de la Educación Relacional y el Aprendizaje Basado en Proyectos.',
    formacion_academica: [
      {
        year: 2006,
        institution: 'ESADE Business School, Barcelona',
        degree: 'PhD en Ciencias de la Gestión (Management Sciences)',
      },
      {
        year: 1996,
        institution: 'Universidad Central de Chile',
        degree: 'Licenciatura en Psicología',
      },
    ],
    experiencia_profesional: [
      {
        empresa: 'Instituto Relacional',
        cargo: 'Director',
        funcion: 'Dirección estratégica y metodológica del Instituto Relacional (Barcelona / Chile)',
      },
      {
        empresa: 'Programa Los Pellines',
        cargo: 'Director Metodológico',
        funcion: 'Diseño e implementación metodológica del programa de transformación educativa Los Pellines',
      },
      {
        empresa: 'Fundación Nueva Educación',
        cargo: 'Director del Programa ATE',
        funcion: 'Dirección del programa de Asistencia Técnica Educativa y asesorías a escuelas MINEDUC',
      },
    ],
    referencias: null,
    especialidades: [
      'Gestión del cambio organizacional',
      'Liderazgo educativo',
      'Aprendizaje Basado en Proyectos (ABP)',
      'Educación Relacional',
      'Psicología organizacional',
      'Transformación cultural en escuelas',
    ],
    foto_path: 'propuestas/consultores/arnoldo-foto.png',
    cv_pdf_path: 'propuestas/consultores/arnoldo-cv.pdf',
    activo: true,
    orden: 1,
  },
  {
    nombre: 'María Gabriela Naranjo Armas',
    titulo: 'Directora de la FNE – IR Chile',
    categoria: 'equipo_fne',
    perfil_profesional:
      'Psicóloga con formación en Psicoterapia Corporal (IIBS, Suiza) y Máster en Recursos Humanos (Universidad Blanquerna, Barcelona). Directora de la Fundación Nueva Educación — Instituto Relacional Chile. Creó y lidera la entidad ATE de la FNE inscrita ante MINEDUC. Especialista en psicología organizacional, coaching ejecutivo y desarrollo de liderazgo en contextos educativos. Ha acompañado procesos de transformación en equipos directivos y docentes en múltiples establecimientos educacionales del país.',
    formacion_academica: [
      {
        year: 2011,
        institution: 'Instituto Internacional de Biosistémica (IIBS), Suiza',
        degree: 'Formación en Psicoterapia Corporal (2008–2011)',
      },
      {
        year: 2006,
        institution: 'Universidad Blanquerna, Barcelona',
        degree: 'Máster en Recursos Humanos (2004–2006)',
      },
      {
        year: 2002,
        institution: 'Universidad Central de Chile',
        degree: 'Licenciatura en Psicología (1997–2002)',
      },
    ],
    experiencia_profesional: [
      {
        empresa: 'Fundación Nueva Educación — IR Chile',
        cargo: 'Directora',
        funcion: 'Dirección ejecutiva de la FNE, gestión de la entidad ATE y liderazgo de programas de asesoría educativa',
      },
      {
        empresa: 'Instituto Relacional Chile',
        cargo: 'Consultora y Coach Ejecutiva',
        funcion: 'Acompañamiento a equipos directivos y docentes en procesos de desarrollo organizacional y liderazgo',
      },
    ],
    referencias: null,
    especialidades: [
      'Psicología organizacional',
      'Coaching ejecutivo',
      'Desarrollo de liderazgo',
      'Psicoterapia corporal aplicada a organizaciones',
      'Gestión de entidades ATE MINEDUC',
      'Transformación de equipos directivos',
    ],
    foto_path: 'propuestas/consultores/gabriela-foto.png',
    cv_pdf_path: 'propuestas/consultores/gabriela-cv.pdf',
    activo: true,
    orden: 2,
  },
  {
    nombre: 'Ignacio Andrés Pavez Barrio',
    titulo: 'Director de Investigación',
    categoria: 'equipo_fne',
    perfil_profesional:
      'Ingeniero Civil con PhD en Comportamiento Organizacional (Case Western Reserve University, EE.UU.). Director de Relaciona Consultores y Co-creador del modelo IDeIA (Indagación apreciativa aplicada a educación). Especialista en comportamiento organizacional, liderazgo educativo e investigación aplicada. Ha dirigido proyectos de investigación-acción en escuelas chilenas y organizaciones latinoamericanas, con foco en el fortalecimiento de capacidades institucionales y el desarrollo de comunidades de aprendizaje.',
    formacion_academica: [
      {
        year: 2017,
        institution: 'Case Western Reserve University, Cleveland, EE.UU.',
        degree: 'PhD en Comportamiento Organizacional (Organizational Behavior, 2011–2017)',
      },
      {
        year: 2007,
        institution: 'Pontificia Universidad Católica de Chile',
        degree: 'MSc en Ingeniería (2003–2007)',
      },
    ],
    experiencia_profesional: [
      {
        empresa: 'Relaciona Consultores',
        cargo: 'Director',
        funcion: 'Dirección de consultoría en desarrollo organizacional y liderazgo educativo para instituciones en Chile y Latinoamérica',
      },
      {
        empresa: 'IDeIA — Indagación apreciativa en Educación',
        cargo: 'Co-creador y Consultor Principal',
        funcion: 'Co-creación y aplicación del modelo IDeIA para el fortalecimiento de equipos y culturas escolares positivas',
      },
      {
        empresa: 'Fundación Nueva Educación',
        cargo: 'Director de Investigación',
        funcion: 'Diseño metodológico de programas y coordinación de investigación aplicada en asesorías ATE',
      },
    ],
    referencias: null,
    especialidades: [
      'Comportamiento organizacional',
      'Liderazgo educativo',
      'Indagación apreciativa',
      'Investigación acción participativa',
      'Desarrollo de comunidades de aprendizaje',
      'Aprendizaje Basado en Proyectos (ABP)',
    ],
    foto_path: 'propuestas/consultores/ignacio-foto.png',
    cv_pdf_path: 'propuestas/consultores/ignacio-cv.pdf',
    activo: true,
    orden: 3,
  },
];
