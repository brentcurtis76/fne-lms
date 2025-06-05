-- ====================================================================
-- FNE LMS - PHASE 3 NOTIFICATION TRIGGERS SYSTEM
-- Automated notification generation for all user events
-- ====================================================================

-- 1. CREATE NOTIFICATION TRIGGERS TABLE
-- ====================================================================
CREATE TABLE IF NOT EXISTS notification_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL, -- 'assignment_created', 'message_sent', etc.
    trigger_condition JSONB, -- Additional conditions for the trigger
    notification_template JSONB NOT NULL, -- Template for notification content
    category VARCHAR(50) NOT NULL, -- 'tareas', 'mensajes', 'cursos', etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient trigger lookups
CREATE INDEX IF NOT EXISTS idx_notification_triggers_event_type ON notification_triggers(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_triggers_active ON notification_triggers(is_active);

-- 2. UPDATE EXISTING TABLES FOR TRIGGER TRACKING
-- ====================================================================

-- Add notification tracking to assignments
ALTER TABLE assignments 
ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS due_reminder_sent BOOLEAN DEFAULT false;

-- Add notification tracking to messages (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages' AND table_schema = 'public') THEN
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT false;
    ELSE
        -- Create workspace_messages table if it doesn't exist (for messaging system)
        CREATE TABLE IF NOT EXISTS workspace_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
            recipient_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            subject VARCHAR(255),
            thread_id UUID,
            context VARCHAR(100) DEFAULT 'direct_message',
            sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            notification_sent BOOLEAN DEFAULT false,
            is_read BOOLEAN DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        -- Create index for efficient queries
        CREATE INDEX IF NOT EXISTS idx_workspace_messages_recipient ON workspace_messages(recipient_id);
        CREATE INDEX IF NOT EXISTS idx_workspace_messages_sender ON workspace_messages(sender_id);
        CREATE INDEX IF NOT EXISTS idx_workspace_messages_thread ON workspace_messages(thread_id);
        
        -- Enable RLS
        ALTER TABLE workspace_messages ENABLE ROW LEVEL SECURITY;
        
        -- RLS policies for workspace_messages
        CREATE POLICY "Users can view their own messages" ON workspace_messages
            FOR SELECT USING (
                auth.uid() = sender_id OR auth.uid() = recipient_id
            );
            
        CREATE POLICY "Users can send messages" ON workspace_messages
            FOR INSERT WITH CHECK (auth.uid() = sender_id);
            
        CREATE POLICY "Users can update their sent messages" ON workspace_messages
            FOR UPDATE USING (auth.uid() = sender_id);
    END IF;
END $$;

-- Add notification tracking to course enrollments
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'course_enrollments' AND table_schema = 'public') THEN
        ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS completion_notification_sent BOOLEAN DEFAULT false;
    ELSE
        -- Create course_completions table for tracking completions
        CREATE TABLE IF NOT EXISTS course_completions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
            course_id UUID NOT NULL,
            module_id UUID,
            completion_type VARCHAR(20) NOT NULL CHECK (completion_type IN ('course', 'module')),
            completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            completion_notification_sent BOOLEAN DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id, course_id, module_id, completion_type)
        );
        
        -- Create index for efficient queries
        CREATE INDEX IF NOT EXISTS idx_course_completions_user ON course_completions(user_id);
        CREATE INDEX IF NOT EXISTS idx_course_completions_course ON course_completions(course_id);
        
        -- Enable RLS
        ALTER TABLE course_completions ENABLE ROW LEVEL SECURITY;
        
        -- RLS policies for course_completions
        CREATE POLICY "Users can view their own completions" ON course_completions
            FOR SELECT USING (auth.uid() = user_id);
            
        CREATE POLICY "Users can insert their own completions" ON course_completions
            FOR INSERT WITH CHECK (auth.uid() = user_id);
            
        CREATE POLICY "Admins can view all completions" ON course_completions
            FOR ALL USING (
                EXISTS (
                    SELECT 1 FROM profiles 
                    WHERE profiles.id = auth.uid() 
                    AND profiles.role = 'admin'
                )
            );
    END IF;
END $$;

-- Add notification tracking to consultant assignments (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consultant_assignments' AND table_schema = 'public') THEN
        ALTER TABLE consultant_assignments ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Create additional tables needed for the notification system
CREATE TABLE IF NOT EXISTS assignment_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL,
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    instructor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    feedback_text TEXT NOT NULL,
    grade DECIMAL(5,2),
    status VARCHAR(50) DEFAULT 'reviewed',
    provided_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(assignment_id, student_id)
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_assignment_feedback_student ON assignment_feedback(student_id);
CREATE INDEX IF NOT EXISTS idx_assignment_feedback_assignment ON assignment_feedback(assignment_id);

-- Enable RLS
ALTER TABLE assignment_feedback ENABLE ROW LEVEL SECURITY;

-- RLS policies for assignment_feedback
CREATE POLICY "Students can view their own feedback" ON assignment_feedback
    FOR SELECT USING (auth.uid() = student_id);
    
CREATE POLICY "Instructors can manage feedback" ON assignment_feedback
    FOR ALL USING (
        auth.uid() = instructor_id OR 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'docente')
        )
    );

-- Create user_mentions table for mention tracking
CREATE TABLE IF NOT EXISTS user_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    mentioned_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    context VARCHAR(255) NOT NULL,
    discussion_id UUID,
    content TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_mentions_mentioned ON user_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_user_mentions_author ON user_mentions(author_id);

-- Enable RLS
ALTER TABLE user_mentions ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_mentions
CREATE POLICY "Users can view mentions involving them" ON user_mentions
    FOR SELECT USING (
        auth.uid() = author_id OR auth.uid() = mentioned_user_id
    );
    
CREATE POLICY "Users can create mentions" ON user_mentions
    FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Create system_updates table for system notifications
CREATE TABLE IF NOT EXISTS system_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    version VARCHAR(50),
    features JSONB DEFAULT '[]'::jsonb,
    importance VARCHAR(20) DEFAULT 'low' CHECK (importance IN ('low', 'normal', 'high')),
    target_users VARCHAR(50) DEFAULT 'all',
    published_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_system_updates_published ON system_updates(published_at);
CREATE INDEX IF NOT EXISTS idx_system_updates_importance ON system_updates(importance);

-- Enable RLS
ALTER TABLE system_updates ENABLE ROW LEVEL SECURITY;

-- RLS policies for system_updates
CREATE POLICY "All users can view published updates" ON system_updates
    FOR SELECT USING (is_published = true);
    
CREATE POLICY "Admins can manage updates" ON system_updates
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 3. CREATE EVENT LOG TABLE FOR AUDIT TRAIL
-- ====================================================================
CREATE TABLE IF NOT EXISTS notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    trigger_id UUID REFERENCES notification_triggers(id),
    notifications_created INTEGER DEFAULT 0,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'success' -- 'success', 'failed', 'partial'
);

-- Create index for event tracking
CREATE INDEX IF NOT EXISTS idx_notification_events_type ON notification_events(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_events_processed ON notification_events(processed_at);

-- 4. INSERT DEFAULT TRIGGER TEMPLATES
-- ====================================================================

-- Assignment Creation Trigger
INSERT INTO notification_triggers (event_type, notification_template, category, trigger_condition) VALUES
('assignment_created', '{
  "title_template": "Nueva tarea asignada",
  "description_template": "Se te ha asignado la tarea ''{assignment_name}'' en el curso de {course_name}",
  "url_template": "/cursos/{course_id}/tareas/{assignment_id}",
  "importance": "normal"
}', 'tareas', '{"enabled": true, "immediate": true}');

-- Message/Mention Trigger
INSERT INTO notification_triggers (event_type, notification_template, category, trigger_condition) VALUES
('message_sent', '{
  "title_template": "Mensaje de instructor",
  "description_template": "{sender_name} te ha enviado un mensaje",
  "url_template": "/mensajes/{message_id}",
  "importance": "high"
}', 'mensajes', '{"enabled": true, "immediate": true}');

-- Mention Trigger
INSERT INTO notification_triggers (event_type, notification_template, category, trigger_condition) VALUES
('user_mentioned', '{
  "title_template": "Nueva mención",
  "description_template": "Te han mencionado en {context}",
  "url_template": "/discussion/{discussion_id}",
  "importance": "high"
}', 'mensajes', '{"enabled": true, "immediate": true}');

-- Assignment Feedback Trigger
INSERT INTO notification_triggers (event_type, notification_template, category, trigger_condition) VALUES
('assignment_feedback', '{
  "title_template": "Retroalimentación recibida",
  "description_template": "Has recibido feedback para tu tarea ''{assignment_name}''",
  "url_template": "/cursos/{course_id}/tareas/{assignment_id}/feedback",
  "importance": "normal"
}', 'tareas', '{"enabled": true, "immediate": true}');

-- Assignment Due Soon Trigger
INSERT INTO notification_triggers (event_type, notification_template, category, trigger_condition) VALUES
('assignment_due_soon', '{
  "title_template": "Tarea próxima a vencer",
  "description_template": "Tu tarea ''{assignment_name}'' vence mañana a las {due_time}",
  "url_template": "/cursos/{course_id}/tareas/{assignment_id}",
  "importance": "high"
}', 'tareas', '{"enabled": true, "hours_before": 24}');

-- Course Completion Trigger
INSERT INTO notification_triggers (event_type, notification_template, category, trigger_condition) VALUES
('course_completed', '{
  "title_template": "Curso completado",
  "description_template": "¡Felicitaciones! Has completado {course_name}",
  "url_template": "/cursos/{course_id}/certificado",
  "importance": "high"
}', 'cursos', '{"enabled": true, "immediate": true}');

-- Module Completion Trigger
INSERT INTO notification_triggers (event_type, notification_template, category, trigger_condition) VALUES
('module_completed', '{
  "title_template": "Módulo completado",
  "description_template": "¡Felicitaciones! Has completado el módulo {module_name}",
  "url_template": "/cursos/{course_id}/modulos/{module_id}",
  "importance": "normal"
}', 'cursos', '{"enabled": true, "immediate": true}');

-- Consultant Assignment Trigger
INSERT INTO notification_triggers (event_type, notification_template, category, trigger_condition) VALUES
('consultant_assigned', '{
  "title_template": "Consultor asignado",
  "description_template": "{consultant_name} ha sido asignado como tu consultor académico",
  "url_template": "/consultores/{consultant_id}",
  "importance": "normal"
}', 'administracion', '{"enabled": true, "immediate": true}');

-- System Update Trigger
INSERT INTO notification_triggers (event_type, notification_template, category, trigger_condition) VALUES
('system_update', '{
  "title_template": "Sistema actualizado",
  "description_template": "La plataforma se ha actualizado con nuevas funcionalidades",
  "url_template": "/novedades/{update_id}",
  "importance": "low"
}', 'sistema', '{"enabled": true, "immediate": false}');

-- 5. CREATE HELPER FUNCTIONS
-- ====================================================================

-- Function to get active triggers for an event type
CREATE OR REPLACE FUNCTION get_active_triggers(p_event_type TEXT)
RETURNS TABLE(
    trigger_id UUID,
    template JSONB,
    category VARCHAR(50),
    conditions JSONB
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        nt.id,
        nt.notification_template,
        nt.category,
        nt.trigger_condition
    FROM notification_triggers nt
    WHERE nt.event_type = p_event_type 
    AND nt.is_active = true;
END;
$$;

-- Function to log notification events
CREATE OR REPLACE FUNCTION log_notification_event(
    p_event_type TEXT,
    p_event_data JSONB,
    p_trigger_id UUID DEFAULT NULL,
    p_notifications_count INTEGER DEFAULT 0,
    p_status TEXT DEFAULT 'success'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO notification_events (
        event_type,
        event_data,
        trigger_id,
        notifications_created,
        status
    ) VALUES (
        p_event_type,
        p_event_data,
        p_trigger_id,
        p_notifications_count,
        p_status
    ) RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$;

-- 6. CREATE RLS POLICIES
-- ====================================================================

-- Enable RLS on new tables
ALTER TABLE notification_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;

-- Admin can manage all triggers
CREATE POLICY "Admin can manage notification triggers" ON notification_triggers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Users can view active triggers (for debugging)
CREATE POLICY "Users can view active triggers" ON notification_triggers
    FOR SELECT USING (is_active = true);

-- Admin can view all events
CREATE POLICY "Admin can view notification events" ON notification_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 7. VERIFICATION QUERIES
-- ====================================================================

-- Verify triggers are installed
SELECT 
    event_type,
    category,
    is_active,
    trigger_condition->>'enabled' as enabled
FROM notification_triggers 
ORDER BY category, event_type;

-- Test trigger lookup function
SELECT * FROM get_active_triggers('assignment_created');

COMMENT ON TABLE notification_triggers IS 'Stores templates and conditions for automated notification generation';
COMMENT ON TABLE notification_events IS 'Audit log of all notification trigger events';
COMMENT ON FUNCTION get_active_triggers IS 'Helper function to retrieve active triggers for an event type';
COMMENT ON FUNCTION log_notification_event IS 'Helper function to log notification trigger events';