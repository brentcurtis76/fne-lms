/**
 * QA Tours Configuration
 *
 * Tour definitions for QA admin pages using driver.js.
 * All text is in Spanish to match the application language.
 */

import { DriveStep } from 'driver.js';

// Valid tour IDs as a const array for type safety
export const VALID_TOUR_IDS = [
  'qa-dashboard',
  'qa-coverage',
  'qa-load-tests',
  'qa-lighthouse',
  'qa-feature-checklist'
] as const;

// Type for valid tour IDs
export type ValidTourId = typeof VALID_TOUR_IDS[number];

export interface TourConfig {
  id: ValidTourId;
  name: string;
  description: string;
  steps: DriveStep[];
}

// Type guard to check if a string is a valid tour ID
export function isValidTourId(tourId: string): tourId is ValidTourId {
  return (VALID_TOUR_IDS as readonly string[]).includes(tourId);
}

// QA Dashboard Tour
export const qaDashboardTour: TourConfig = {
  id: 'qa-dashboard',
  name: 'Panel de QA',
  description: 'Introduccion al centro de control de pruebas de calidad',
  steps: [
    {
      popover: {
        title: 'Bienvenido al Panel de QA',
        description: 'Este es tu centro de control para gestionar pruebas y escenarios de calidad. Aqui puedes monitorear el estado de las pruebas, ver tendencias y acceder a todas las herramientas de QA.',
        side: 'bottom',
        align: 'center'
      }
    },
    {
      element: '[data-tour="scenario-buttons"]',
      popover: {
        title: 'Gestionar Escenarios',
        description: 'Crea y administra escenarios de prueba. Usa "Gestionar Asignaciones" para asignar pruebas a testers y "Checklist de Cobertura" para rastrear la cobertura de funcionalidades.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="metrics-cards"]',
      popover: {
        title: 'Metricas Clave',
        description: 'Monitorea escenarios activos, ejecuciones totales, tasa de exito y cobertura de features. Estas metricas te dan una vista rapida del estado de calidad del proyecto.',
        side: 'bottom',
        align: 'center'
      }
    },
    {
      element: '[data-tour="trends-chart"]',
      popover: {
        title: 'Tendencias de Pruebas',
        description: 'Visualiza el historial de pruebas pasadas y fallidas en el tiempo. Puedes filtrar por semana, mes o ver todo el historial.',
        side: 'top',
        align: 'center'
      }
    },
    {
      element: '[data-tour="additional-tools"]',
      popover: {
        title: 'Herramientas Adicionales',
        description: 'Accede a Rendimiento (Lighthouse y Web Vitals), Cobertura de Codigo y Pruebas de Carga para un analisis completo de la calidad.',
        side: 'bottom',
        align: 'start'
      }
    }
  ]
};

// QA Coverage Tour
export const qaCoverageTour: TourConfig = {
  id: 'qa-coverage',
  name: 'Cobertura de Codigo',
  description: 'Como rastrear la cobertura de tests automatizados',
  steps: [
    {
      popover: {
        title: 'Cobertura de Codigo',
        description: 'Rastrea que porcentaje de tu codigo esta cubierto por tests automatizados. Esta herramienta te ayuda a identificar areas del codigo que necesitan mas pruebas.',
        side: 'bottom',
        align: 'center'
      }
    },
    {
      element: '[data-tour="register-button"]',
      popover: {
        title: 'Registrar Reporte',
        description: 'Sube reportes de cobertura generados por Istanbul/NYC desde tu CI/CD pipeline. Puedes registrar manualmente los porcentajes de cobertura.',
        side: 'left',
        align: 'start'
      }
    },
    {
      element: '[data-tour="metrics-explanation"]',
      popover: {
        title: 'Metricas de Cobertura',
        description: 'Monitorea lineas, funciones, ramas (branches) y statements cubiertos por tests. El objetivo es mantener una cobertura alta en todas estas metricas.',
        side: 'bottom',
        align: 'center'
      }
    }
  ]
};

// QA Load Tests Tour
export const qaLoadTestsTour: TourConfig = {
  id: 'qa-load-tests',
  name: 'Pruebas de Carga',
  description: 'Monitoreo de rendimiento bajo condiciones de estres',
  steps: [
    {
      popover: {
        title: 'Pruebas de Carga',
        description: 'Mide el rendimiento de tu aplicacion bajo condiciones de estres. Aqui puedes ver como responde el sistema con multiples usuarios simultaneos.',
        side: 'bottom',
        align: 'center'
      }
    },
    {
      element: '[data-tour="register-button"]',
      popover: {
        title: 'Registrar Resultado',
        description: 'Importa resultados de herramientas como k6 o Artillery. Registra metricas como tiempo de respuesta, usuarios virtuales y tasa de error.',
        side: 'left',
        align: 'start'
      }
    },
    {
      element: '[data-tour="key-metrics"]',
      popover: {
        title: 'Metricas Clave',
        description: 'Analiza tiempos de respuesta P95 (percentil 95), tasa de error y requests por segundo. Estas metricas son cruciales para entender el rendimiento real.',
        side: 'bottom',
        align: 'center'
      }
    }
  ]
};

// QA Lighthouse Tour
export const qaLighthouseTour: TourConfig = {
  id: 'qa-lighthouse',
  name: 'Rendimiento Web',
  description: 'Monitoreo de velocidad y experiencia de usuario',
  steps: [
    {
      popover: {
        title: 'Rendimiento Web',
        description: 'Monitorea la velocidad y experiencia de usuario de tu aplicacion. Combina datos reales de usuarios (Web Vitals) con auditorias de Lighthouse.',
        side: 'bottom',
        align: 'center'
      }
    },
    {
      element: '[data-tour="vitals-tab"]',
      popover: {
        title: 'Web Vitals',
        description: 'Metricas reales de usuarios: LCP (Largest Contentful Paint - tiempo de carga), INP (Interaction to Next Paint - interactividad), CLS (Cumulative Layout Shift - estabilidad visual).',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="lighthouse-tab"]',
      popover: {
        title: 'Auditorias Lighthouse',
        description: 'Puntuaciones de Performance, Accesibilidad, Best Practices y SEO. Estas auditorias te ayudan a identificar oportunidades de mejora.',
        side: 'bottom',
        align: 'start'
      }
    }
  ]
};

// QA Feature Checklist Tour
export const qaFeatureChecklistTour: TourConfig = {
  id: 'qa-feature-checklist',
  name: 'Checklist de Features',
  description: 'Rastreo de cobertura por funcionalidad',
  steps: [
    {
      popover: {
        title: 'Checklist de Features',
        description: 'Rastrea que funcionalidades estan cubiertas por pruebas de QA. Esta herramienta te ayuda a garantizar que todas las features criticas tengan tests.',
        side: 'bottom',
        align: 'center'
      }
    },
    {
      element: '[data-tour="coverage-indicator"]',
      popover: {
        title: 'Indicador de Cobertura',
        description: 'Porcentaje de features con al menos un test pasado. El objetivo es alcanzar 100% de cobertura en features criticas.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="feature-list"]',
      popover: {
        title: 'Lista de Features',
        description: 'Marca features como criticas y registra su estado de prueba. Las features criticas se destacan para priorizar su cobertura.',
        side: 'top',
        align: 'center'
      }
    }
  ]
};

// Export all tours with proper typing
export const qaTours: Record<ValidTourId, TourConfig> = {
  'qa-dashboard': qaDashboardTour,
  'qa-coverage': qaCoverageTour,
  'qa-load-tests': qaLoadTestsTour,
  'qa-lighthouse': qaLighthouseTour,
  'qa-feature-checklist': qaFeatureChecklistTour
};

// Get tour by ID with type safety
export function getTourById(tourId: string): TourConfig | null {
  if (!isValidTourId(tourId)) {
    console.warn(`[qa-tours] Invalid tour ID: ${tourId}`);
    return null;
  }
  return qaTours[tourId];
}
