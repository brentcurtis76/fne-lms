-- Check what exists and create only what's missing
BEGIN;

-- Create RLS policies only if they don't exist
DO $$
BEGIN
    -- Check and create networks_supervisor_read policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'redes_de_colegios' 
        AND policyname = 'networks_supervisor_read'
    ) THEN
        CREATE POLICY "networks_supervisor_read" ON redes_de_colegios
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM user_roles ur 
                    WHERE ur.user_id = auth.uid() 
                    AND ur.role_type = 'supervisor_de_red'
                    AND ur.red_id = id
                    AND ur.is_active = true
                )
            );
        RAISE NOTICE 'Created networks_supervisor_read policy';
    END IF;

    -- Check and create red_escuelas_supervisor_read policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'red_escuelas' 
        AND policyname = 'red_escuelas_supervisor_read'
    ) THEN
        CREATE POLICY "red_escuelas_supervisor_read" ON red_escuelas
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM user_roles ur 
                    WHERE ur.user_id = auth.uid() 
                    AND ur.role_type = 'supervisor_de_red'
                    AND ur.red_id = red_escuelas.red_id
                    AND ur.is_active = true
                )
            );
        RAISE NOTICE 'Created red_escuelas_supervisor_read policy';
    END IF;
END $$;

COMMIT;

-- Verify everything is set up
SELECT 
    'Tables created' as component,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'redes_de_colegios') as redes_table,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'red_escuelas') as red_escuelas_table,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'user_roles' AND column_name = 'red_id') as red_id_column
UNION ALL
SELECT 
    'Admin policies' as component,
    EXISTS(SELECT 1 FROM pg_policies WHERE tablename = 'redes_de_colegios' AND policyname = 'networks_admin_all_access') as networks_admin,
    EXISTS(SELECT 1 FROM pg_policies WHERE tablename = 'red_escuelas' AND policyname = 'red_escuelas_admin_all_access') as red_escuelas_admin,
    true as red_id_column
UNION ALL
SELECT 
    'Supervisor policies' as component,
    EXISTS(SELECT 1 FROM pg_policies WHERE tablename = 'redes_de_colegios' AND policyname = 'networks_supervisor_read') as networks_supervisor,
    EXISTS(SELECT 1 FROM pg_policies WHERE tablename = 'red_escuelas' AND policyname = 'red_escuelas_supervisor_read') as red_escuelas_supervisor,
    true as red_id_column;