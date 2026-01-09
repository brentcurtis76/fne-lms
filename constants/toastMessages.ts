/**
 * Spanish Toast Messages for Genera
 * Standardized messages for consistent user communication
 */

export const TOAST_MESSAGES = {
  // CRUD Operations
  CRUD: {
    // Success messages
    CREATE_SUCCESS: (entity: string) => `${entity} creado exitosamente`,
    CREATE_SUCCESS_FEMALE: (entity: string) => `${entity} creada exitosamente`,
    UPDATE_SUCCESS: (entity: string) => `${entity} actualizado exitosamente`,
    UPDATE_SUCCESS_FEMALE: (entity: string) => `${entity} actualizada exitosamente`,
    DELETE_SUCCESS: (entity: string) => `${entity} eliminado exitosamente`,
    DELETE_SUCCESS_FEMALE: (entity: string) => `${entity} eliminada exitosamente`,
    SAVE_SUCCESS: 'Cambios guardados exitosamente',
    
    // Error messages
    CREATE_ERROR: (entity: string, error?: string) => 
      error ? `Error al crear ${entity.toLowerCase()}: ${error}` : `Error al crear ${entity.toLowerCase()}`,
    UPDATE_ERROR: (entity: string, error?: string) => 
      error ? `Error al actualizar ${entity.toLowerCase()}: ${error}` : `Error al actualizar ${entity.toLowerCase()}`,
    DELETE_ERROR: (entity: string, error?: string) => 
      error ? `Error al eliminar ${entity.toLowerCase()}: ${error}` : `Error al eliminar ${entity.toLowerCase()}`,
    LOAD_ERROR: (entity: string, error?: string) => 
      error ? `Error al cargar ${entity.toLowerCase()}: ${error}` : `Error al cargar ${entity.toLowerCase()}`,
    SAVE_ERROR: 'Error al guardar los cambios',
    
    // Loading messages
    CREATING: (entity: string) => `Creando ${entity.toLowerCase()}...`,
    UPDATING: (entity: string) => `Actualizando ${entity.toLowerCase()}...`,
    DELETING: (entity: string) => `Eliminando ${entity.toLowerCase()}...`,
    LOADING: (entity: string) => `Cargando ${entity.toLowerCase()}...`,
    SAVING: 'Guardando cambios...',
  },

  // Authentication
  AUTH: {
    LOGIN_SUCCESS: 'Sesión iniciada correctamente',
    LOGOUT_SUCCESS: 'Sesión cerrada correctamente',
    PASSWORD_CHANGED: 'Contraseña actualizada exitosamente',
    PASSWORD_RESET_SENT: 'Se ha enviado un enlace de recuperación a tu correo',
    SESSION_EXPIRED: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente',
    
    LOGIN_ERROR: 'Error al iniciar sesión. Verifica tus credenciales',
    LOGOUT_ERROR: 'Error al cerrar sesión',
    PASSWORD_ERROR: 'Error al actualizar la contraseña',
    AUTH_ERROR: 'Error de autenticación',
    UNAUTHORIZED: 'No tienes permisos para realizar esta acción',
  },

  // File Operations
  FILE: {
    UPLOAD_SUCCESS: (fileName: string) => `${fileName} subido exitosamente`,
    UPLOAD_ERROR: (error?: string) => 
      error ? `Error al subir el archivo: ${error}` : 'Error al subir el archivo',
    DELETE_SUCCESS: 'Archivo eliminado exitosamente',
    DELETE_ERROR: 'Error al eliminar el archivo',
    SIZE_ERROR: (maxSize: string) => `El archivo excede el tamaño máximo permitido de ${maxSize}`,
    TYPE_ERROR: 'Tipo de archivo no permitido',
    
    UPLOADING: 'Subiendo archivo...',
    PROCESSING: 'Procesando archivo...',
  },

  // Form Validation
  VALIDATION: {
    REQUIRED_FIELDS: 'Por favor completa todos los campos requeridos',
    INVALID_EMAIL: 'Correo electrónico inválido',
    INVALID_PHONE: 'Número de teléfono inválido',
    INVALID_DATE: 'Fecha inválida',
    PASSWORDS_DONT_MATCH: 'Las contraseñas no coinciden',
    WEAK_PASSWORD: 'La contraseña debe tener al menos 8 caracteres',
    INVALID_FORMAT: 'Formato inválido',
  },

  // Network
  NETWORK: {
    CONNECTION_ERROR: 'Error de conexión. Verifica tu conexión a internet',
    SERVER_ERROR: 'Error del servidor. Por favor, intenta más tarde',
    TIMEOUT: 'La operación tardó demasiado. Por favor, intenta nuevamente',
    UNEXPECTED_ERROR: 'Error inesperado. Por favor, intenta nuevamente',
  },

  // User Management
  USER: {
    APPROVED: (userName: string) => `Usuario ${userName} aprobado exitosamente`,
    REJECTED: (userName: string) => `Usuario ${userName} rechazado`,
    ROLE_UPDATED: 'Rol actualizado exitosamente',
    PROFILE_UPDATED: 'Perfil actualizado correctamente',
    AVATAR_UPDATED: 'Foto de perfil actualizada',
    PASSWORD_RESET: 'Contraseña restablecida exitosamente',
    
    APPROVAL_ERROR: 'Error al aprobar el usuario',
    ROLE_ERROR: 'Error al actualizar el rol',
    PROFILE_ERROR: 'Error al actualizar el perfil',
  },

  // Course Management
  COURSE: {
    ENROLLED: 'Inscripción exitosa',
    COMPLETED: 'Curso completado',
    PROGRESS_SAVED: 'Progreso guardado',
    LESSON_COMPLETED: 'Lección completada',
    
    ENROLLMENT_ERROR: 'Error al inscribirse en el curso',
    PROGRESS_ERROR: 'Error al guardar el progreso',
  },

  // Assignment Management
  ASSIGNMENT: {
    SUBMITTED: 'Tarea enviada exitosamente',
    GRADED: 'Tarea calificada',
    FEEDBACK_SENT: 'Retroalimentación enviada',
    
    SUBMISSION_ERROR: 'Error al enviar la tarea',
    GRADING_ERROR: 'Error al calificar la tarea',
  },

  // Group Operations
  GROUP: {
    CREATED: 'Grupo creado exitosamente',
    JOINED: 'Te has unido al grupo',
    LEFT: 'Has salido del grupo',
    MEMBER_ADDED: 'Miembro agregado al grupo',
    MEMBER_REMOVED: 'Miembro eliminado del grupo',
    
    JOIN_ERROR: 'Error al unirse al grupo',
    LEAVE_ERROR: 'Error al salir del grupo',
  },

  // Community/Collaboration
  COMMUNITY: {
    POST_CREATED: 'Publicación creada exitosamente',
    POST_DELETED: 'Publicación eliminada',
    COMMENT_ADDED: 'Comentario agregado',
    LIKED: 'Me gusta agregado',
    SAVED: 'Guardado exitosamente',
    
    POST_ERROR: 'Error al crear la publicación',
    COMMENT_ERROR: 'Error al agregar el comentario',
  },

  // Notifications
  NOTIFICATION: {
    SENT: 'Notificación enviada',
    MARKED_READ: 'Notificación marcada como leída',
    PREFERENCES_UPDATED: 'Preferencias de notificación actualizadas',
    
    SEND_ERROR: 'Error al enviar la notificación',
    UPDATE_ERROR: 'Error al actualizar las preferencias',
  },

  // Contract Management
  CONTRACT: {
    CREATED: 'Contrato creado exitosamente',
    SIGNED: 'Contrato firmado',
    UPDATED: 'Contrato actualizado',
    ANNEX_ADDED: 'Anexo agregado al contrato',
    
    CREATE_ERROR: 'Error al crear el contrato',
    SIGN_ERROR: 'Error al firmar el contrato',
  },

  // Report Generation
  REPORT: {
    GENERATED: 'Reporte generado exitosamente',
    EXPORTED: 'Reporte exportado exitosamente',
    DOWNLOADING: 'Descargando reporte...',
    
    GENERATION_ERROR: 'Error al generar el reporte',
    EXPORT_ERROR: 'Error al exportar el reporte',
  },

  // Dev Mode
  DEV: {
    IMPERSONATION_START: 'Suplantación iniciada correctamente',
    IMPERSONATION_END: 'Suplantación terminada correctamente',
    IMPERSONATION_ERROR: 'Error al iniciar suplantación',
  },

  // Generic Actions
  GENERIC: {
    SUCCESS: 'Operación exitosa',
    ERROR: 'Ha ocurrido un error',
    LOADING: 'Cargando...',
    COPIED: 'Copiado al portapapeles',
    SENT: 'Enviado exitosamente',
    CANCELLED: 'Operación cancelada',
    CONFIRM_DELETE: '¿Estás seguro de que deseas eliminar?',
  },
};

// Helper function to get the appropriate gendered message
export const getGenderedMessage = (
  entity: string,
  messageType: 'CREATE' | 'UPDATE' | 'DELETE',
  isSuccess: boolean = true,
  isFemale: boolean = false,
  error?: string
): string => {
  const suffix = isSuccess ? '_SUCCESS' : '_ERROR';
  const genderSuffix = isFemale && isSuccess ? '_FEMALE' : '';
  const key = `${messageType}${suffix}${genderSuffix}`;
  
  const getMessage = TOAST_MESSAGES.CRUD[key as keyof typeof TOAST_MESSAGES.CRUD];
  if (typeof getMessage === 'function') {
    return isSuccess ? getMessage(entity) : getMessage(entity, error);
  }
  
  return TOAST_MESSAGES.GENERIC.ERROR;
};

// Common entity names with their gender for proper Spanish grammar
export const ENTITY_GENDERS = {
  // Masculine
  usuario: false,
  curso: false,
  módulo: false,
  contrato: false,
  archivo: false,
  grupo: false,
  reporte: false,
  rol: false,
  
  // Feminine
  tarea: true,
  lección: true,
  pregunta: true,
  respuesta: true,
  notificación: true,
  publicación: true,
  imagen: true,
  contraseña: true,
  sesión: true,
  comunidad: true,
};