-- =========================================
-- FNE LMS NOTIFICATION SYSTEM DATABASE SCHEMA
-- =========================================
-- This script creates the complete notification system foundation
-- for the FNE Learning Management System
--
-- Tables Created:
-- 1. notification_types - Defines available notification types
-- 2. notifications - Core notification storage  
-- 3. user_notification_preferences - User preference settings
--
-- Indexes Created for Performance Optimization
-- RLS Policies for Security
-- =========================================

-- Enable RLS on all tables
BEGIN;

-- =========================================
-- 1. NOTIFICATION TYPES TABLE
-- =========================================
-- Defines the types of notifications available in the system
CREATE TABLE IF NOT EXISTS notification_types (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  default_enabled BOOLEAN DEFAULT TRUE,
  category VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE notification_types ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Everyone can read notification types
CREATE POLICY "notification_types_select_policy" ON notification_types
FOR SELECT TO authenticated
USING (true);

-- =========================================
-- 2. CORE NOTIFICATIONS TABLE
-- =========================================
-- Stores all notifications sent to users
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL REFERENCES notification_types(id),
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  entity_type VARCHAR(50), -- course, message, assignment, workspace, etc.
  entity_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  
  -- Add constraints
  CONSTRAINT notifications_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT notifications_message_not_empty CHECK (length(trim(message)) > 0)
);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notifications
CREATE POLICY "notifications_select_policy" ON notifications
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "notifications_insert_policy" ON notifications
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_update_policy" ON notifications
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete_policy" ON notifications
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- =========================================
-- 3. USER NOTIFICATION PREFERENCES TABLE
-- =========================================
-- Stores user preferences for each notification type
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) REFERENCES notification_types(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT TRUE,
  in_app_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one preference per user per notification type
  UNIQUE(user_id, notification_type)
);

-- Enable RLS
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user preferences
CREATE POLICY "user_notification_preferences_select_policy" ON user_notification_preferences
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "user_notification_preferences_insert_policy" ON user_notification_preferences
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_notification_preferences_update_policy" ON user_notification_preferences
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_notification_preferences_delete_policy" ON user_notification_preferences
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- =========================================
-- 4. PERFORMANCE INDEXES
-- =========================================

-- Notifications table indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(entity_type, entity_id);

-- User preferences indexes
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_id ON user_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_type ON user_notification_preferences(notification_type);

-- =========================================
-- 5. DEFAULT NOTIFICATION TYPES
-- =========================================
-- Insert default notification types for the FNE LMS system

INSERT INTO notification_types (id, name, description, default_enabled, category) VALUES
-- Course-related notifications
('course_assigned', 'Curso Asignado', 'Notificación cuando se asigna un nuevo curso', true, 'courses'),
('course_completed', 'Curso Completado', 'Notificación cuando se completa un curso', true, 'courses'),
('lesson_available', 'Nueva Lección Disponible', 'Notificación cuando una nueva lección está disponible', true, 'courses'),

-- Assignment-related notifications  
('assignment_created', 'Nueva Tarea Creada', 'Notificación cuando se crea una nueva tarea', true, 'assignments'),
('assignment_due', 'Tarea Próxima a Vencer', 'Recordatorio de tarea próxima a vencer', true, 'assignments'),
('assignment_graded', 'Tarea Calificada', 'Notificación cuando se califica una tarea', true, 'assignments'),

-- Workspace/Community notifications
('message_received', 'Nuevo Mensaje', 'Notificación de nuevo mensaje en el espacio colaborativo', true, 'workspace'),
('mention_received', 'Te han Mencionado', 'Notificación cuando alguien te menciona', true, 'workspace'),
('meeting_scheduled', 'Reunión Programada', 'Notificación de nueva reunión programada', true, 'workspace'),
('document_shared', 'Documento Compartido', 'Notificación cuando se comparte un documento', true, 'workspace'),

-- System notifications
('system_maintenance', 'Mantenimiento del Sistema', 'Notificaciones sobre mantenimiento programado', true, 'system'),
('system_update', 'Actualización del Sistema', 'Notificaciones sobre nuevas funcionalidades', false, 'system'),
('account_security', 'Seguridad de Cuenta', 'Notificaciones relacionadas con la seguridad', true, 'system'),

-- Administrative notifications
('user_approved', 'Usuario Aprobado', 'Notificación cuando un usuario es aprobado', true, 'admin'),
('role_assigned', 'Rol Asignado', 'Notificación cuando se asigna un nuevo rol', true, 'admin'),
('consultant_assigned', 'Consultor Asignado', 'Notificación de asignación de consultor', true, 'admin')

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  default_enabled = EXCLUDED.default_enabled,
  category = EXCLUDED.category;

-- =========================================
-- 6. HELPER FUNCTIONS
-- =========================================

-- Function to create notification
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type VARCHAR(50),
  p_title VARCHAR(200),
  p_message TEXT,
  p_entity_type VARCHAR(50) DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  notification_id UUID;
BEGIN
  -- Insert the notification
  INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_entity_type, p_entity_id, p_metadata)
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$;

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notifications 
  SET is_read = true, read_at = NOW()
  WHERE id = notification_id AND user_id = auth.uid();
  
  RETURN FOUND;
END;
$$;

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO unread_count
  FROM notifications
  WHERE user_id = p_user_id AND is_read = false;
  
  RETURN COALESCE(unread_count, 0);
END;
$$;

-- =========================================
-- 7. TRIGGERS FOR UPDATED_AT
-- =========================================

-- Update updated_at trigger for user_notification_preferences
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_notification_preferences_updated_at 
    BEFORE UPDATE ON user_notification_preferences 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- =========================================
-- MIGRATION COMPLETE
-- =========================================
-- The notification system is now ready for use.
-- Tables created: notification_types, notifications, user_notification_preferences
-- Includes RLS policies, indexes, helper functions, and default data.
-- =========================================