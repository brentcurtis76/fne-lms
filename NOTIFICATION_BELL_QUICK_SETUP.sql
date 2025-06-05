-- ===============================================
-- FNE LMS - Notification Bell System Quick Setup
-- ===============================================
-- Copy and paste this entire script into Supabase SQL Editor
-- This creates the complete notification bell system

-- 1. Create user_notifications table
CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type_id UUID NOT NULL REFERENCES notification_types(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  related_url VARCHAR(500),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON user_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_is_read ON user_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_user_notifications_type ON user_notifications(notification_type_id);

-- 3. Enable Row Level Security
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
-- Policy: Users can only see their own notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON user_notifications;
CREATE POLICY "Users can view own notifications" ON user_notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can update their own notifications (mark as read)
DROP POLICY IF EXISTS "Users can update own notifications" ON user_notifications;
CREATE POLICY "Users can update own notifications" ON user_notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: System can insert notifications for any user
DROP POLICY IF EXISTS "System can insert notifications" ON user_notifications;
CREATE POLICY "System can insert notifications" ON user_notifications
  FOR INSERT WITH CHECK (true);

-- Policy: Admins can view all notifications
DROP POLICY IF EXISTS "Admins can view all notifications" ON user_notifications;
CREATE POLICY "Admins can view all notifications" ON user_notifications
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- 5. Helper function to create a notification
CREATE OR REPLACE FUNCTION create_user_notification(
  p_user_id UUID,
  p_notification_type_id UUID,
  p_title VARCHAR(255),
  p_description TEXT DEFAULT NULL,
  p_related_url VARCHAR(500) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO user_notifications (
    user_id,
    notification_type_id,
    title,
    description,
    related_url
  ) VALUES (
    p_user_id,
    p_notification_type_id,
    p_title,
    p_description,
    p_related_url
  ) RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Helper function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(
  p_notification_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE user_notifications 
  SET is_read = TRUE, read_at = NOW()
  WHERE id = p_notification_id AND user_id = p_user_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Helper function to mark all notifications as read for a user
CREATE OR REPLACE FUNCTION mark_all_notifications_read(
  p_user_id UUID
) RETURNS INTEGER AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE user_notifications 
  SET is_read = TRUE, read_at = NOW()
  WHERE user_id = p_user_id AND is_read = FALSE;
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Helper function to get unread notification count for a user
CREATE OR REPLACE FUNCTION get_unread_notification_count(
  p_user_id UUID
) RETURNS INTEGER AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unread_count
  FROM user_notifications
  WHERE user_id = p_user_id AND is_read = FALSE;
  
  RETURN unread_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Function to create sample notifications for any user
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

-- ===============================================
-- 🎯 SETUP COMPLETE! 
-- ===============================================

-- To create sample notifications for testing, run:
-- SELECT create_sample_notifications_for_user('your-user-id-here'::UUID);

-- To verify the setup, run:
-- SELECT COUNT(*) as total_notifications FROM user_notifications;
-- SELECT COUNT(*) as unread_notifications FROM user_notifications WHERE is_read = FALSE;

-- The notification bell should now work in your FNE LMS application!