BEGIN;
-- Abort on unexpected table/view shape before changing any authorization.
DO $preflight$
BEGIN
 IF EXISTS (SELECT 1 FROM unnest(ARRAY['clientes','cuotas','contratos','contract_hour_allocations','contract_hours_ledger','contract_hour_reallocation_log','message_threads','community_messages','message_attachments','group_assignment_discussions','group_assignment_members','group_assignment_groups']) n
 LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||n)
 WHERE c.oid IS NULL OR c.relkind<>'r' OR NOT c.relrowsecurity) THEN
  RAISE EXCEPTION 'Access migration preflight: missing table or RLS';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('public.community_threads') AND relkind='v') THEN
  RAISE EXCEPTION 'Access migration preflight: missing community_threads view';
 END IF;
END $preflight$;
-- Approved scope: active literal global admins own finance; workspace messages
-- follow workspace access; assignment discussions follow authoritative groups.
-- Existing permissive policies stay; restrictive guards cap their authority.
CREATE FUNCTION public.access_active_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND public.password_change_gate_ok() AND EXISTS
 (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role_type='admin' AND is_active=true)
$$;
REVOKE ALL ON FUNCTION public.access_active_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_active_admin() TO authenticated, service_role;
CREATE POLICY finance_admin_boundary ON public.clientes AS RESTRICTIVE TO authenticated
 USING (public.access_active_admin()) WITH CHECK (public.access_active_admin());
CREATE POLICY finance_admin_boundary ON public.cuotas AS RESTRICTIVE TO authenticated
 USING (public.access_active_admin()) WITH CHECK (public.access_active_admin());
CREATE POLICY finance_admin_operations ON public.clientes TO authenticated
 USING (public.access_active_admin()) WITH CHECK (public.access_active_admin());
CREATE POLICY finance_admin_operations ON public.cuotas TO authenticated
 USING (public.access_active_admin()) WITH CHECK (public.access_active_admin());
-- Follow-up approved scope: raw contracts (including legal snapshots) are also
-- active-global-admin-only. Limited operational hour summaries retain their
-- existing service/API authorization and summary function; no summary ACL changes.
CREATE POLICY finance_admin_boundary ON public.contratos AS RESTRICTIVE TO authenticated
 USING (public.access_active_admin()) WITH CHECK (public.access_active_admin());
CREATE POLICY finance_admin_operations ON public.contratos TO authenticated
 USING (public.access_active_admin()) WITH CHECK (public.access_active_admin());
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.clientes, public.cuotas, public.contratos,
 public.community_messages, public.message_threads, public.message_attachments FROM authenticated;
REVOKE ALL ON public.clientes, public.cuotas, public.contratos, public.community_messages,
 public.message_threads, public.message_attachments, public.community_threads FROM anon, PUBLIC;
ALTER VIEW public.community_threads SET (security_invoker=true);

ALTER TABLE public.message_threads ADD COLUMN assignment_group_id uuid
 REFERENCES public.group_assignment_groups(id);

CREATE FUNCTION public.can_access_assignment_group(p_user_id uuid,p_group_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT p_user_id IS NOT NULL AND (p_user_id=auth.uid() OR (auth.uid() IS NULL AND public.auth_is_backend_caller()))
 AND public.password_change_gate_ok() AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=p_user_id AND p.must_change_password=true) AND EXISTS (
 SELECT 1 FROM public.group_assignment_groups g WHERE g.id=p_group_id AND
 (EXISTS (SELECT 1 FROM public.user_roles ar WHERE ar.user_id=p_user_id AND ar.role_type='admin' AND ar.is_active=true) OR EXISTS (
   SELECT 1 FROM public.group_assignment_members m WHERE m.group_id=g.id
    AND m.assignment_id=g.assignment_id AND m.user_id=p_user_id
    AND EXISTS (SELECT 1 FROM public.user_roles mr WHERE mr.user_id=p_user_id AND mr.is_active=true
     AND (mr.school_id=g.school_id OR (g.community_id IS NOT NULL AND mr.community_id=g.community_id)))
 ) OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p_user_id
   AND ur.role_type='consultor' AND ur.is_active=true AND ur.school_id=g.school_id)))
$$;

CREATE FUNCTION public.access_assignment_group(p_group_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.can_access_assignment_group(auth.uid(),p_group_id)
$$;
CREATE FUNCTION public.can_access_message_thread(p_user_id uuid,p_thread_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT p_user_id IS NOT NULL AND (p_user_id=auth.uid() OR (auth.uid() IS NULL AND public.auth_is_backend_caller()))
 AND public.password_change_gate_ok() AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=p_user_id AND p.must_change_password=true) AND EXISTS (
 SELECT 1 FROM public.message_threads t WHERE t.id=p_thread_id AND
 CASE WHEN t.assignment_group_id IS NOT NULL THEN public.can_access_assignment_group(p_user_id,t.assignment_group_id)
 WHEN EXISTS (SELECT 1 FROM public.group_assignment_discussions d WHERE d.thread_id=t.id)
 THEN NOT EXISTS (SELECT 1 FROM public.group_assignment_discussions d LEFT JOIN public.group_assignment_groups g ON g.id=d.group_id WHERE d.thread_id=t.id
    AND (g.id IS NULL OR d.assignment_id IS DISTINCT FROM g.assignment_id
    OR d.workspace_id IS DISTINCT FROM t.workspace_id OR NOT public.can_access_assignment_group(p_user_id,d.group_id)))
 WHEN t.custom_category_name='group-assignment' THEN false
 ELSE public.can_access_workspace(p_user_id,t.workspace_id) END)
$$;

CREATE FUNCTION public.access_message_thread(p_thread_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.can_access_message_thread(auth.uid(),p_thread_id)
$$;
CREATE FUNCTION public.access_message_context(p_workspace_id uuid,p_thread_id uuid,p_reply_to_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND public.password_change_gate_ok()
 AND CASE WHEN p_thread_id IS NULL THEN public.can_access_workspace(auth.uid(),p_workspace_id)
 ELSE EXISTS (SELECT 1 FROM public.message_threads t WHERE t.id=p_thread_id
   AND t.workspace_id IS NOT DISTINCT FROM p_workspace_id AND public.access_message_thread(t.id)) END
 AND (p_reply_to_id IS NULL OR EXISTS (SELECT 1 FROM public.community_messages parent
   WHERE parent.id=p_reply_to_id AND parent.workspace_id IS NOT DISTINCT FROM p_workspace_id
    AND parent.thread_id IS NOT DISTINCT FROM p_thread_id))
$$;
CREATE FUNCTION public.access_message(p_message_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.community_messages m WHERE m.id=p_message_id
  AND public.access_message_context(m.workspace_id,m.thread_id,m.reply_to_id))
$$;
REVOKE ALL ON FUNCTION public.can_access_assignment_group(uuid,uuid), public.can_access_message_thread(uuid,uuid), public.access_assignment_group(uuid), public.access_message_thread(uuid),
 public.access_message_context(uuid,uuid,uuid), public.access_message(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_access_assignment_group(uuid,uuid), public.can_access_message_thread(uuid,uuid), public.access_assignment_group(uuid), public.access_message_thread(uuid),
 public.access_message_context(uuid,uuid,uuid), public.access_message(uuid) TO authenticated,service_role;

CREATE POLICY messaging_read_boundary ON public.message_threads AS RESTRICTIVE FOR SELECT TO authenticated
 USING (public.access_message_thread(id));
CREATE POLICY messaging_insert_boundary ON public.message_threads AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (assignment_group_id IS NULL AND custom_category_name IS DISTINCT FROM 'group-assignment'
 AND public.can_access_workspace(auth.uid(),workspace_id));
CREATE POLICY messaging_update_boundary ON public.message_threads AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (public.access_message_thread(id)) WITH CHECK (public.access_message_thread(id));
CREATE POLICY messaging_context_boundary ON public.community_messages AS RESTRICTIVE TO authenticated
 USING (public.access_message_context(workspace_id,thread_id,reply_to_id))
 WITH CHECK (public.access_message_context(workspace_id,thread_id,reply_to_id));
CREATE POLICY messaging_parent_boundary ON public.message_attachments AS RESTRICTIVE TO authenticated
 USING (public.access_message(message_id)) WITH CHECK (public.access_message(message_id));
CREATE POLICY discussion_group_boundary ON public.group_assignment_discussions AS RESTRICTIVE TO authenticated
 USING (public.access_assignment_group(group_id)) WITH CHECK (false);
CREATE POLICY discussion_mapping_delete_boundary ON public.group_assignment_discussions AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
CREATE FUNCTION public.access_group_delete_safe(p_group_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT NOT EXISTS (SELECT 1 FROM public.group_assignment_discussions d WHERE d.group_id=p_group_id)
 AND NOT EXISTS (SELECT 1 FROM public.message_threads t WHERE t.assignment_group_id=p_group_id)
$$;
REVOKE ALL ON FUNCTION public.access_group_delete_safe(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.access_group_delete_safe(uuid) TO authenticated,service_role;
CREATE POLICY discussion_group_delete_boundary ON public.group_assignment_groups AS RESTRICTIVE FOR DELETE TO authenticated
 USING (public.access_group_delete_safe(id));
-- Verified server group creation writes as service_role. Direct self-enrollment
-- and membership transplantation would otherwise bypass group-private messages.
CREATE FUNCTION public.access_join_assignment_group(p_group_id uuid,p_assignment_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND public.password_change_gate_ok() AND EXISTS (
 SELECT 1 FROM public.group_assignment_groups g WHERE g.id=p_group_id
 AND g.assignment_id=p_assignment_id AND NOT g.is_consultant_managed
 AND NOT EXISTS (SELECT 1 FROM public.group_assignment_settings s WHERE s.assignment_id=g.assignment_id AND s.consultant_managed)
 AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.is_active=true
  AND CASE WHEN g.community_id IS NULL THEN ur.school_id=g.school_id ELSE ur.community_id=g.community_id END)
 AND (EXISTS (SELECT 1 FROM public.blocks b JOIN public.lessons l ON l.id=b.lesson_id
  WHERE b.id::text=g.assignment_id AND public.auth_is_course_student(l.course_id))
  OR EXISTS (SELECT 1 FROM public.lesson_assignments a WHERE a.id::text=g.assignment_id
   AND a.assignment_for='group' AND a.is_published AND public.auth_is_course_student(a.course_id))))
$$;
REVOKE ALL ON FUNCTION public.access_join_assignment_group(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.access_join_assignment_group(uuid,text) TO authenticated,service_role;
CREATE POLICY discussion_membership_insert_boundary ON public.group_assignment_members AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (user_id=auth.uid() AND role='member' AND public.access_join_assignment_group(group_id,assignment_id));
CREATE POLICY discussion_membership_update_boundary ON public.group_assignment_members AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

-- A community group cannot route staff access to an unrelated school.
CREATE FUNCTION public.guard_assignment_group_context() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.community_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.growth_communities c
   WHERE c.id=NEW.community_id AND c.school_id=NEW.school_id) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Group community school mismatch';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assignment_group_context BEFORE INSERT OR UPDATE ON public.group_assignment_groups
 FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_group_context();
REVOKE ALL ON FUNCTION public.guard_assignment_group_context() FROM PUBLIC,anon,authenticated;

-- Parent identity is immutable in client writes. Content edits still work.
CREATE FUNCTION public.guard_messaging_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF current_user IN ('postgres','service_role','supabase_admin') THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='message_threads' THEN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.assignment_group_id IS DISTINCT FROM OLD.assignment_group_id
   OR (NEW.custom_category_name IS DISTINCT FROM OLD.custom_category_name AND
    (NEW.custom_category_name='group-assignment' OR OLD.custom_category_name='group-assignment')) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Thread identity is immutable';
  END IF;
 ELSIF TG_TABLE_NAME='community_messages' THEN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.thread_id IS DISTINCT FROM OLD.thread_id
   OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Message identity is immutable';
  END IF;
 ELSIF TG_TABLE_NAME='message_attachments' THEN
  IF NEW.message_id IS DISTINCT FROM OLD.message_id OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Attachment identity is immutable';
  END IF;
 ELSIF TG_TABLE_NAME='group_assignment_groups' THEN
  IF NEW.assignment_id IS DISTINCT FROM OLD.assignment_id OR NEW.school_id IS DISTINCT FROM OLD.school_id
   OR NEW.community_id IS DISTINCT FROM OLD.community_id OR NEW.is_consultant_managed IS DISTINCT FROM OLD.is_consultant_managed THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Group identity is immutable';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER messaging_identity BEFORE UPDATE ON public.message_threads FOR EACH ROW EXECUTE FUNCTION public.guard_messaging_identity();
CREATE TRIGGER messaging_identity BEFORE UPDATE ON public.community_messages FOR EACH ROW EXECUTE FUNCTION public.guard_messaging_identity();
CREATE TRIGGER messaging_identity BEFORE UPDATE ON public.message_attachments FOR EACH ROW EXECUTE FUNCTION public.guard_messaging_identity();
CREATE TRIGGER messaging_identity BEFORE UPDATE ON public.group_assignment_groups FOR EACH ROW EXECUTE FUNCTION public.guard_messaging_identity();
REVOKE ALL ON FUNCTION public.guard_messaging_identity() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_or_create_group_discussion(p_assignment_id text,p_group_id uuid,p_workspace_id uuid,p_title text,p_description text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g public.group_assignment_groups%ROWTYPE; t public.message_threads%ROWTYPE;
BEGIN
 SELECT * INTO g FROM public.group_assignment_groups WHERE id=p_group_id FOR UPDATE;
 IF NOT FOUND OR g.assignment_id IS DISTINCT FROM p_assignment_id OR NOT public.access_assignment_group(g.id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Group discussion access denied';
 END IF;
 IF p_workspace_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.community_workspaces w
   WHERE w.id=p_workspace_id AND w.community_id=g.community_id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Group discussion access denied';
 END IF;
 SELECT mt.* INTO t FROM public.message_threads mt JOIN public.group_assignment_discussions d ON d.thread_id=mt.id
 WHERE d.group_id=g.id AND d.assignment_id=g.assignment_id ORDER BY d.created_at,d.id LIMIT 1;
 IF FOUND THEN
  IF NOT public.access_message_thread(t.id) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Group discussion access denied';
  END IF;
  RETURN to_jsonb(t);
 END IF;
 IF p_title IS NULL OR length(btrim(p_title))=0 OR length(p_title)>500 OR length(p_description)>5000 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid discussion title or description';
 END IF;
 INSERT INTO public.message_threads(workspace_id,thread_title,description,created_by,custom_category_name,assignment_group_id)
 VALUES(p_workspace_id,p_title,p_description,auth.uid(),'group-assignment',g.id) RETURNING * INTO t;
 INSERT INTO public.group_assignment_discussions(assignment_id,group_id,workspace_id,thread_id)
 VALUES(g.assignment_id,g.id,p_workspace_id,t.id);
 RETURN to_jsonb(t);
END $$;
REVOKE ALL ON FUNCTION public.get_or_create_group_discussion(text,uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_group_discussion(text,uuid,uuid,text,text) TO authenticated;

-- New content relationships must remain coherent even for backend writers.
CREATE FUNCTION public.guard_message_parent_context() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF TG_TABLE_NAME='community_messages' THEN
  IF NOT public.auth_is_backend_caller() AND NEW.thread_id IS NOT NULL AND NOT public.access_message_thread(NEW.thread_id) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Message parent access denied';
  END IF;
  IF NOT public.auth_is_backend_caller() AND NEW.reply_to_id IS NOT NULL AND NOT public.access_message(NEW.reply_to_id) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Message parent access denied';
  END IF;
  IF NEW.thread_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.message_threads t WHERE t.id=NEW.thread_id
    AND t.workspace_id IS NOT DISTINCT FROM NEW.workspace_id) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Message thread workspace mismatch';
  END IF;
  IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.community_messages m WHERE m.id=NEW.reply_to_id
    AND m.workspace_id IS NOT DISTINCT FROM NEW.workspace_id AND m.thread_id IS NOT DISTINCT FROM NEW.thread_id) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Message reply context mismatch';
  END IF;
 ELSIF TG_TABLE_NAME='message_attachments' THEN
  IF NOT public.auth_is_backend_caller() AND NOT public.access_message(NEW.message_id) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Message parent access denied';
  END IF;
  IF NEW.message_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.community_messages m WHERE m.id=NEW.message_id) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Attachment message required';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER messaging_parent_context BEFORE INSERT OR UPDATE ON public.community_messages
 FOR EACH ROW EXECUTE FUNCTION public.guard_message_parent_context();
CREATE TRIGGER messaging_parent_context BEFORE INSERT OR UPDATE ON public.message_attachments
 FOR EACH ROW EXECUTE FUNCTION public.guard_message_parent_context();
REVOKE ALL ON FUNCTION public.guard_message_parent_context() FROM PUBLIC,anon,authenticated;

-- Preserve the pre-existing active school leadership SELECT audience on hours
-- children after raw contract/client rows become admin-only. This caller-bound
-- boolean reveals no legal fields and grants neither contract nor child writes.
CREATE FUNCTION public.access_school_contract_hours(p_contract_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND public.password_change_gate_ok() AND EXISTS (
  SELECT 1 FROM public.contratos c JOIN public.clientes cl ON cl.id=c.cliente_id
  JOIN public.user_roles ur ON ur.school_id=cl.school_id
  WHERE c.id=p_contract_id AND ur.user_id=auth.uid()
    AND ur.role_type='equipo_directivo' AND ur.is_active=true
 )
$$;
REVOKE ALL ON FUNCTION public.access_school_contract_hours(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_school_contract_hours(uuid) TO authenticated, service_role;
CREATE POLICY hours_school_leadership_select ON public.contract_hour_allocations FOR SELECT TO authenticated
 USING (public.access_school_contract_hours(contrato_id));
CREATE POLICY hours_school_leadership_select ON public.contract_hours_ledger FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.contract_hour_allocations a
  WHERE a.id=allocation_id AND public.access_school_contract_hours(a.contrato_id)));
CREATE POLICY hours_school_leadership_select ON public.contract_hour_reallocation_log FOR SELECT TO authenticated
 USING (public.access_school_contract_hours(contrato_id));

COMMIT;
