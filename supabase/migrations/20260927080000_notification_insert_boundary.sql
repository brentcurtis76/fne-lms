-- N0-03: notification insert boundary.
--
-- Why: browser roles could insert arbitrary rows into public.user_notifications
-- for any user (permissive PUBLIC insert policy WITH CHECK (true) plus INSERT
-- grants to anon and authenticated), and could call the SECURITY INVOKER
-- function public.create_notification_safe directly.
--
-- Server code keeps inserting notifications through service_role, which holds
-- its grants and bypasses RLS. Additive only: SELECT, UPDATE and DELETE
-- policies, RLS enablement and every other object are left as they are.

-- 1. create_notification_safe: service_role only (same pattern as
--    create_user_notification in 20260908180300_r2_remediation.sql).
REVOKE ALL ON FUNCTION public.create_notification_safe(uuid, character varying, text, character varying, character varying, character varying, character varying, character varying) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification_safe(uuid, character varying, text, character varying, character varying, character varying, character varying, character varying) TO service_role;

-- 2. Table privileges: anon loses everything; authenticated loses INSERT only
--    and keeps its remaining privileges. service_role grants are unchanged.
REVOKE ALL ON TABLE public.user_notifications FROM anon;
REVOKE INSERT ON TABLE public.user_notifications FROM authenticated;

-- 3. Narrow the permissive insert policy from PUBLIC to service_role.
--    service_role bypasses RLS anyway, so this only removes browser roles.
ALTER POLICY "System can insert notifications" ON public.user_notifications TO service_role;

-- 4. Defense in depth. The permissive FOR ALL policies user_notifications_user_own
--    and user_notifications_admin_all would still admit a browser INSERT if an
--    INSERT grant ever came back. Replacing them would not be additive, so a
--    RESTRICTIVE insert policy is layered on top instead: restrictive policies
--    are AND-ed with the permissive ones, and WITH CHECK (false) rejects every
--    browser-role insert regardless of what the permissive policies allow.
CREATE POLICY user_notifications_insert_service_role_only ON public.user_notifications
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);
