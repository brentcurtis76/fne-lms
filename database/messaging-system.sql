-- =============================================================================
-- MESSAGING SYSTEM DATABASE SCHEMA
-- Phase 4 of Collaborative Workspace System for FNE LMS
-- Following established patterns from document-system.sql
-- =============================================================================

-- Create custom enums for messaging system
CREATE TYPE message_type AS ENUM ('regular', 'system', 'announcement');
CREATE TYPE thread_category AS ENUM ('general', 'resources', 'announcements', 'questions', 'projects');
CREATE TYPE mention_type AS ENUM ('user', 'all', 'role');
CREATE TYPE reaction_type AS ENUM ('thumbs_up', 'heart', 'lightbulb', 'celebration', 'eyes', 'question');
CREATE TYPE message_activity_type AS ENUM ('message_sent', 'message_edited', 'message_deleted', 'thread_created', 'reaction_added', 'mention_created', 'attachment_uploaded');

-- =============================================================================
-- CORE MESSAGING TABLES
-- =============================================================================

-- Message threads table - organize conversations by topic
CREATE TABLE message_threads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID REFERENCES community_workspaces(id) ON DELETE CASCADE,
    thread_title TEXT NOT NULL,
    description TEXT,
    category thread_category DEFAULT 'general',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    message_count INTEGER DEFAULT 0,
    participant_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Community messages table - main messaging content
CREATE TABLE community_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID REFERENCES community_workspaces(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES message_threads(id) ON DELETE CASCADE,
    reply_to_id UUID REFERENCES community_messages(id) ON DELETE SET NULL,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    content_html TEXT, -- Rich text HTML version
    message_type message_type DEFAULT 'regular',
    is_edited BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message mentions table - track @mentions for notifications
CREATE TABLE message_mentions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES community_messages(id) ON DELETE CASCADE,
    mentioned_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    mention_type mention_type DEFAULT 'user',
    mention_text TEXT NOT NULL, -- The actual @text used
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message reactions table - emoji reactions for quick feedback
CREATE TABLE message_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES community_messages(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    reaction_type reaction_type NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, user_id, reaction_type)
);

-- Message attachments table - file attachments with storage integration
CREATE TABLE message_attachments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES community_messages(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message activity log table - analytics and audit trail
CREATE TABLE message_activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    workspace_id UUID REFERENCES community_workspaces(id) ON DELETE CASCADE,
    message_id UUID REFERENCES community_messages(id) ON DELETE SET NULL,
    thread_id UUID REFERENCES message_threads(id) ON DELETE SET NULL,
    action_type message_activity_type NOT NULL,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =============================================================================

-- Message threads indexes
CREATE INDEX idx_message_threads_workspace_id ON message_threads(workspace_id);
CREATE INDEX idx_message_threads_created_by ON message_threads(created_by);
CREATE INDEX idx_message_threads_last_message_at ON message_threads(last_message_at DESC);
CREATE INDEX idx_message_threads_pinned ON message_threads(is_pinned, workspace_id) WHERE is_pinned = TRUE;
CREATE INDEX idx_message_threads_category ON message_threads(category, workspace_id);

-- Community messages indexes
CREATE INDEX idx_community_messages_workspace_id ON community_messages(workspace_id);
CREATE INDEX idx_community_messages_thread_id ON community_messages(thread_id);
CREATE INDEX idx_community_messages_author_id ON community_messages(author_id);
CREATE INDEX idx_community_messages_created_at ON community_messages(created_at DESC);
CREATE INDEX idx_community_messages_reply_to ON community_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX idx_community_messages_search ON community_messages USING gin(to_tsvector('spanish', content));

-- Message mentions indexes
CREATE INDEX idx_message_mentions_user_id ON message_mentions(mentioned_user_id);
CREATE INDEX idx_message_mentions_message_id ON message_mentions(message_id);
CREATE INDEX idx_message_mentions_unread ON message_mentions(mentioned_user_id, is_read) WHERE is_read = FALSE;

-- Message reactions indexes
CREATE INDEX idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_user_id ON message_reactions(user_id);

-- Message attachments indexes
CREATE INDEX idx_message_attachments_message_id ON message_attachments(message_id);
CREATE INDEX idx_message_attachments_uploaded_by ON message_attachments(uploaded_by);
CREATE INDEX idx_message_attachments_mime_type ON message_attachments(mime_type);

-- Activity log indexes
CREATE INDEX idx_message_activity_log_user_id ON message_activity_log(user_id);
CREATE INDEX idx_message_activity_log_workspace_id ON message_activity_log(workspace_id);
CREATE INDEX idx_message_activity_log_created_at ON message_activity_log(created_at DESC);
CREATE INDEX idx_message_activity_log_action_type ON message_activity_log(action_type, workspace_id);

-- =============================================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =============================================================================

-- Update timestamps trigger function
CREATE OR REPLACE FUNCTION update_messaging_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp triggers
CREATE TRIGGER trigger_message_threads_updated_at
    BEFORE UPDATE ON message_threads
    FOR EACH ROW EXECUTE FUNCTION update_messaging_timestamps();

CREATE TRIGGER trigger_community_messages_updated_at
    BEFORE UPDATE ON community_messages
    FOR EACH ROW EXECUTE FUNCTION update_messaging_timestamps();

-- Thread statistics update trigger
CREATE OR REPLACE FUNCTION update_thread_statistics()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Update message count and last message time
        UPDATE message_threads 
        SET 
            message_count = message_count + 1,
            last_message_at = NEW.created_at,
            participant_count = (
                SELECT COUNT(DISTINCT author_id) 
                FROM community_messages 
                WHERE thread_id = NEW.thread_id AND is_deleted = FALSE
            )
        WHERE id = NEW.thread_id;
        
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Update last message time if not deleted
        IF NOT NEW.is_deleted AND OLD.is_deleted THEN
            UPDATE message_threads 
            SET message_count = message_count + 1
            WHERE id = NEW.thread_id;
        ELSIF NEW.is_deleted AND NOT OLD.is_deleted THEN
            UPDATE message_threads 
            SET message_count = GREATEST(message_count - 1, 0)
            WHERE id = NEW.thread_id;
        END IF;
        
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Decrease message count
        UPDATE message_threads 
        SET message_count = GREATEST(message_count - 1, 0)
        WHERE id = OLD.thread_id;
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_thread_statistics
    AFTER INSERT OR UPDATE OR DELETE ON community_messages
    FOR EACH ROW EXECUTE FUNCTION update_thread_statistics();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_activity_log ENABLE ROW LEVEL SECURITY;

-- Message threads policies
CREATE POLICY "message_threads_select_policy" ON message_threads
    FOR SELECT
    USING (
        workspace_id IN (
            SELECT cw.id 
            FROM community_workspaces cw
            WHERE 
                -- Admin access to all
                auth.jwt() ->> 'role' = 'admin'
                OR
                -- Community members and consultants
                (
                    cw.id = workspace_id
                    AND (
                        -- Community members
                        cw.community_id IN (
                            SELECT ur.community_id 
                            FROM user_roles ur 
                            WHERE ur.user_id = auth.uid() AND ur.is_active = TRUE
                        )
                        OR
                        -- Consultants with assignments in this community
                        cw.community_id IN (
                            SELECT ca.community_id
                            FROM consultant_assignments ca
                            WHERE ca.consultant_id = auth.uid() AND ca.is_active = TRUE
                        )
                    )
                )
        )
    );

CREATE POLICY "message_threads_insert_policy" ON message_threads
    FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT cw.id 
            FROM community_workspaces cw
            WHERE 
                auth.jwt() ->> 'role' = 'admin'
                OR
                (
                    cw.id = workspace_id
                    AND (
                        cw.community_id IN (
                            SELECT ur.community_id 
                            FROM user_roles ur 
                            WHERE ur.user_id = auth.uid() AND ur.is_active = TRUE
                        )
                        OR
                        cw.community_id IN (
                            SELECT ca.community_id
                            FROM consultant_assignments ca
                            WHERE ca.consultant_id = auth.uid() AND ca.is_active = TRUE
                        )
                    )
                )
        )
        AND created_by = auth.uid()
    );

CREATE POLICY "message_threads_update_policy" ON message_threads
    FOR UPDATE
    USING (
        workspace_id IN (
            SELECT cw.id 
            FROM community_workspaces cw
            WHERE 
                auth.jwt() ->> 'role' = 'admin'
                OR
                (
                    cw.id = workspace_id
                    AND cw.community_id IN (
                        SELECT ur.community_id 
                        FROM user_roles ur 
                        WHERE ur.user_id = auth.uid() 
                        AND ur.is_active = TRUE
                        AND ur.role IN ('lider_comunidad', 'admin')
                    )
                )
        )
    );

-- Community messages policies
CREATE POLICY "community_messages_select_policy" ON community_messages
    FOR SELECT
    USING (
        workspace_id IN (
            SELECT cw.id 
            FROM community_workspaces cw
            WHERE 
                auth.jwt() ->> 'role' = 'admin'
                OR
                (
                    cw.id = workspace_id
                    AND (
                        cw.community_id IN (
                            SELECT ur.community_id 
                            FROM user_roles ur 
                            WHERE ur.user_id = auth.uid() AND ur.is_active = TRUE
                        )
                        OR
                        cw.community_id IN (
                            SELECT ca.community_id
                            FROM consultant_assignments ca
                            WHERE ca.consultant_id = auth.uid() AND ca.is_active = TRUE
                        )
                    )
                )
        )
        AND is_deleted = FALSE
    );

CREATE POLICY "community_messages_insert_policy" ON community_messages
    FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT cw.id 
            FROM community_workspaces cw
            WHERE 
                auth.jwt() ->> 'role' = 'admin'
                OR
                (
                    cw.id = workspace_id
                    AND (
                        cw.community_id IN (
                            SELECT ur.community_id 
                            FROM user_roles ur 
                            WHERE ur.user_id = auth.uid() AND ur.is_active = TRUE
                        )
                        OR
                        cw.community_id IN (
                            SELECT ca.community_id
                            FROM consultant_assignments ca
                            WHERE ca.consultant_id = auth.uid() AND ca.is_active = TRUE
                        )
                    )
                )
        )
        AND author_id = auth.uid()
    );

CREATE POLICY "community_messages_update_policy" ON community_messages
    FOR UPDATE
    USING (
        (author_id = auth.uid() OR auth.jwt() ->> 'role' = 'admin')
        AND
        workspace_id IN (
            SELECT cw.id 
            FROM community_workspaces cw
            WHERE 
                auth.jwt() ->> 'role' = 'admin'
                OR
                (
                    cw.id = workspace_id
                    AND (
                        cw.community_id IN (
                            SELECT ur.community_id 
                            FROM user_roles ur 
                            WHERE ur.user_id = auth.uid() AND ur.is_active = TRUE
                        )
                        OR
                        cw.community_id IN (
                            SELECT ca.community_id
                            FROM consultant_assignments ca
                            WHERE ca.consultant_id = auth.uid() AND ca.is_active = TRUE
                        )
                    )
                )
        )
    );

-- Message mentions policies (users can see their own mentions)
CREATE POLICY "message_mentions_select_policy" ON message_mentions
    FOR SELECT
    USING (
        mentioned_user_id = auth.uid()
        OR
        auth.jwt() ->> 'role' = 'admin'
        OR
        message_id IN (
            SELECT cm.id 
            FROM community_messages cm
            WHERE cm.author_id = auth.uid()
        )
    );

CREATE POLICY "message_mentions_insert_policy" ON message_mentions
    FOR INSERT
    WITH CHECK (
        message_id IN (
            SELECT cm.id 
            FROM community_messages cm
            WHERE cm.author_id = auth.uid()
        )
    );

-- Message reactions policies
CREATE POLICY "message_reactions_select_policy" ON message_reactions
    FOR SELECT
    USING (
        message_id IN (
            SELECT cm.id 
            FROM community_messages cm
            JOIN message_threads mt ON cm.thread_id = mt.id
            WHERE 
                auth.jwt() ->> 'role' = 'admin'
                OR
                mt.workspace_id IN (
                    SELECT cw.id 
                    FROM community_workspaces cw
                    WHERE 
                        cw.community_id IN (
                            SELECT ur.community_id 
                            FROM user_roles ur 
                            WHERE ur.user_id = auth.uid() AND ur.is_active = TRUE
                        )
                        OR
                        cw.community_id IN (
                            SELECT ca.community_id
                            FROM consultant_assignments ca
                            WHERE ca.consultant_id = auth.uid() AND ca.is_active = TRUE
                        )
                )
        )
    );

CREATE POLICY "message_reactions_insert_policy" ON message_reactions
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND
        message_id IN (
            SELECT cm.id 
            FROM community_messages cm
            JOIN message_threads mt ON cm.thread_id = mt.id
            WHERE 
                auth.jwt() ->> 'role' = 'admin'
                OR
                mt.workspace_id IN (
                    SELECT cw.id 
                    FROM community_workspaces cw
                    WHERE 
                        cw.community_id IN (
                            SELECT ur.community_id 
                            FROM user_roles ur 
                            WHERE ur.user_id = auth.uid() AND ur.is_active = TRUE
                        )
                        OR
                        cw.community_id IN (
                            SELECT ca.community_id
                            FROM consultant_assignments ca
                            WHERE ca.consultant_id = auth.uid() AND ca.is_active = TRUE
                        )
                )
        )
    );

CREATE POLICY "message_reactions_delete_policy" ON message_reactions
    FOR DELETE
    USING (user_id = auth.uid() OR auth.jwt() ->> 'role' = 'admin');

-- Message attachments policies
CREATE POLICY "message_attachments_select_policy" ON message_attachments
    FOR SELECT
    USING (
        message_id IN (
            SELECT cm.id 
            FROM community_messages cm
            JOIN message_threads mt ON cm.thread_id = mt.id
            WHERE 
                auth.jwt() ->> 'role' = 'admin'
                OR
                mt.workspace_id IN (
                    SELECT cw.id 
                    FROM community_workspaces cw
                    WHERE 
                        cw.community_id IN (
                            SELECT ur.community_id 
                            FROM user_roles ur 
                            WHERE ur.user_id = auth.uid() AND ur.is_active = TRUE
                        )
                        OR
                        cw.community_id IN (
                            SELECT ca.community_id
                            FROM consultant_assignments ca
                            WHERE ca.consultant_id = auth.uid() AND ca.is_active = TRUE
                        )
                )
        )
        AND is_active = TRUE
    );

CREATE POLICY "message_attachments_insert_policy" ON message_attachments
    FOR INSERT
    WITH CHECK (
        uploaded_by = auth.uid()
        AND
        message_id IN (
            SELECT cm.id 
            FROM community_messages cm
            WHERE cm.author_id = auth.uid()
        )
    );

-- Activity log policies (read-only for users, full access for admins)
CREATE POLICY "message_activity_log_select_policy" ON message_activity_log
    FOR SELECT
    USING (
        auth.jwt() ->> 'role' = 'admin'
        OR
        user_id = auth.uid()
        OR
        workspace_id IN (
            SELECT cw.id 
            FROM community_workspaces cw
            WHERE 
                cw.community_id IN (
                    SELECT ur.community_id 
                    FROM user_roles ur 
                    WHERE ur.user_id = auth.uid() 
                    AND ur.is_active = TRUE
                    AND ur.role = 'lider_comunidad'
                )
        )
    );

CREATE POLICY "message_activity_log_insert_policy" ON message_activity_log
    FOR INSERT
    WITH CHECK (TRUE); -- Allow system to insert activity logs

-- =============================================================================
-- HELPER FUNCTIONS FOR MESSAGING OPERATIONS
-- =============================================================================

-- Get messaging statistics for a workspace
CREATE OR REPLACE FUNCTION get_messaging_statistics(workspace_uuid UUID)
RETURNS JSON AS $$
DECLARE
    stats JSON;
BEGIN
    SELECT json_build_object(
        'total_threads', (
            SELECT COUNT(*) 
            FROM message_threads 
            WHERE workspace_id = workspace_uuid AND is_archived = FALSE
        ),
        'total_messages', (
            SELECT COUNT(*) 
            FROM community_messages cm
            JOIN message_threads mt ON cm.thread_id = mt.id
            WHERE mt.workspace_id = workspace_uuid AND cm.is_deleted = FALSE
        ),
        'active_participants', (
            SELECT COUNT(DISTINCT cm.author_id)
            FROM community_messages cm
            JOIN message_threads mt ON cm.thread_id = mt.id
            WHERE mt.workspace_id = workspace_uuid 
            AND cm.is_deleted = FALSE
            AND cm.created_at >= NOW() - INTERVAL '30 days'
        ),
        'recent_activity', (
            SELECT COUNT(*)
            FROM community_messages cm
            JOIN message_threads mt ON cm.thread_id = mt.id
            WHERE mt.workspace_id = workspace_uuid 
            AND cm.is_deleted = FALSE
            AND cm.created_at >= NOW() - INTERVAL '7 days'
        ),
        'pinned_threads', (
            SELECT COUNT(*) 
            FROM message_threads 
            WHERE workspace_id = workspace_uuid AND is_pinned = TRUE
        ),
        'total_attachments', (
            SELECT COUNT(*)
            FROM message_attachments ma
            JOIN community_messages cm ON ma.message_id = cm.id
            JOIN message_threads mt ON cm.thread_id = mt.id
            WHERE mt.workspace_id = workspace_uuid AND ma.is_active = TRUE
        ),
        'thread_categories', (
            SELECT json_object_agg(category, count)
            FROM (
                SELECT category, COUNT(*) as count
                FROM message_threads
                WHERE workspace_id = workspace_uuid AND is_archived = FALSE
                GROUP BY category
            ) cat_counts
        )
    ) INTO stats;
    
    RETURN stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Search messages with full-text search
CREATE OR REPLACE FUNCTION search_messages(
    workspace_uuid UUID,
    search_query TEXT,
    thread_uuid UUID DEFAULT NULL,
    limit_count INTEGER DEFAULT 50,
    offset_count INTEGER DEFAULT 0
)
RETURNS TABLE (
    message_id UUID,
    thread_id UUID,
    thread_title TEXT,
    content TEXT,
    author_id UUID,
    created_at TIMESTAMP WITH TIME ZONE,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cm.id as message_id,
        cm.thread_id,
        mt.thread_title,
        cm.content,
        cm.author_id,
        cm.created_at,
        ts_rank(to_tsvector('spanish', cm.content), plainto_tsquery('spanish', search_query)) as rank
    FROM community_messages cm
    JOIN message_threads mt ON cm.thread_id = mt.id
    WHERE 
        mt.workspace_id = workspace_uuid
        AND cm.is_deleted = FALSE
        AND to_tsvector('spanish', cm.content) @@ plainto_tsquery('spanish', search_query)
        AND (thread_uuid IS NULL OR cm.thread_id = thread_uuid)
    ORDER BY rank DESC, cm.created_at DESC
    LIMIT limit_count OFFSET offset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get thread participants with their latest activity
CREATE OR REPLACE FUNCTION get_thread_participants(thread_uuid UUID)
RETURNS TABLE (
    user_id UUID,
    message_count BIGINT,
    last_message_at TIMESTAMP WITH TIME ZONE,
    total_reactions_given BIGINT,
    total_mentions BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cm.author_id as user_id,
        COUNT(cm.id) as message_count,
        MAX(cm.created_at) as last_message_at,
        (
            SELECT COUNT(*)
            FROM message_reactions mr
            WHERE mr.user_id = cm.author_id
            AND mr.message_id IN (
                SELECT id FROM community_messages WHERE thread_id = thread_uuid
            )
        ) as total_reactions_given,
        (
            SELECT COUNT(*)
            FROM message_mentions mm
            WHERE mm.mentioned_user_id = cm.author_id
            AND mm.message_id IN (
                SELECT id FROM community_messages WHERE thread_id = thread_uuid
            )
        ) as total_mentions
    FROM community_messages cm
    WHERE cm.thread_id = thread_uuid AND cm.is_deleted = FALSE
    GROUP BY cm.author_id
    ORDER BY message_count DESC, last_message_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Parse mentions from message content
CREATE OR REPLACE FUNCTION extract_mentions(content_text TEXT)
RETURNS TEXT[] AS $$
DECLARE
    mentions TEXT[];
BEGIN
    -- Extract @username patterns (alphanumeric, dots, underscores, hyphens)
    SELECT array_agg(DISTINCT mention)
    INTO mentions
    FROM (
        SELECT regexp_replace(match, '^@', '') as mention
        FROM regexp_split_to_table(content_text, '\s+') as match
        WHERE match ~ '^@[a-zA-Z0-9._-]+$'
    ) extracted_mentions;
    
    RETURN COALESCE(mentions, '{}');
END;
$$ LANGUAGE plpgsql;

-- Get unread mention count for user
CREATE OR REPLACE FUNCTION get_unread_mention_count(user_uuid UUID, workspace_uuid UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    unread_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO unread_count
    FROM message_mentions mm
    JOIN community_messages cm ON mm.message_id = cm.id
    JOIN message_threads mt ON cm.thread_id = mt.id
    WHERE 
        mm.mentioned_user_id = user_uuid
        AND mm.is_read = FALSE
        AND cm.is_deleted = FALSE
        AND (workspace_uuid IS NULL OR mt.workspace_id = workspace_uuid);
    
    RETURN unread_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark mentions as read
CREATE OR REPLACE FUNCTION mark_mentions_as_read(user_uuid UUID, message_ids UUID[] DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE message_mentions
    SET is_read = TRUE
    WHERE 
        mentioned_user_id = user_uuid
        AND is_read = FALSE
        AND (message_ids IS NULL OR message_id = ANY(message_ids));
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant execute permissions on functions to authenticated users
GRANT EXECUTE ON FUNCTION get_messaging_statistics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION search_messages(UUID, TEXT, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_thread_participants(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION extract_mentions(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_mention_count(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_mentions_as_read(UUID, UUID[]) TO authenticated;

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE message_threads IS 'Organizing conversations by topic with categories and status management';
COMMENT ON TABLE community_messages IS 'Main messaging content with threading and rich text support';
COMMENT ON TABLE message_mentions IS 'Track @mentions for notification system integration';
COMMENT ON TABLE message_reactions IS 'Emoji reactions for quick feedback and engagement';
COMMENT ON TABLE message_attachments IS 'File attachments with storage integration following established patterns';
COMMENT ON TABLE message_activity_log IS 'Analytics and audit trail for messaging activity';

COMMENT ON FUNCTION get_messaging_statistics(UUID) IS 'Comprehensive messaging statistics for workspace analytics';
COMMENT ON FUNCTION search_messages(UUID, TEXT, UUID, INTEGER, INTEGER) IS 'Full-text search with Spanish language support';
COMMENT ON FUNCTION get_thread_participants(UUID) IS 'Participant analytics for community engagement insights';
COMMENT ON FUNCTION extract_mentions(TEXT) IS 'Parse @mentions from message content for notification processing';
COMMENT ON FUNCTION get_unread_mention_count(UUID, UUID) IS 'Get unread mention count for notification badges';
COMMENT ON FUNCTION mark_mentions_as_read(UUID, UUID[]) IS 'Mark mentions as read for notification management';