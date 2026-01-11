/**
 * Spanish Content Templates
 * Realistic Spanish educational content for demo data
 */

import type { MeetingStatus, TaskStatus, TaskPriority } from '../../../types/meetings';

// Spanish names for realistic demo users
export const SPANISH_FIRST_NAMES = {
  female: [
    'Maria', 'Carmen', 'Ana', 'Valentina', 'Sofia', 'Francisca',
    'Isidora', 'Catalina', 'Javiera', 'Antonia', 'Martina', 'Florencia',
    'Camila', 'Fernanda', 'Paula', 'Constanza'
  ],
  male: [
    'Jose', 'Carlos', 'Miguel', 'Andres', 'Sebastian', 'Matias',
    'Diego', 'Felipe', 'Nicolas', 'Alejandro', 'Gabriel', 'Cristobal',
    'Benjamin', 'Vicente', 'Tomas', 'Martin'
  ]
};

export const SPANISH_LAST_NAMES = [
  'Rodriguez', 'Gonzalez', 'Martinez', 'Lopez', 'Hernandez',
  'Garcia', 'Perez', 'Sanchez', 'Ramirez', 'Torres',
  'Munoz', 'Vargas', 'Silva', 'Soto', 'Contreras',
  'Reyes', 'Morales', 'Ortiz', 'Gutierrez', 'Rojas',
  'Diaz', 'Flores', 'Castillo', 'Espinoza', 'Araya'
];

// Meeting templates with realistic educational content
export interface MeetingTemplate {
  title: string;
  description: string;
  status: MeetingStatus;
  summary: string;
  agreements: string[];
  commitments: Array<{
    text: string;
    priority: TaskPriority;
    status: TaskStatus;
    progressMin: number;
    progressMax: number;
  }>;
  tasks: Array<{
    title: string;
    description: string;
    priority: TaskPriority;
    status: TaskStatus;
    category: string;
  }>;
}

export const MEETING_TEMPLATES: MeetingTemplate[] = [
  {
    title: 'Reunion de Comunidad - Planificacion Semestral',
    description: 'Planificacion colaborativa para el segundo semestre 2024. Revision de objetivos y estrategias pedagogicas.',
    status: 'completada',
    summary: 'Se revisaron los objetivos del semestre anterior y se establecieron las metas para el segundo semestre. El equipo acordo implementar nuevas estrategias de evaluacion formativa.',
    agreements: [
      'Implementar evaluacion formativa en todas las asignaturas del ciclo',
      'Compartir recursos digitales en la carpeta Drive compartida semanalmente',
      'Realizar observacion de clases entre pares al menos una vez al mes',
      'Documentar buenas practicas pedagogicas en el portafolio digital'
    ],
    commitments: [
      { text: 'Preparar rubrica de evaluacion formativa para matematicas', priority: 'alta', status: 'completado', progressMin: 100, progressMax: 100 },
      { text: 'Organizar y etiquetar carpeta compartida de recursos', priority: 'media', status: 'completado', progressMin: 100, progressMax: 100 },
      { text: 'Coordinar calendario de observaciones de aula', priority: 'alta', status: 'en_progreso', progressMin: 60, progressMax: 80 }
    ],
    tasks: [
      { title: 'Revisar planificaciones del semestre', priority: 'alta', status: 'completado', description: 'Revision de todas las planificaciones para alinear con objetivos', category: 'planificacion' },
      { title: 'Actualizar indicadores de aprendizaje', priority: 'media', status: 'completado', description: 'Actualizacion de indicadores segun nuevas bases curriculares', category: 'evaluacion' },
      { title: 'Preparar material de apoyo diferenciado', priority: 'alta', status: 'en_progreso', description: 'Material para estudiantes con diferentes ritmos de aprendizaje', category: 'recursos' },
      { title: 'Disenar encuesta de retroalimentacion', priority: 'media', status: 'completado', description: 'Encuesta para recoger opinion de apoderados', category: 'comunicacion' },
      { title: 'Crear banco de actividades interactivas', priority: 'baja', status: 'pendiente', description: 'Actividades digitales para trabajo autonomo', category: 'recursos' }
    ]
  },
  {
    title: 'Seguimiento de Compromisos Pedagogicos',
    description: 'Reunion de seguimiento para revisar avance de compromisos adquiridos en reuniones anteriores.',
    status: 'completada',
    summary: 'Se reviso el avance de los compromisos del mes anterior. La mayoria de las tareas estan en buen progreso. Se identificaron algunos obstaculos que requieren apoyo adicional.',
    agreements: [
      'Mantener registro semanal de avance en planilla compartida',
      'Solicitar apoyo al equipo directivo cuando sea necesario',
      'Celebrar los logros del equipo en reunion mensual',
      'Ajustar plazos solo con justificacion fundamentada'
    ],
    commitments: [
      { text: 'Completar capacitacion en evaluacion formativa', priority: 'alta', status: 'en_progreso', progressMin: 70, progressMax: 90 },
      { text: 'Elaborar informe de progreso estudiantil', priority: 'media', status: 'en_progreso', progressMin: 40, progressMax: 60 },
      { text: 'Preparar presentacion para reunion de apoderados', priority: 'alta', status: 'pendiente', progressMin: 0, progressMax: 20 }
    ],
    tasks: [
      { title: 'Revisar cumplimiento de compromisos anteriores', priority: 'alta', status: 'completado', description: 'Verificar estado de cada compromiso pendiente', category: 'seguimiento' },
      { title: 'Identificar obstaculos y proponer soluciones', priority: 'alta', status: 'completado', description: 'Analisis de barreras para el cumplimiento', category: 'analisis' },
      { title: 'Actualizar cronograma de actividades', priority: 'media', status: 'en_progreso', description: 'Ajuste de fechas segun nuevas prioridades', category: 'planificacion' },
      { title: 'Documentar aprendizajes del proceso', priority: 'baja', status: 'pendiente', description: 'Registro de lecciones aprendidas', category: 'documentacion' },
      { title: 'Preparar agenda para proxima reunion', priority: 'media', status: 'completado', description: 'Definicion de temas prioritarios', category: 'organizacion' }
    ]
  },
  {
    title: 'Evaluacion de Practicas Innovadoras',
    description: 'Analisis del impacto de las nuevas metodologias implementadas en el aula.',
    status: 'completada',
    summary: 'Se presentaron resultados de la implementacion de metodologias activas. Los datos muestran mejora en la participacion estudiantil. Se acordaron ajustes para optimizar las practicas.',
    agreements: [
      'Continuar con metodologia de aprendizaje basado en proyectos',
      'Incorporar mas instancias de trabajo colaborativo entre estudiantes',
      'Utilizar tecnologia como apoyo, no como reemplazo de la interaccion',
      'Evaluar impacto trimestralmente con indicadores definidos'
    ],
    commitments: [
      { text: 'Disenar proyecto interdisciplinario para tercer trimestre', priority: 'alta', status: 'en_progreso', progressMin: 30, progressMax: 50 },
      { text: 'Crear guia de implementacion de trabajo colaborativo', priority: 'media', status: 'pendiente', progressMin: 0, progressMax: 10 },
      { text: 'Elaborar instrumento de evaluacion de impacto', priority: 'alta', status: 'en_progreso', progressMin: 50, progressMax: 70 }
    ],
    tasks: [
      { title: 'Analizar datos de participacion estudiantil', priority: 'alta', status: 'completado', description: 'Revision de metricas de engagement en clases', category: 'analisis' },
      { title: 'Recopilar testimonios de estudiantes', priority: 'media', status: 'completado', description: 'Entrevistas breves sobre experiencia de aprendizaje', category: 'investigacion' },
      { title: 'Comparar resultados con periodo anterior', priority: 'alta', status: 'en_progreso', description: 'Analisis comparativo de desempeno', category: 'evaluacion' },
      { title: 'Identificar mejores practicas replicables', priority: 'media', status: 'en_progreso', description: 'Documentacion de estrategias exitosas', category: 'documentacion' },
      { title: 'Planificar jornada de intercambio de experiencias', priority: 'baja', status: 'pendiente', description: 'Organizacion de encuentro entre comunidades', category: 'eventos' }
    ]
  },
  {
    title: 'Coordinacion de Proyecto Institucional',
    description: 'Reunion para coordinar la participacion en el proyecto de innovacion institucional.',
    status: 'en_progreso',
    summary: 'En desarrollo. Se esta definiendo la participacion de la comunidad en el proyecto institucional de innovacion pedagogica.',
    agreements: [
      'Cada docente aportara al menos una actividad innovadora al proyecto',
      'Se realizaran reuniones quincenales de coordinacion',
      'Los recursos desarrollados seran compartidos con toda la institucion',
      'Se documentara el proceso para futuras referencias'
    ],
    commitments: [
      { text: 'Definir rol de cada integrante en el proyecto', priority: 'alta', status: 'en_progreso', progressMin: 40, progressMax: 60 },
      { text: 'Elaborar cronograma detallado de actividades', priority: 'alta', status: 'pendiente', progressMin: 10, progressMax: 30 },
      { text: 'Coordinar con otras comunidades participantes', priority: 'media', status: 'pendiente', progressMin: 0, progressMax: 15 }
    ],
    tasks: [
      { title: 'Revisar objetivos del proyecto institucional', priority: 'alta', status: 'completado', description: 'Comprension de metas y alcance del proyecto', category: 'planificacion' },
      { title: 'Asignar responsabilidades especificas', priority: 'alta', status: 'en_progreso', description: 'Distribucion de tareas segun fortalezas', category: 'organizacion' },
      { title: 'Crear espacio de trabajo compartido', priority: 'media', status: 'en_progreso', description: 'Configuracion de herramientas colaborativas', category: 'tecnologia' },
      { title: 'Establecer indicadores de exito', priority: 'alta', status: 'pendiente', description: 'Definicion de metricas para evaluar progreso', category: 'evaluacion' },
      { title: 'Preparar presentacion inicial del equipo', priority: 'media', status: 'pendiente', description: 'Material para presentar al resto de la institucion', category: 'comunicacion' }
    ]
  },
  {
    title: 'Preparacion Cierre de Semestre',
    description: 'Planificacion de actividades de cierre y evaluacion del semestre.',
    status: 'programada',
    summary: 'Reunion programada para planificar las actividades de cierre del semestre academico.',
    agreements: [
      'Definir calendario de evaluaciones finales',
      'Coordinar ceremonia de reconocimiento estudiantil',
      'Preparar informes para apoderados',
      'Planificar jornada de reflexion docente'
    ],
    commitments: [
      { text: 'Elaborar calendario de evaluaciones finales', priority: 'alta', status: 'pendiente', progressMin: 0, progressMax: 0 },
      { text: 'Preparar lista de estudiantes destacados', priority: 'media', status: 'pendiente', progressMin: 0, progressMax: 0 },
      { text: 'Disenar formato de informe semestral', priority: 'alta', status: 'pendiente', progressMin: 0, progressMax: 0 }
    ],
    tasks: [
      { title: 'Revisar pendientes del semestre', priority: 'alta', status: 'pendiente', description: 'Identificar tareas incompletas', category: 'organizacion' },
      { title: 'Coordinar fechas de evaluaciones', priority: 'alta', status: 'pendiente', description: 'Evitar sobreposicion de pruebas', category: 'planificacion' },
      { title: 'Preparar ceremonia de reconocimiento', priority: 'media', status: 'pendiente', description: 'Organizacion de evento de cierre', category: 'eventos' },
      { title: 'Elaborar informe de gestion semestral', priority: 'alta', status: 'pendiente', description: 'Documento resumen de logros y desafios', category: 'documentacion' },
      { title: 'Planificar vacaciones administrativas', priority: 'baja', status: 'pendiente', description: 'Coordinacion de periodos de descanso', category: 'administrativo' }
    ]
  }
];

// Role labels in Spanish
export const ROLE_LABELS = {
  docente: 'Docente',
  lider_comunidad: 'Lider de Comunidad',
  lider_generacion: 'Lider de Generacion',
  equipo_directivo: 'Equipo Directivo',
  admin: 'Administrador',
  consultor: 'Consultor FNE'
};
