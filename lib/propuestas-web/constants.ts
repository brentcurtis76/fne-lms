/**
 * Shared constants for proposal web views and PDF generation.
 */

export const FNE_CONTACT_EMAIL = 'info@nuevaeducacion.org';
export const FNE_CONTACT_PHONE = '+56 9 4162 3577';
export const FNE_ORG_NAME = 'Fundación Nueva Educación';
export const FNE_TAGLINE = 'Transformando comunidades educativas';

/**
 * International advisors — FNE's fixed advisory network.
 * Rendered in the "Asesores Internacionales" section.
 * Future: make configurable per-proposal via snapshot.
 */
export const INTERNATIONAL_ADVISORS = [
  {
    nombre: 'Coral Regí',
    titulo: 'Comité Internacional — Ex-Directora Escola Virolai',
    bio: 'Bióloga y educadora, ex-directora de la Escuela Virolai. Asesora internacional y miembro del comité científico de Educación Mañana, la Junta de la Sociedad Catalana de Pedagogía y el Consejo Escolar de Cataluña desde 2014. Colabora con Fundación Bofill, Fundación Carulla y el Comité Internacional de FNE.',
    fotoPath: '/images/consultants/coral-regi-circle.png',
    formacion: null,
    experiencia: null,
    especialidades: null,
  },
  {
    nombre: 'Jordi Mussons',
    titulo: 'Comité Internacional — Director Escola Sadako',
    bio: 'Maestro y director de Escola Sadako de Barcelona desde 2006, institución referente en innovación educativa a nivel internacional. Estudió Biología y encontró en el escultismo la clave para educar desde la responsabilidad y el compromiso sostenible y social. Miembro de la junta directiva de AEC.',
    fotoPath: '/images/consultants/jordi-mussons-circle.png',
    formacion: null,
    experiencia: null,
    especialidades: null,
  },
  {
    nombre: 'Boris Mir',
    titulo: 'Comité Internacional — Director Adjunto Institut Angeleta Ferrer',
    bio: 'Profesor de educación secundaria experto en aprendizaje y en transformación educativa. Fundador y director del Instituto Angeleta Ferrer. Promotor del Instituto-Escuela Les Vinyes. Director adjunto del Programa Escola Nova 21 (UNESCO). Impulsor de proyectos en evaluación formativa, estrategias de aprendizaje y creatividad.',
    fotoPath: '/images/consultants/boris-mir-circle.png',
    formacion: null,
    experiencia: null,
    especialidades: null,
  },
  {
    nombre: 'Sandra Entrena',
    titulo: 'Comité Internacional — Directora Escola Virolai',
    bio: 'Directora de Escola Virolai, una de las escuelas líderes del cambio hacia el nuevo paradigma educativo en Europa. Educadora de larga trayectoria como formadora de profesores en Barcelona. Pilar formativo de Escola Nova 21. Diseñó programas en metodologías activas, evaluación formativa e innovación. Lideró proyecto finalista Wise Awards 2017.',
    fotoPath: '/images/consultants/sandra-entrena-circle.png',
    formacion: null,
    experiencia: null,
    especialidades: null,
  },
  {
    nombre: 'Anna Comas',
    titulo: 'Comité Internacional — Ex-Directora Escola La Maquinista',
    bio: 'Fue la directora de la escuela de La Maquinista, un proyecto educativo innovador que se ha transformado en un referente de cambio. Licenciada en Filosofía y Ciencias de la Educación. Colaboradora con la UB, UAB, Diputación y el Departamento de Educación de Catalunya. Actualmente mentora en el Programa de Mejora y Transformación de las Islas Baleares.',
    fotoPath: '/images/consultants/anna-comas-circle.png',
    formacion: null,
    experiencia: null,
    especialidades: null,
  },
  {
    nombre: 'Pepe Menéndez',
    titulo: 'Comité Internacional — Ex-Director Adjunto Jesuitas Educació',
    bio: 'Director adjunto de Jesuitas Educació, promotor del proyecto Horizonte 2020 para la transformación profunda de la educación de las escuelas Jesuitas de Catalunya. Autor de "Educar para la Vida" (2024) y "Escuelas que valgan la pena" (2020). Participó en seminarios sobre Nueva Educación en Chile.',
    fotoPath: '/images/consultants/pepe-menendez-circle.png',
    formacion: null,
    experiencia: null,
    especialidades: null,
  },
  {
    nombre: 'Joan Quintana',
    titulo: 'Comité Internacional — Psicólogo y Director Instituto Relacional',
    bio: 'Psicólogo especializado en Comportamiento y Desarrollo Organizacional y en Coaching Relacional, con experiencia en organizaciones públicas, privadas, educación y salud. Co-fundador del Instituto Relacional, formador en competencias relacionales docentes y director del programa de Dirección Avanzada en RRHH en ESADE. Coautor de "Anticípate" y "Relaciones Poderosas".',
    fotoPath: '/images/consultants/joan-quintana-circle.png',
    formacion: null,
    experiencia: null,
    especialidades: null,
  },
] as const;
