-- Check the status of all collaborative workspace migrations

-- 1. Check Community Workspaces
SELECT '=== COMMUNITY WORKSPACES ===' as migration;
SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'community_workspaces') as workspaces_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'workspace_activities') as activities_table;

-- 2. Check Document System
SELECT '', '=== DOCUMENT SYSTEM ===' as migration;
SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'document_folders') as folders_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'community_documents') as documents_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'document_versions') as versions_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'document_access_log') as access_log_table;

-- 3. Check Meeting System
SELECT '', '=== MEETING SYSTEM ===' as migration;
SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'community_meetings') as meetings_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'meeting_agreements') as agreements_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'meeting_commitments') as commitments_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'meeting_tasks') as tasks_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'meeting_attendees') as attendees_table;

-- 4. Check Messaging System
SELECT '', '=== MESSAGING SYSTEM ===' as migration;
SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'message_threads') as threads_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'community_messages') as messages_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'message_mentions') as mentions_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'message_reactions') as reactions_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'message_attachments') as attachments_table;

-- 5. Check Activity Feed System
SELECT '', '=== ACTIVITY FEED SYSTEM ===' as migration;
SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_feed') as feed_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_subscriptions') as subscriptions_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_aggregations') as aggregations_table;

-- 6. Check Group Assignments V2
SELECT '', '=== GROUP ASSIGNMENTS V2 ===' as migration;
SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'group_assignment_groups') as groups_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'group_assignment_members') as members_table,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'group_assignment_submissions') as submissions_table;

-- 7. Check Custom Types
SELECT '', '=== CUSTOM TYPES ===' as info;
SELECT typname, 
       CASE 
           WHEN typname LIKE 'meeting_%' THEN 'Meeting System'
           WHEN typname LIKE 'message_%' OR typname LIKE 'thread_%' THEN 'Messaging System'
           WHEN typname LIKE 'activity_%' THEN 'Activity System'
           WHEN typname LIKE 'reaction_%' OR typname = 'mention_type' THEN 'Messaging System'
           ELSE 'Other'
       END as system
FROM pg_type
WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND typtype = 'e'
ORDER BY system, typname;

-- 8. Summary
SELECT '', '=== MIGRATION SUMMARY ===' as info;
SELECT 
    CASE 
        WHEN COUNT(*) FILTER (WHERE table_name IN ('community_workspaces', 'workspace_activities')) = 2 
        THEN '✅ Community Workspaces' 
        ELSE '❌ Community Workspaces' 
    END as status
FROM information_schema.tables WHERE table_schema = 'public'
UNION ALL
SELECT 
    CASE 
        WHEN COUNT(*) FILTER (WHERE table_name IN ('document_folders', 'community_documents', 'document_versions', 'document_access_log')) = 4 
        THEN '✅ Document System' 
        ELSE '❌ Document System' 
    END
FROM information_schema.tables WHERE table_schema = 'public'
UNION ALL
SELECT 
    CASE 
        WHEN COUNT(*) FILTER (WHERE table_name IN ('community_meetings', 'meeting_agreements', 'meeting_commitments', 'meeting_tasks', 'meeting_attendees')) = 5 
        THEN '✅ Meeting System' 
        ELSE '❌ Meeting System' 
    END
FROM information_schema.tables WHERE table_schema = 'public'
UNION ALL
SELECT 
    CASE 
        WHEN COUNT(*) FILTER (WHERE table_name IN ('message_threads', 'community_messages', 'message_mentions', 'message_reactions', 'message_attachments')) >= 5 
        THEN '✅ Messaging System' 
        ELSE '❌ Messaging System' 
    END
FROM information_schema.tables WHERE table_schema = 'public'
UNION ALL
SELECT 
    CASE 
        WHEN COUNT(*) FILTER (WHERE table_name IN ('activity_feed', 'activity_subscriptions', 'activity_aggregations')) = 3 
        THEN '✅ Activity Feed System' 
        ELSE '❌ Activity Feed System' 
    END
FROM information_schema.tables WHERE table_schema = 'public'
UNION ALL
SELECT 
    CASE 
        WHEN COUNT(*) FILTER (WHERE table_name IN ('group_assignment_groups', 'group_assignment_members', 'group_assignment_submissions')) = 3 
        THEN '✅ Group Assignments V2' 
        ELSE '❌ Group Assignments V2' 
    END
FROM information_schema.tables WHERE table_schema = 'public';