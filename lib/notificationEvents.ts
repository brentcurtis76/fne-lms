/**
 * Genera - Notification Events Registry
 *
 * Centralized configuration for all notification event types.
 * Provides type-safe defaults that can be overridden by database templates.
 *
 * Architecture: Hybrid (Code Defaults + DB Override)
 * - Code provides sensible defaults for all events
 * - Database templates can override when more flexibility is needed
 * - If DB template substitution fails, code defaults are used
 */

// ============================================
// EVENT DATA INTERFACES
// ============================================

/** Base interface for all event data */
export interface BaseEventData {
  [key: string]: unknown;
}

/** Course-related event data */
export interface CourseEventData extends BaseEventData {
  course?: {
    id?: string;
    name?: string;
  };
  assigned_by?: string;
  student_id?: string;
}

/** Module-related event data */
export interface ModuleEventData extends BaseEventData {
  module?: {
    id?: string;
    name?: string;
  };
  course?: {
    id?: string;
    name?: string;
  };
  student_id?: string;
}

/** Learning path event data */
export interface LearningPathEventData extends BaseEventData {
  learning_path?: {
    id?: string;
    name?: string;
  };
  assigned_by?: string;
}

/** Assignment-related event data */
export interface AssignmentEventData extends BaseEventData {
  assignment?: {
    id?: string;
    title?: string;
    due_date?: string;
  };
  student_id?: string;
  submission_id?: string;
}

/** Message-related event data */
export interface MessageEventData extends BaseEventData {
  sender?: {
    id?: string;
    name?: string;
  };
  message_preview?: string;
  message_id?: string;
  recipient_id?: string;
}

/** Mention event data */
export interface MentionEventData extends BaseEventData {
  mentioned_by?: {
    id?: string;
    name?: string;
  };
  workspace?: {
    id?: string;
    name?: string;
  };
  mentioned_user_id?: string;
  workspace_id?: string;
}

/** Feedback event data */
export interface FeedbackEventData extends BaseEventData {
  school?: {
    id?: string;
    name?: string;
  };
  feedback_preview?: string;
  feedback_id?: string;
  assigned_users?: string[];
}

/** Consultant assignment event data */
export interface ConsultantEventData extends BaseEventData {
  consultant?: {
    id?: string;
    name?: string;
  };
  student_id?: string;
}

/** System update event data */
export interface SystemUpdateEventData extends BaseEventData {
  update_title?: string;
  update_message?: string;
}

/** Union type for all event data types */
export type NotificationEventData =
  | CourseEventData
  | ModuleEventData
  | LearningPathEventData
  | AssignmentEventData
  | MessageEventData
  | MentionEventData
  | FeedbackEventData
  | ConsultantEventData
  | SystemUpdateEventData
  | BaseEventData;

// ============================================
// CONFIGURATION INTERFACE
// ============================================

/**
 * Event data accessor type for runtime flexibility.
 *
 * H-3 NOTE: We use Record<string, any> for the accessor because template
 * functions need to access nested properties dynamically (d.course?.name).
 * The typed interfaces above serve as documentation for expected data shapes.
 *
 * The template functions safely handle missing properties via optional
 * chaining, so undefined access returns undefined rather than throwing.
 *
 * For type-safe calls, use explicit typing:
 * @example
 * const data: CourseEventData = { course: { name: 'Test' } };
 * NOTIFICATION_EVENTS['course_assigned'].defaultTitle(data);
 */
type EventDataAccessor = Record<string, any>;

export interface NotificationEventConfig {
  /** Function to generate default title from event data */
  defaultTitle: (data: EventDataAccessor) => string;
  /** Function to generate default description from event data */
  defaultDescription: (data: EventDataAccessor) => string;
  /** Default URL to navigate to when notification is clicked */
  defaultUrl: string;
  /** Importance level: affects display priority and quiet hours behavior */
  importance: 'low' | 'normal' | 'high';
  /** Category for grouping and filtering notifications */
  category: string;
}

/**
 * Registry of all notification event configurations.
 *
 * To add a new event type:
 * 1. Add entry here with appropriate defaults
 * 2. Ensure the API route passes the expected data structure
 * 3. Optionally add a database template to override
 */
export const NOTIFICATION_EVENTS: Record<string, NotificationEventConfig> = {
  // ============================================
  // COURSE EVENTS
  // ============================================

  course_assigned: {
    defaultTitle: (d) =>
      d.course?.name
        ? `Nuevo curso asignado: ${d.course.name}`
        : 'Nuevo curso asignado',
    defaultDescription: (d) =>
      d.course?.name
        ? `Se te ha asignado el curso "${d.course.name}". Haz clic para comenzar tu aprendizaje.`
        : 'Se te ha asignado un nuevo curso.',
    defaultUrl: '/mi-aprendizaje',
    importance: 'normal',
    category: 'courses',
  },

  course_completed: {
    defaultTitle: (d) =>
      d.course?.name
        ? `¡Curso completado!: ${d.course.name}`
        : '¡Curso completado!',
    defaultDescription: (d) =>
      d.course?.name
        ? `Has completado exitosamente el curso "${d.course.name}". ¡Felicitaciones!`
        : 'Has completado un curso exitosamente.',
    defaultUrl: '/mi-aprendizaje',
    importance: 'normal',
    category: 'courses',
  },

  module_completed: {
    defaultTitle: (d) =>
      d.module?.name ? `Módulo completado: ${d.module.name}` : 'Módulo completado',
    defaultDescription: (d) => {
      const moduleName = d.module?.name || 'el módulo';
      const courseName = d.course?.name ? ` del curso "${d.course.name}"` : '';
      return `Has completado ${moduleName}${courseName}.`;
    },
    defaultUrl: '/mi-aprendizaje',
    importance: 'low',
    category: 'courses',
  },

  // ============================================
  // LEARNING PATH EVENTS
  // ============================================

  learning_path_assigned: {
    defaultTitle: (d) =>
      d.learning_path?.name
        ? `Nueva ruta asignada: ${d.learning_path.name}`
        : 'Nueva ruta de aprendizaje asignada',
    defaultDescription: (d) =>
      d.learning_path?.name
        ? `Se te ha asignado la ruta de aprendizaje "${d.learning_path.name}".`
        : 'Se te ha asignado una nueva ruta de aprendizaje.',
    defaultUrl: '/mi-aprendizaje',
    importance: 'normal',
    category: 'courses',
  },

  // ============================================
  // ASSIGNMENT EVENTS
  // ============================================

  assignment_created: {
    defaultTitle: (d) =>
      d.assignment?.title
        ? `Nueva tarea: ${d.assignment.title}`
        : 'Nueva tarea asignada',
    defaultDescription: (d) => {
      const title = d.assignment?.title || 'una nueva tarea';
      const dueDate = d.assignment?.due_date
        ? ` Fecha límite: ${new Date(d.assignment.due_date).toLocaleDateString('es-CL')}.`
        : '';
      return `Tienes asignada la tarea "${title}".${dueDate}`;
    },
    defaultUrl: '/assignments',
    importance: 'normal',
    category: 'assignments',
  },

  assignment_feedback: {
    defaultTitle: (d) =>
      d.assignment?.title
        ? `Retroalimentación recibida: ${d.assignment.title}`
        : 'Has recibido retroalimentación',
    defaultDescription: (d) =>
      d.assignment?.title
        ? `Tu tarea "${d.assignment.title}" ha sido revisada.`
        : 'Una de tus tareas ha sido revisada.',
    defaultUrl: '/assignments',
    importance: 'normal',
    category: 'assignments',
  },

  assignment_due_soon: {
    defaultTitle: (d) =>
      d.assignment?.title
        ? `Tarea próxima a vencer: ${d.assignment.title}`
        : 'Tarea próxima a vencer',
    defaultDescription: (d) => {
      const title = d.assignment?.title || 'una tarea';
      const dueDate = d.assignment?.due_date
        ? new Date(d.assignment.due_date).toLocaleDateString('es-CL')
        : 'pronto';
      return `La tarea "${title}" vence el ${dueDate}. No olvides completarla.`;
    },
    defaultUrl: '/assignments',
    importance: 'high',
    category: 'assignments',
  },

  // ============================================
  // MESSAGING EVENTS
  // ============================================

  message_sent: {
    defaultTitle: (d) =>
      d.sender?.name ? `Mensaje de ${d.sender.name}` : 'Nuevo mensaje',
    defaultDescription: (d) =>
      d.message_preview
        ? d.message_preview.substring(0, 120)
        : 'Has recibido un nuevo mensaje.',
    defaultUrl: '/messages',
    importance: 'normal',
    category: 'messaging',
  },

  user_mentioned: {
    defaultTitle: (d) =>
      d.mentioned_by?.name
        ? `${d.mentioned_by.name} te ha mencionado`
        : 'Te han mencionado',
    defaultDescription: (d) => {
      const where = d.workspace?.name ? ` en "${d.workspace.name}"` : '';
      return `Has sido mencionado en una conversación${where}.`;
    },
    defaultUrl: '/workspace',
    importance: 'normal',
    category: 'messaging',
  },

  // ============================================
  // ADMIN EVENTS
  // ============================================

  new_feedback: {
    defaultTitle: (d) => {
      const school = d.school?.name;
      return school ? `Nuevo feedback: ${school}` : 'Nuevo feedback recibido';
    },
    defaultDescription: (d) => {
      const preview = d.feedback_preview?.substring(0, 100);
      return preview ? `${preview}...` : 'Un usuario ha enviado nuevo feedback.';
    },
    defaultUrl: '/admin/feedback',
    importance: 'high',
    category: 'admin',
  },

  consultant_assigned: {
    defaultTitle: (d) =>
      d.consultant?.name
        ? `Nuevo consultor asignado: ${d.consultant.name}`
        : 'Consultor asignado',
    defaultDescription: (d) =>
      d.consultant?.name
        ? `${d.consultant.name} ha sido asignado como tu consultor.`
        : 'Se te ha asignado un nuevo consultor.',
    defaultUrl: '/mi-perfil',
    importance: 'normal',
    category: 'admin',
  },

  // ============================================
  // QA TESTING EVENTS
  // ============================================

  qa_test_failed: {
    defaultTitle: (d) =>
      d.scenario_name
        ? `QA Fallo: ${d.scenario_name}`
        : 'Fallo en prueba QA',
    defaultDescription: (d) => {
      const step = d.step_index ? `Paso ${d.step_index}` : 'Un paso';
      const tester = d.tester_email ? ` (probado por ${d.tester_email})` : '';
      return `${step} falló: "${d.step_instruction || 'Sin descripción'}"${tester}`;
    },
    defaultUrl: '/admin/qa',
    importance: 'high',
    category: 'admin',
  },

  qa_scenario_assigned: {
    defaultTitle: (d) => {
      const count = d.scenario_count || 1;
      return count > 1
        ? `${count} escenarios QA asignados`
        : 'Nuevo escenario QA asignado';
    },
    defaultDescription: (d) => {
      const count = d.scenario_count || 1;
      const names = d.scenario_names as string[] | undefined;
      const dueDate = d.due_date
        ? ` Fecha límite: ${new Date(d.due_date as string).toLocaleDateString('es-CL')}.`
        : '';

      if (count === 1 && names && names.length > 0) {
        return `Se te ha asignado el escenario "${names[0]}".${dueDate}`;
      }
      return `Se te han asignado ${count} escenarios para pruebas QA.${dueDate}`;
    },
    defaultUrl: '/qa',
    importance: 'normal',
    category: 'qa',
  },

  // ============================================
  // SYSTEM EVENTS
  // ============================================

  system_update: {
    defaultTitle: (d) => d.update_title || 'Actualización del sistema',
    defaultDescription: (d) =>
      d.update_message || 'Hay una nueva actualización disponible en la plataforma.',
    defaultUrl: '/dashboard',
    importance: 'low',
    category: 'system',
  },
};

/**
 * Get the configuration for an event type with fallback to generic defaults.
 *
 * @param eventType - The event type to get configuration for
 * @returns NotificationEventConfig for the event type, or generic fallback
 */
export function getEventConfig(eventType: string): NotificationEventConfig {
  return (
    NOTIFICATION_EVENTS[eventType] || {
      defaultTitle: () => 'Nueva notificación',
      defaultDescription: () => 'Tienes una nueva notificación en la plataforma.',
      defaultUrl: '/dashboard',
      importance: 'normal' as const,
      category: 'system',
    }
  );
}

/**
 * Check if an event type has a registered configuration.
 * Useful for validation and debugging.
 *
 * @param eventType - The event type to check
 * @returns true if event type has a registered config
 */
export function hasEventConfig(eventType: string): boolean {
  return eventType in NOTIFICATION_EVENTS;
}

/**
 * Get list of all registered event types.
 * Useful for admin interfaces and debugging.
 *
 * @returns Array of registered event type names
 */
export function getRegisteredEventTypes(): string[] {
  return Object.keys(NOTIFICATION_EVENTS);
}
