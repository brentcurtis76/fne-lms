-- LIC-C2: an encargado de licitacion's own session could insert or update any column of
-- their school's tender and its ATEs, comision, consultas, documentos, evaluaciones and
-- historial rows directly. Every write of the tender flow is made by the server routes
-- with the service role after their own checks, so these eleven rules only served a
-- crafted direct request.
-- This migration only ALTERs the eleven existing encargado INSERT/UPDATE rules so that
-- they require an active admin (the same condition as the tables' "*_admin_all" rules).
-- The rules keep their names; the seven "*_encargado_select" rules and the seven
-- "*_admin_all" rules are not touched; nothing else changes.

ALTER POLICY "licitaciones_encargado_update" ON public.licitaciones
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role_type = 'admin'::public.user_role_type
                   AND ur.is_active = true));

ALTER POLICY "licitacion_ates_encargado_insert" ON public.licitacion_ates
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role_type = 'admin'::public.user_role_type
                   AND ur.is_active = true));

ALTER POLICY "licitacion_ates_encargado_update" ON public.licitacion_ates
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role_type = 'admin'::public.user_role_type
                   AND ur.is_active = true));

ALTER POLICY "licitacion_comision_encargado_insert" ON public.licitacion_comision
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role_type = 'admin'::public.user_role_type
                   AND ur.is_active = true));

ALTER POLICY "licitacion_comision_encargado_update" ON public.licitacion_comision
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role_type = 'admin'::public.user_role_type
                   AND ur.is_active = true));

ALTER POLICY "licitacion_consultas_encargado_insert" ON public.licitacion_consultas
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role_type = 'admin'::public.user_role_type
                   AND ur.is_active = true));

ALTER POLICY "licitacion_consultas_encargado_update" ON public.licitacion_consultas
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role_type = 'admin'::public.user_role_type
                   AND ur.is_active = true));

ALTER POLICY "licitacion_documentos_encargado_insert" ON public.licitacion_documentos
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role_type = 'admin'::public.user_role_type
                   AND ur.is_active = true));

ALTER POLICY "licitacion_evaluaciones_encargado_insert" ON public.licitacion_evaluaciones
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role_type = 'admin'::public.user_role_type
                   AND ur.is_active = true));

ALTER POLICY "licitacion_evaluaciones_encargado_update" ON public.licitacion_evaluaciones
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role_type = 'admin'::public.user_role_type
                   AND ur.is_active = true));

ALTER POLICY "licitacion_historial_encargado_insert" ON public.licitacion_historial
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role_type = 'admin'::public.user_role_type
                   AND ur.is_active = true));
