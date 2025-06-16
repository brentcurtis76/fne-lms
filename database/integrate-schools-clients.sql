-- ====================================================================
-- INTEGRATE SCHOOLS WITH CLIENTS SYSTEM
-- Links schools (educational view) with clients (business view)
-- ====================================================================

-- 1. Add school reference to clients table
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_clientes_school_id ON clientes(school_id);

-- 2. Add client reference to schools table (reverse link for easy access)
ALTER TABLE schools 
ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_schools_cliente_id ON schools(cliente_id);

-- 3. Create a function to sync school and client data
CREATE OR REPLACE FUNCTION sync_school_client_data()
RETURNS TRIGGER AS $$
BEGIN
  -- When a school is created/updated
  IF TG_TABLE_NAME = 'schools' THEN
    -- If school has a linked client, update client data
    IF NEW.cliente_id IS NOT NULL THEN
      UPDATE clientes 
      SET 
        nombre_fantasia = NEW.name,
        direccion = COALESCE(NEW.address, direccion),
        ciudad = COALESCE(NEW.region, ciudad)
      WHERE id = NEW.cliente_id;
    END IF;
  END IF;
  
  -- When a client is created/updated
  IF TG_TABLE_NAME = 'clientes' THEN
    -- If client has a linked school, update school data
    IF NEW.school_id IS NOT NULL THEN
      UPDATE schools 
      SET 
        name = NEW.nombre_fantasia,
        code = COALESCE(NEW.rut, code),
        region = COALESCE(NEW.ciudad, region)
      WHERE id = NEW.school_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create triggers for bidirectional sync (optional - enable if you want auto-sync)
-- DROP TRIGGER IF EXISTS sync_school_data_trigger ON schools;
-- CREATE TRIGGER sync_school_data_trigger
-- AFTER INSERT OR UPDATE ON schools
-- FOR EACH ROW
-- EXECUTE FUNCTION sync_school_client_data();

-- DROP TRIGGER IF EXISTS sync_client_data_trigger ON clientes;
-- CREATE TRIGGER sync_client_data_trigger
-- AFTER INSERT OR UPDATE ON clientes
-- FOR EACH ROW
-- EXECUTE FUNCTION sync_school_client_data();

-- 5. Create a function to link existing schools with clients by matching name
CREATE OR REPLACE FUNCTION link_existing_schools_clients()
RETURNS TABLE (
  matched_count INTEGER,
  school_name TEXT,
  client_name TEXT
) AS $$
DECLARE
  v_matched_count INTEGER := 0;
BEGIN
  -- Match schools with clients by name (nombre_fantasia)
  UPDATE schools s
  SET cliente_id = c.id
  FROM clientes c
  WHERE LOWER(TRIM(s.name)) = LOWER(TRIM(c.nombre_fantasia))
    AND s.cliente_id IS NULL
    AND c.school_id IS NULL;
  
  GET DIAGNOSTICS v_matched_count = ROW_COUNT;
  
  -- Also update the reverse reference
  UPDATE clientes c
  SET school_id = s.id
  FROM schools s
  WHERE s.cliente_id = c.id
    AND c.school_id IS NULL;
  
  -- Return matched pairs for verification
  RETURN QUERY
  SELECT 
    v_matched_count,
    s.name,
    c.nombre_fantasia
  FROM schools s
  JOIN clientes c ON s.cliente_id = c.id
  WHERE s.cliente_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- 6. Create a view for easy querying of school-client relationships
CREATE OR REPLACE VIEW school_client_view AS
SELECT 
  s.id as school_id,
  s.name as school_name,
  s.code as school_code,
  s.has_generations,
  c.id as cliente_id,
  c.nombre_legal,
  c.nombre_fantasia,
  c.rut,
  c.direccion,
  c.ciudad,
  c.nombre_representante,
  c.email_encargado_proyecto,
  COUNT(DISTINCT co.id) as contract_count,
  COUNT(DISTINCT g.id) as generation_count,
  COUNT(DISTINCT p.id) as user_count
FROM schools s
LEFT JOIN clientes c ON s.cliente_id = c.id
LEFT JOIN contratos co ON c.id = co.cliente_id
LEFT JOIN generations g ON s.id = g.school_id
LEFT JOIN profiles p ON s.id = p.school_id
GROUP BY s.id, c.id;

-- 7. Function to create a client from a school
CREATE OR REPLACE FUNCTION create_client_from_school(
  p_school_id UUID,
  p_rut TEXT DEFAULT NULL,
  p_nombre_legal TEXT DEFAULT NULL,
  p_representante TEXT DEFAULT 'Director del Establecimiento'
) RETURNS UUID AS $$
DECLARE
  v_school RECORD;
  v_client_id UUID;
BEGIN
  -- Get school data
  SELECT * INTO v_school FROM schools WHERE id = p_school_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'School not found';
  END IF;
  
  -- Create client
  INSERT INTO clientes (
    nombre_legal,
    nombre_fantasia,
    rut,
    direccion,
    ciudad,
    nombre_representante
  ) VALUES (
    COALESCE(p_nombre_legal, v_school.name),
    v_school.name,
    COALESCE(p_rut, v_school.code),
    v_school.address,
    v_school.region,
    p_representante
  ) RETURNING id INTO v_client_id;
  
  -- Link school to client
  UPDATE schools SET cliente_id = v_client_id WHERE id = p_school_id;
  UPDATE clientes SET school_id = p_school_id WHERE id = v_client_id;
  
  RETURN v_client_id;
END;
$$ LANGUAGE plpgsql;

-- 8. RLS policies for the new relationships
-- Ensure users can see client data for their schools
CREATE POLICY "Users can view clients for their school" ON clientes
  FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Example usage:
-- SELECT * FROM link_existing_schools_clients(); -- Links existing schools with matching clients
-- SELECT * FROM create_client_from_school('school-uuid-here', '12.345.678-9'); -- Creates a client for a school