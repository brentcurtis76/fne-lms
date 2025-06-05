-- FNE LMS - Sample User Notifications for Testing
-- Creates realistic sample notifications for testing the notification bell system

-- First, get some notification type IDs for reference
-- You'll need to replace these UUIDs with actual IDs from your notification_types table

-- Sample notifications for testing (replace user_id with actual test user ID)
-- These queries use the helper function to create notifications

-- Admin notifications
SELECT create_user_notification(
  '00000000-0000-0000-0000-000000000000'::UUID, -- Replace with actual user ID
  (SELECT id FROM notification_types WHERE name = 'Usuario Aprobado' LIMIT 1),
  'Tu cuenta ha sido aprobada',
  'Bienvenido a la plataforma FNE. Tu cuenta ha sido aprobada por un administrador y ya puedes acceder a todos los cursos.',
  '/dashboard'
);

SELECT create_user_notification(
  '00000000-0000-0000-0000-000000000000'::UUID, -- Replace with actual user ID
  (SELECT id FROM notification_types WHERE name = 'Consultor Asignado' LIMIT 1),
  'Nuevo consultor asignado',
  'Se te ha asignado un nuevo consultor para tu programa de formación. Revisa los detalles en tu panel.',
  '/profile'
);

-- Course notifications
SELECT create_user_notification(
  '00000000-0000-0000-0000-000000000000'::UUID, -- Replace with actual user ID
  (SELECT id FROM notification_types WHERE name = 'Curso Asignado' LIMIT 1),
  'Nuevo curso disponible: Liderazgo Educativo',
  'Se te ha asignado el curso "Liderazgo Educativo en el Siglo XXI". ¡Comienza tu aprendizaje ahora!',
  '/student/course/123'
);

SELECT create_user_notification(
  '00000000-0000-0000-0000-000000000000'::UUID, -- Replace with actual user ID
  (SELECT id FROM notification_types WHERE name = 'Lección Disponible' LIMIT 1),
  'Nueva lección disponible',
  'La lección "Estrategias de Motivación" ya está disponible en tu curso actual.',
  '/student/lesson/456'
);

-- Assignment notifications
SELECT create_user_notification(
  '00000000-0000-0000-0000-000000000000'::UUID, -- Replace with actual user ID
  (SELECT id FROM notification_types WHERE name = 'Tarea Creada' LIMIT 1),
  'Nueva tarea asignada',
  'Se te ha asignado una nueva tarea: "Análisis de Caso Práctico". Fecha límite: 15 de junio.',
  '/assignments/789'
);

SELECT create_user_notification(
  '00000000-0000-0000-0000-000000000000'::UUID, -- Replace with actual user ID
  (SELECT id FROM notification_types WHERE name = 'Tarea Próxima a Vencer' LIMIT 1),
  'Tarea próxima a vencer',
  'Tu tarea "Proyecto Final" vence en 2 días. No olvides entregarla a tiempo.',
  '/assignments/101'
);

-- Messaging notifications
SELECT create_user_notification(
  '00000000-0000-0000-0000-000000000000'::UUID, -- Replace with actual user ID
  (SELECT id FROM notification_types WHERE name = 'Mensaje Recibido' LIMIT 1),
  'Nuevo mensaje de María González',
  'Has recibido un nuevo mensaje en el espacio colaborativo sobre el proyecto de innovación.',
  '/community/workspace?tab=messaging'
);

-- System notifications
SELECT create_user_notification(
  '00000000-0000-0000-0000-000000000000'::UUID, -- Replace with actual user ID
  (SELECT id FROM notification_types WHERE name = 'Actualización del Sistema' LIMIT 1),
  'Actualización de la plataforma',
  'La plataforma se actualizará el sábado de 2:00 a 4:00 AM. Durante este tiempo no estará disponible.',
  '/dashboard'
);

-- Workspace notifications
SELECT create_user_notification(
  '00000000-0000-0000-0000-000000000000'::UUID, -- Replace with actual user ID
  (SELECT id FROM notification_types WHERE name = 'Documento Compartido' LIMIT 1),
  'Documento compartido contigo',
  'Juan Pérez ha compartido el documento "Guía de Implementación 2025" en el espacio colaborativo.',
  '/community/workspace?tab=documents'
);

SELECT create_user_notification(
  '00000000-0000-0000-0000-000000000000'::UUID, -- Replace with actual user ID
  (SELECT id FROM notification_types WHERE name = 'Reunión Programada' LIMIT 1),
  'Reunión programada para mañana',
  'Reunión de seguimiento programada para mañana a las 15:00. Revisa la agenda y documentos adjuntos.',
  '/community/workspace?tab=meetings'
);

-- Create a script to insert sample notifications for any user
CREATE OR REPLACE FUNCTION create_sample_notifications_for_user(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  notifications_created INTEGER := 0;
BEGIN
  -- Admin notifications
  PERFORM create_user_notification(
    p_user_id,
    (SELECT id FROM notification_types WHERE name = 'Usuario Aprobado' LIMIT 1),
    'Tu cuenta ha sido aprobada',
    'Bienvenido a la plataforma FNE. Tu cuenta ha sido aprobada por un administrador.',
    '/dashboard'
  );
  notifications_created := notifications_created + 1;

  -- Course notifications
  PERFORM create_user_notification(
    p_user_id,
    (SELECT id FROM notification_types WHERE name = 'Curso Asignado' LIMIT 1),
    'Nuevo curso disponible: Liderazgo Educativo',
    'Se te ha asignado el curso "Liderazgo Educativo en el Siglo XXI".',
    '/student/course/123'
  );
  notifications_created := notifications_created + 1;

  PERFORM create_user_notification(
    p_user_id,
    (SELECT id FROM notification_types WHERE name = 'Lección Disponible' LIMIT 1),
    'Nueva lección disponible',
    'La lección "Estrategias de Motivación" ya está disponible.',
    '/student/lesson/456'
  );
  notifications_created := notifications_created + 1;

  -- Assignment notifications
  PERFORM create_user_notification(
    p_user_id,
    (SELECT id FROM notification_types WHERE name = 'Tarea Creada' LIMIT 1),
    'Nueva tarea asignada',
    'Tarea: "Análisis de Caso Práctico". Fecha límite: 15 de junio.',
    '/assignments/789'
  );
  notifications_created := notifications_created + 1;

  -- Messaging notifications
  PERFORM create_user_notification(
    p_user_id,
    (SELECT id FROM notification_types WHERE name = 'Mensaje Recibido' LIMIT 1),
    'Nuevo mensaje de María González',
    'Mensaje sobre el proyecto de innovación en el espacio colaborativo.',
    '/community/workspace?tab=messaging'
  );
  notifications_created := notifications_created + 1;

  -- System notifications
  PERFORM create_user_notification(
    p_user_id,
    (SELECT id FROM notification_types WHERE name = 'Actualización del Sistema' LIMIT 1),
    'Actualización de la plataforma',
    'Mantenimiento programado el sábado de 2:00 a 4:00 AM.',
    '/dashboard'
  );
  notifications_created := notifications_created + 1;

  -- Workspace notifications  
  PERFORM create_user_notification(
    p_user_id,
    (SELECT id FROM notification_types WHERE name = 'Documento Compartido' LIMIT 1),
    'Documento compartido contigo',
    'Juan Pérez compartió "Guía de Implementación 2025".',
    '/community/workspace?tab=documents'
  );
  notifications_created := notifications_created + 1;

  PERFORM create_user_notification(
    p_user_id,
    (SELECT id FROM notification_types WHERE name = 'Reunión Programada' LIMIT 1),
    'Reunión programada para mañana',
    'Reunión de seguimiento mañana a las 15:00.',
    '/community/workspace?tab=meetings'
  );
  notifications_created := notifications_created + 1;

  RETURN notifications_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Example usage:
-- SELECT create_sample_notifications_for_user('your-user-id-here'::UUID);