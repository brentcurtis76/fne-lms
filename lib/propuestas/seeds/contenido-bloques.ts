import type { PropuestaContenidoBloqueInsert } from '@/lib/propuestas/types';

/**
 * Seed data for propuesta_contenido_bloques
 * Skeleton methodology content blocks — PLACEHOLDER text only.
 * Actual content must be extracted from reference PDFs (William Taylor 2025, Llolleo)
 * in a follow-up task.
 *
 * Sources:
 *   - William Taylor 2025: ASESORÍA INTEGRAL...WILLIAM TAYLOR 2025.pdf
 *   - Llolleo: Llolleo proposal PDF
 */
export const BLOQUES_SEED: PropuestaContenidoBloqueInsert[] = [
  {
    clave: 'educacion_relacional',
    titulo: 'Modelo de Educación Relacional',
    contenido: {
      sections: [
        {
          type: 'heading',
          text: 'Educación Relacional',
          level: 1,
        },
        {
          type: 'paragraph',
          text: 'PLACEHOLDER — extract from William Taylor 2025, p.2. Describe the relational education model: the premise that learning is fundamentally relational and that the quality of relationships in a school community directly determines the quality of learning outcomes.',
        },
      ],
    },
    imagenes: null,
    programa_tipo: null, // universal — used in all program types
    orden: 1,
    activo: true,
  },
  {
    clave: 'modelo_consultoria_fases',
    titulo: 'Modelo de Consultoría: Fases INICIA / INSPIRA / EVOLUCIONA',
    contenido: {
      sections: [
        {
          type: 'heading',
          text: 'Nuestro Modelo de Consultoría',
          level: 1,
        },
        {
          type: 'paragraph',
          text: 'PLACEHOLDER — extract from William Taylor 2025, p.6-7. Describe the three-phase consulting model: INICIA (diagnosis and foundation-setting), INSPIRA (capacity building and inspiration), and EVOLUCIONA (sustained transformation and autonomy).',
        },
      ],
    },
    imagenes: [
      {
        key: 'fases-diagram',
        path: 'propuestas/infographics/modelo-fases-diagram.png',
        alt: 'Diagrama de las tres fases del modelo de consultoría: INICIA, INSPIRA, EVOLUCIONA',
      },
    ],
    programa_tipo: null,
    orden: 2,
    activo: true,
  },
  {
    clave: 'modelo_consultoria_elementos',
    titulo: 'Elementos Centrales del Modelo',
    contenido: {
      sections: [
        {
          type: 'heading',
          text: 'Los 5 Elementos del Modelo',
          level: 1,
        },
        {
          type: 'paragraph',
          text: 'PLACEHOLDER — extract from William Taylor 2025, p.8-9. Describe the 5 central elements of the FNE consulting methodology that underpin the three phases.',
        },
      ],
    },
    imagenes: [
      {
        key: 'cinco-elementos',
        path: 'propuestas/infographics/cinco-elementos.png',
        alt: 'Diagrama de los 5 elementos centrales del modelo metodológico FNE',
      },
    ],
    programa_tipo: null,
    orden: 3,
    activo: true,
  },
  {
    clave: 'generacion_tractor',
    titulo: 'Generación Tractor',
    contenido: {
      sections: [
        {
          type: 'heading',
          text: 'Generación Tractor',
          level: 1,
        },
        {
          type: 'paragraph',
          text: 'PLACEHOLDER — extract from William Taylor 2025, p.9-10. Describe the Generación Tractor concept: a core group of school leaders and teachers who lead internal change, act as multipliers of new practices, and sustain transformation beyond the consulting engagement.',
        },
      ],
    },
    imagenes: [
      {
        key: 'generacion-tractor',
        path: 'propuestas/infographics/generacion-tractor-diagram.png',
        alt: 'Diagrama del concepto Generación Tractor',
      },
    ],
    programa_tipo: 'evoluciona',
    orden: 4,
    activo: true,
  },
  {
    clave: 'proyecto_innova',
    titulo: 'Proyecto Innova',
    contenido: {
      sections: [
        {
          type: 'heading',
          text: 'Proyecto Innova',
          level: 1,
        },
        {
          type: 'paragraph',
          text: 'PLACEHOLDER — extract from William Taylor 2025, p.11-12. Describe the Proyecto Innova component: collaborative innovation projects designed and implemented by teachers with student participation, serving as the practical application vehicle for new pedagogical skills.',
        },
      ],
    },
    imagenes: null,
    programa_tipo: 'evoluciona',
    orden: 5,
    activo: true,
  },
  {
    clave: 'liderazgo_cambio',
    titulo: 'Liderazgo para el Cambio',
    contenido: {
      sections: [
        {
          type: 'heading',
          text: 'Liderazgo para el Cambio',
          level: 1,
        },
        {
          type: 'paragraph',
          text: 'PLACEHOLDER — extract from William Taylor 2025, p.13-14. Describe the leadership for change component: developing transformational leadership capacities in school directors and heads of technical-pedagogical units (UTP) to sustain innovation cultures.',
        },
      ],
    },
    imagenes: null,
    programa_tipo: null,
    orden: 6,
    activo: true,
  },
  {
    clave: 'acompanamiento_tecnico',
    titulo: 'Acompañamiento Técnico',
    contenido: {
      sections: [
        {
          type: 'heading',
          text: 'Acompañamiento Técnico Docente',
          level: 1,
        },
        {
          type: 'paragraph',
          text: 'PLACEHOLDER — extract from William Taylor 2025, p.15-16. Describe the technical accompaniment component: individualized and small-group coaching for teachers in the classroom, pedagogical design, and assessment practices aligned with ABP methodology.',
        },
      ],
    },
    imagenes: null,
    programa_tipo: null,
    orden: 7,
    activo: true,
  },
  {
    clave: 'comunidades_crecimiento',
    titulo: 'Comunidades de Crecimiento',
    contenido: {
      sections: [
        {
          type: 'heading',
          text: 'Comunidades de Crecimiento Profesional',
          level: 1,
        },
        {
          type: 'paragraph',
          text: 'PLACEHOLDER — extract from William Taylor 2025, p.17-18. Describe the professional learning communities component: structured collaborative spaces where teachers share practice, reflect on outcomes, and co-design improvements in a cycle of continuous professional learning.',
        },
      ],
    },
    imagenes: null,
    programa_tipo: null,
    orden: 8,
    activo: true,
  },
  {
    clave: 'inspira_estadias',
    titulo: 'Estadías INSPIRA',
    contenido: {
      sections: [
        {
          type: 'heading',
          text: 'Estadías INSPIRA',
          level: 1,
        },
        {
          type: 'paragraph',
          text: 'PLACEHOLDER — extract from William Taylor 2025, p.19-20. Describe the INSPIRA residencies: immersive two-day experiences at Los Pellines center where school teams engage in embodied learning, relational practice, and visioning for their school transformation journey.',
        },
      ],
    },
    imagenes: null,
    programa_tipo: 'evoluciona',
    orden: 9,
    activo: true,
  },
  {
    clave: 'plataforma_crecimiento',
    titulo: 'Plataforma de Crecimiento Digital',
    contenido: {
      sections: [
        {
          type: 'heading',
          text: 'Plataforma de Crecimiento',
          level: 1,
        },
        {
          type: 'paragraph',
          text: 'La Plataforma de Crecimiento Genera es el entorno digital de gestión del aprendizaje que soporta todo el proceso de cambio entre las sesiones presenciales. Asesores, líderes en terreno y sus equipos cuentan con un espacio donde acceder a contenidos audiovisuales, coordinar la formación de sus comunidades, favorecer la formación cruzada entre pares y desarrollar contenidos propios. En coherencia con el Modelo de Educación Relacional, Genera no es un repositorio pasivo de contenidos sino un espacio de encuentro: está diseñada para que el aprendizaje ocurra en relación con otros, promoviendo el intercambio, la co-creación y el reconocimiento del saber que cada educador aporta.',
        },
        {
          type: 'paragraph',
          text: 'Uno de los mayores beneficios de la plataforma son las herramientas para tomar "fotografías apreciativas" del estado actual de la escuela, permitiendo diseñar una ruta de mejora y evaluar el progreso. A través de instrumentos simples pero quirúrgicos, los líderes obtienen visibilidad sobre lo que ocurre en las aulas, las prácticas pedagógicas y las relaciones dentro de la comunidad educativa.',
        },
      ],
    },
    imagenes: null,
    programa_tipo: 'evoluciona',
    orden: 10,
    activo: true,
  },
  {
    clave: 'mec7',
    titulo: 'Modelo MEC7',
    contenido: {
      sections: [
        {
          type: 'heading',
          text: 'Marco de Efectividad y Calidad Educativa — MEC7',
          level: 1,
        },
        {
          type: 'paragraph',
          text: 'PLACEHOLDER — extract from Llolleo proposal (MEC7 section). Describe the MEC7 framework: the 7 dimensions of school effectiveness and quality used as the diagnostic and evaluation backbone for FNE consulting interventions.',
        },
      ],
    },
    imagenes: [
      {
        key: 'mec7-diagram',
        path: 'propuestas/infographics/mec7-diagram.png',
        alt: 'Diagrama del modelo MEC7 — 7 dimensiones de efectividad y calidad educativa',
      },
    ],
    programa_tipo: null,
    orden: 11,
    activo: true,
  },
  {
    clave: 'horizonte_cambio',
    titulo: 'Horizonte de Cambio — 5 Trayectorias',
    contenido: {
      sections: [
        {
          type: 'heading',
          text: 'Horizonte de Cambio',
          level: 1,
        },
        {
          type: 'paragraph',
          text: 'PLACEHOLDER — extract from Llolleo proposal (Horizonte de Cambio section). Describe the 5 trajectories of change that define the expected transformation arc for a school community engaged in an FNE consulting process.',
        },
      ],
    },
    imagenes: [
      {
        key: 'horizonte-cambio',
        path: 'propuestas/infographics/horizonte-cambio-diagram.png',
        alt: 'Diagrama del Horizonte de Cambio — 5 trayectorias',
      },
    ],
    programa_tipo: null,
    orden: 12,
    activo: true,
  },
  {
    clave: 'supuestos',
    titulo: 'Supuestos del Programa',
    contenido: {
      sections: [
        {
          type: 'heading',
          text: 'Supuestos del Programa',
          level: 1,
        },
        {
          type: 'paragraph',
          text: 'PLACEHOLDER — extract from Llolleo proposal (Supuestos section — 9 supuestos). List and explain the 9 foundational assumptions underlying the FNE consulting approach: the conditions and commitments required from the school community for the program to achieve its intended outcomes.',
        },
      ],
    },
    imagenes: null,
    programa_tipo: null,
    orden: 13,
    activo: true,
  },
];
