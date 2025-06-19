-- Check for any triggers that might be causing the issue

SELECT 
    trigger_name,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_table IN ('group_assignment_groups', 'group_assignment_members', 'group_assignment_submissions')
ORDER BY event_object_table, trigger_name;