-- Meeting Documentation System Database Schema
-- Complete system for community meeting documentation and task management

-- 1. Create meeting status enum
CREATE TYPE meeting_status AS ENUM (
  'programada',     -- Scheduled/upcoming
  'en_progreso',    -- Currently happening
  'completada',     -- Finished
  'cancelada',      -- Cancelled
  'pospuesta'       -- Postponed
);

-- 2. Create task/commitment status enum
CREATE TYPE task_status AS ENUM (
  'pendiente',      -- Pending
  'en_progreso',    -- In progress
  'completado',     -- Completed
  'vencido',        -- Overdue
  'cancelado'       -- Cancelled
);

-- 3. Create task priority enum
CREATE TYPE task_priority AS ENUM (
  'baja',           -- Low
  'media',          -- Medium
  'alta',           -- High
  'critica'         -- Critical
);

-- 4. Create community_meetings table
CREATE TABLE IF NOT EXISTS community_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES community_workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  meeting_date TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  location TEXT, -- Can be physical location or virtual meeting link
  status meeting_status DEFAULT 'programada',
  summary TEXT, -- Post-meeting summary
  notes TEXT,   -- Additional meeting notes
  
  -- Meeting management
  created_by UUID NOT NULL REFERENCES profiles(id),
  facilitator_id UUID REFERENCES profiles(id), -- Person who facilitated the meeting
  secretary_id UUID REFERENCES profiles(id),   -- Person who took notes
  
  -- Metadata
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT meeting_date_not_past CHECK (meeting_date > '2020-01-01'::timestamp),
  CONSTRAINT valid_duration CHECK (duration_minutes > 0 AND duration_minutes <= 480)
);

-- 5. Create meeting_agreements table
CREATE TABLE IF NOT EXISTS meeting_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES community_meetings(id) ON DELETE CASCADE,
  agreement_text TEXT NOT NULL,
  order_index INTEGER DEFAULT 0,
  category TEXT, -- Optional categorization (e.g., 'pedagogical', 'administrative', 'procedural')
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure reasonable agreement length
  CONSTRAINT agreement_not_empty CHECK (length(trim(agreement_text)) > 0)
);

-- 6. Create meeting_commitments table
CREATE TABLE IF NOT EXISTS meeting_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES community_meetings(id) ON DELETE CASCADE,
  commitment_text TEXT NOT NULL,
  assigned_to UUID NOT NULL REFERENCES profiles(id),
  due_date DATE,
  status task_status DEFAULT 'pendiente',
  notes TEXT,
  
  -- Progress tracking
  completed_at TIMESTAMP WITH TIME ZONE,
  progress_percentage INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT commitment_not_empty CHECK (length(trim(commitment_text)) > 0),
  CONSTRAINT valid_progress CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  CONSTRAINT completed_when_done CHECK (
    (status = 'completado' AND completed_at IS NOT NULL AND progress_percentage = 100) OR
    (status != 'completado' AND (completed_at IS NULL OR progress_percentage < 100))
  )
);

-- 7. Create meeting_tasks table
CREATE TABLE IF NOT EXISTS meeting_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES community_meetings(id) ON DELETE CASCADE,
  task_title TEXT NOT NULL,
  task_description TEXT,
  assigned_to UUID NOT NULL REFERENCES profiles(id),
  due_date DATE,
  priority task_priority DEFAULT 'media',
  status task_status DEFAULT 'pendiente',
  estimated_hours DECIMAL(5,2),
  actual_hours DECIMAL(5,2),
  
  -- Task organization
  category TEXT, -- e.g., 'preparation', 'follow-up', 'research', 'implementation'
  parent_task_id UUID REFERENCES meeting_tasks(id), -- For subtasks
  
  -- Progress tracking
  completed_at TIMESTAMP WITH TIME ZONE,
  progress_percentage INTEGER DEFAULT 0,
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT task_title_not_empty CHECK (length(trim(task_title)) > 0),
  CONSTRAINT valid_hours CHECK (
    (estimated_hours IS NULL OR estimated_hours >= 0) AND
    (actual_hours IS NULL OR actual_hours >= 0)
  ),
  CONSTRAINT valid_task_progress CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  CONSTRAINT task_completed_when_done CHECK (
    (status = 'completado' AND completed_at IS NOT NULL AND progress_percentage = 100) OR
    (status != 'completado' AND (completed_at IS NULL OR progress_percentage < 100))
  ),
  CONSTRAINT no_self_parent CHECK (parent_task_id != id)
);

-- 8. Create meeting_attendees table
CREATE TABLE IF NOT EXISTS meeting_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES community_meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  attendance_status TEXT DEFAULT 'invited', -- 'invited', 'confirmed', 'attended', 'absent', 'late'
  role TEXT, -- 'facilitator', 'secretary', 'participant', 'observer'
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique attendance per meeting
  UNIQUE(meeting_id, user_id)
);

-- 9. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_meetings_workspace_id ON community_meetings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_community_meetings_date ON community_meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_community_meetings_status ON community_meetings(status);
CREATE INDEX IF NOT EXISTS idx_community_meetings_created_by ON community_meetings(created_by);

CREATE INDEX IF NOT EXISTS idx_meeting_agreements_meeting_id ON meeting_agreements(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_agreements_order ON meeting_agreements(meeting_id, order_index);

CREATE INDEX IF NOT EXISTS idx_meeting_commitments_meeting_id ON meeting_commitments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_commitments_assigned_to ON meeting_commitments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_meeting_commitments_status ON meeting_commitments(status);
CREATE INDEX IF NOT EXISTS idx_meeting_commitments_due_date ON meeting_commitments(due_date);

CREATE INDEX IF NOT EXISTS idx_meeting_tasks_meeting_id ON meeting_tasks(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_tasks_assigned_to ON meeting_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_meeting_tasks_status ON meeting_tasks(status);
CREATE INDEX IF NOT EXISTS idx_meeting_tasks_due_date ON meeting_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_meeting_tasks_priority ON meeting_tasks(priority);

CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting_id ON meeting_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_user_id ON meeting_attendees(user_id);

-- 10. Row Level Security Policies

-- Enable RLS on all meeting tables
ALTER TABLE community_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;

-- Policy for community_meetings: Community members + consultants + admins can view
CREATE POLICY "Community members can view meetings" ON community_meetings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community_workspaces cw
      JOIN user_roles ur ON ur.community_id = cw.community_id
      WHERE cw.id = community_meetings.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.is_active = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM community_workspaces cw
      JOIN growth_communities gc ON gc.id = cw.community_id
      JOIN user_roles ur ON ur.school_id = gc.school_id
      WHERE cw.id = community_meetings.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.role_type = 'consultor'
      AND ur.is_active = TRUE
    )
  );

-- Policy for creating meetings: Community leaders and admins only
CREATE POLICY "Community leaders and admins can create meetings" ON community_meetings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM community_workspaces cw
      JOIN user_roles ur ON ur.community_id = cw.community_id
      WHERE cw.id = community_meetings.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.role_type IN ('lider_comunidad', 'admin')
      AND ur.is_active = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
  );

-- Policy for updating meetings: Creators, community leaders, and admins
CREATE POLICY "Meeting creators and leaders can update meetings" ON community_meetings
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM community_workspaces cw
      JOIN user_roles ur ON ur.community_id = cw.community_id
      WHERE cw.id = community_meetings.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.role_type IN ('lider_comunidad', 'admin')
      AND ur.is_active = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
  );

-- Policies for meeting_agreements: Follow meeting access
CREATE POLICY "Meeting access controls agreements" ON meeting_agreements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM community_meetings cm
      WHERE cm.id = meeting_agreements.meeting_id
      AND (
        EXISTS (
          SELECT 1 FROM community_workspaces cw
          JOIN user_roles ur ON ur.community_id = cw.community_id
          WHERE cw.id = cm.workspace_id
          AND ur.user_id = auth.uid()
          AND ur.is_active = TRUE
        )
        OR
        EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = auth.uid()
          AND ur.role_type = 'admin'
          AND ur.is_active = TRUE
        )
      )
    )
  );

-- Policies for meeting_commitments: View access + assigned users can update their own
CREATE POLICY "Meeting access controls commitments view" ON meeting_commitments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community_meetings cm
      WHERE cm.id = meeting_commitments.meeting_id
      AND (
        EXISTS (
          SELECT 1 FROM community_workspaces cw
          JOIN user_roles ur ON ur.community_id = cw.community_id
          WHERE cw.id = cm.workspace_id
          AND ur.user_id = auth.uid()
          AND ur.is_active = TRUE
        )
        OR
        EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = auth.uid()
          AND ur.role_type = 'admin'
          AND ur.is_active = TRUE
        )
      )
    )
  );

CREATE POLICY "Leaders can manage commitments" ON meeting_commitments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM community_meetings cm
      JOIN community_workspaces cw ON cw.id = cm.workspace_id
      JOIN user_roles ur ON ur.community_id = cw.community_id
      WHERE cm.id = meeting_commitments.meeting_id
      AND ur.user_id = auth.uid()
      AND ur.role_type IN ('lider_comunidad', 'admin')
      AND ur.is_active = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
  );

CREATE POLICY "Assigned users can update their commitments" ON meeting_commitments
  FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM community_meetings cm
      JOIN community_workspaces cw ON cw.id = cm.workspace_id
      JOIN user_roles ur ON ur.community_id = cw.community_id
      WHERE cm.id = meeting_commitments.meeting_id
      AND ur.user_id = auth.uid()
      AND ur.role_type IN ('lider_comunidad', 'admin')
      AND ur.is_active = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
  );

-- Similar policies for meeting_tasks
CREATE POLICY "Meeting access controls tasks view" ON meeting_tasks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community_meetings cm
      WHERE cm.id = meeting_tasks.meeting_id
      AND (
        EXISTS (
          SELECT 1 FROM community_workspaces cw
          JOIN user_roles ur ON ur.community_id = cw.community_id
          WHERE cw.id = cm.workspace_id
          AND ur.user_id = auth.uid()
          AND ur.is_active = TRUE
        )
        OR
        EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = auth.uid()
          AND ur.role_type = 'admin'
          AND ur.is_active = TRUE
        )
      )
    )
  );

CREATE POLICY "Leaders can manage tasks" ON meeting_tasks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM community_meetings cm
      JOIN community_workspaces cw ON cw.id = cm.workspace_id
      JOIN user_roles ur ON ur.community_id = cw.community_id
      WHERE cm.id = meeting_tasks.meeting_id
      AND ur.user_id = auth.uid()
      AND ur.role_type IN ('lider_comunidad', 'admin')
      AND ur.is_active = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
  );

CREATE POLICY "Assigned users can update their tasks" ON meeting_tasks
  FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM community_meetings cm
      JOIN community_workspaces cw ON cw.id = cm.workspace_id
      JOIN user_roles ur ON ur.community_id = cw.community_id
      WHERE cm.id = meeting_tasks.meeting_id
      AND ur.user_id = auth.uid()
      AND ur.role_type IN ('lider_comunidad', 'admin')
      AND ur.is_active = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
  );

-- Policies for meeting_attendees
CREATE POLICY "Meeting access controls attendees" ON meeting_attendees
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM community_meetings cm
      WHERE cm.id = meeting_attendees.meeting_id
      AND (
        EXISTS (
          SELECT 1 FROM community_workspaces cw
          JOIN user_roles ur ON ur.community_id = cw.community_id
          WHERE cw.id = cm.workspace_id
          AND ur.user_id = auth.uid()
          AND ur.is_active = TRUE
        )
        OR
        EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = auth.uid()
          AND ur.role_type = 'admin'
          AND ur.is_active = TRUE
        )
      )
    )
  );

-- 11. Helper functions

-- Function to get overdue tasks/commitments
CREATE OR REPLACE FUNCTION get_overdue_items(
  p_workspace_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS TABLE (
  item_type TEXT,
  item_id UUID,
  title TEXT,
  due_date DATE,
  days_overdue INTEGER,
  assigned_to UUID,
  meeting_title TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'commitment'::TEXT as item_type,
    mc.id as item_id,
    mc.commitment_text as title,
    mc.due_date,
    (CURRENT_DATE - mc.due_date)::INTEGER as days_overdue,
    mc.assigned_to,
    cm.title as meeting_title
  FROM meeting_commitments mc
  JOIN community_meetings cm ON cm.id = mc.meeting_id
  JOIN community_workspaces cw ON cw.id = cm.workspace_id
  WHERE mc.status IN ('pendiente', 'en_progreso')
    AND mc.due_date < CURRENT_DATE
    AND (p_workspace_id IS NULL OR cw.id = p_workspace_id)
    AND (p_user_id IS NULL OR mc.assigned_to = p_user_id)
  
  UNION ALL
  
  SELECT 
    'task'::TEXT as item_type,
    mt.id as item_id,
    mt.task_title as title,
    mt.due_date,
    (CURRENT_DATE - mt.due_date)::INTEGER as days_overdue,
    mt.assigned_to,
    cm.title as meeting_title
  FROM meeting_tasks mt
  JOIN community_meetings cm ON cm.id = mt.meeting_id
  JOIN community_workspaces cw ON cw.id = cm.workspace_id
  WHERE mt.status IN ('pendiente', 'en_progreso')
    AND mt.due_date < CURRENT_DATE
    AND (p_workspace_id IS NULL OR cw.id = p_workspace_id)
    AND (p_user_id IS NULL OR mt.assigned_to = p_user_id)
  
  ORDER BY days_overdue DESC, due_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get meeting statistics
CREATE OR REPLACE FUNCTION get_meeting_stats(
  p_workspace_id UUID
) RETURNS TABLE (
  total_meetings BIGINT,
  upcoming_meetings BIGINT,
  completed_meetings BIGINT,
  total_tasks BIGINT,
  completed_tasks BIGINT,
  overdue_tasks BIGINT,
  total_commitments BIGINT,
  completed_commitments BIGINT,
  overdue_commitments BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM community_meetings cm WHERE cm.workspace_id = p_workspace_id AND cm.is_active = TRUE),
    (SELECT COUNT(*) FROM community_meetings cm WHERE cm.workspace_id = p_workspace_id AND cm.status = 'programada' AND cm.meeting_date > NOW()),
    (SELECT COUNT(*) FROM community_meetings cm WHERE cm.workspace_id = p_workspace_id AND cm.status = 'completada'),
    
    (SELECT COUNT(*) FROM meeting_tasks mt 
     JOIN community_meetings cm ON cm.id = mt.meeting_id 
     WHERE cm.workspace_id = p_workspace_id),
    (SELECT COUNT(*) FROM meeting_tasks mt 
     JOIN community_meetings cm ON cm.id = mt.meeting_id 
     WHERE cm.workspace_id = p_workspace_id AND mt.status = 'completado'),
    (SELECT COUNT(*) FROM meeting_tasks mt 
     JOIN community_meetings cm ON cm.id = mt.meeting_id 
     WHERE cm.workspace_id = p_workspace_id AND mt.status IN ('pendiente', 'en_progreso') AND mt.due_date < CURRENT_DATE),
    
    (SELECT COUNT(*) FROM meeting_commitments mc 
     JOIN community_meetings cm ON cm.id = mc.meeting_id 
     WHERE cm.workspace_id = p_workspace_id),
    (SELECT COUNT(*) FROM meeting_commitments mc 
     JOIN community_meetings cm ON cm.id = mc.meeting_id 
     WHERE cm.workspace_id = p_workspace_id AND mc.status = 'completado'),
    (SELECT COUNT(*) FROM meeting_commitments mc 
     JOIN community_meetings cm ON cm.id = mc.meeting_id 
     WHERE cm.workspace_id = p_workspace_id AND mc.status IN ('pendiente', 'en_progreso') AND mc.due_date < CURRENT_DATE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Trigger functions for automatic status updates

-- Function to automatically update task status to 'vencido' when overdue
CREATE OR REPLACE FUNCTION update_overdue_status()
RETURNS void AS $$
BEGIN
  -- Update overdue commitments
  UPDATE meeting_commitments 
  SET status = 'vencido', updated_at = NOW()
  WHERE status IN ('pendiente', 'en_progreso')
    AND due_date < CURRENT_DATE
    AND status != 'vencido';
  
  -- Update overdue tasks
  UPDATE meeting_tasks 
  SET status = 'vencido', updated_at = NOW()
  WHERE status IN ('pendiente', 'en_progreso')
    AND due_date < CURRENT_DATE
    AND status != 'vencido';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON TABLE community_meetings IS 'Community meeting documentation and management';
COMMENT ON TABLE meeting_agreements IS 'Agreements reached during community meetings';
COMMENT ON TABLE meeting_commitments IS 'Individual commitments made during meetings';
COMMENT ON TABLE meeting_tasks IS 'Specific tasks assigned during meetings';
COMMENT ON TABLE meeting_attendees IS 'Meeting attendance tracking';

COMMENT ON FUNCTION get_overdue_items(UUID, UUID) IS 'Returns overdue tasks and commitments for a workspace or user';
COMMENT ON FUNCTION get_meeting_stats(UUID) IS 'Returns statistical summary of meetings for a workspace';
COMMENT ON FUNCTION update_overdue_status() IS 'Updates status of overdue tasks and commitments';