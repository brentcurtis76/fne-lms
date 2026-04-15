export type TutorialVideo = {
  title: string;
  vimeoId: string;
  durationMin: number;
  textSteps?: string[];
};

export type TutorialSectionId =
  | 'mi-aprendizaje'
  | 'mis-sesiones'
  | 'mis-reportes'
  | 'mis-horas'
  | 'proceso-de-cambio'
  | 'espacio-colaborativo';

export type TutorialSection = {
  id: TutorialSectionId;
  title: string;
  overview: TutorialVideo;
  deepDives: TutorialVideo[];
};

export const TUTORIALS: Record<TutorialSectionId, TutorialSection> = {
  'mi-aprendizaje': {
    id: 'mi-aprendizaje',
    title: 'Mi Aprendizaje',
    overview: {
      title: 'Cómo encontrar y retomar tus cursos',
      vimeoId: '',
      durationMin: 3,
    },
    deepDives: [
      {
        title: 'Qué significa cada estado: Comenzar / Continuar / Completado',
        vimeoId: '',
        durationMin: 1,
      },
    ],
  },
  'mis-sesiones': {
    id: 'mis-sesiones',
    title: 'Mis Sesiones',
    overview: {
      title: 'Tu día a día en Mis Sesiones',
      vimeoId: '',
      durationMin: 3,
    },
    deepDives: [
      {
        title: 'Las 6 pestañas de una sesión',
        vimeoId: '',
        durationMin: 2,
      },
      {
        title: 'Exportar sesiones a tu calendario (iCal)',
        vimeoId: '',
        durationMin: 1,
      },
    ],
  },
  'mis-reportes': {
    id: 'mis-reportes',
    title: 'Mis Reportes',
    overview: {
      title: 'Leer tus reportes de sesiones',
      vimeoId: '',
      durationMin: 3,
    },
    deepDives: [],
  },
  'mis-horas': {
    id: 'mis-horas',
    title: 'Mis Horas',
    overview: {
      title: 'Revisar tus horas y exportarlas',
      vimeoId: '',
      durationMin: 2,
    },
    deepDives: [
      {
        title: 'Por qué mis horas ejecutadas vs. penalizadas difieren',
        vimeoId: '',
        durationMin: 1,
      },
    ],
  },
  'proceso-de-cambio': {
    id: 'proceso-de-cambio',
    title: 'Proceso de Cambio',
    overview: {
      title: 'Cómo completar un Proceso de Cambio de principio a fin',
      vimeoId: '',
      durationMin: 4,
    },
    deepDives: [
      {
        title: 'Entender la jerarquía: Objetivos, Acciones e Indicadores',
        vimeoId: '',
        durationMin: 2,
      },
      {
        title: 'Los 5 tipos de indicador',
        vimeoId: '',
        durationMin: 2,
      },
      {
        title: 'Cobertura como gate',
        vimeoId: '',
        durationMin: 1,
      },
      {
        title: 'Guardado automático, progreso y envío',
        vimeoId: '',
        durationMin: 1,
      },
      {
        title: 'Ver tus resultados',
        vimeoId: '',
        durationMin: 1,
      },
    ],
  },
  'espacio-colaborativo': {
    id: 'espacio-colaborativo',
    title: 'Espacio Colaborativo',
    overview: {
      title: 'Tu comunidad de crecimiento',
      vimeoId: '',
      durationMin: 4,
    },
    deepDives: [
      {
        title: 'Documentos: subir, carpetas, permisos',
        vimeoId: '',
        durationMin: 2,
      },
      {
        title: 'Mensajería: hilos, menciones, adjuntos',
        vimeoId: '',
        durationMin: 2,
      },
      {
        title: 'Reuniones: crear acta',
        vimeoId: '',
        durationMin: 1,
      },
    ],
  },
};
