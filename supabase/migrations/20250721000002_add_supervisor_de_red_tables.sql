-- Add supervisor_de_red to the user_role_type enum
-- Note: This requires a separate transaction in PostgreSQL
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumtypid = 'user_role_type'::regtype 
        AND enumlabel = 'supervisor_de_red'
    ) THEN
        ALTER TYPE user_role_type ADD VALUE 'supervisor_de_red';
    END IF;
END $$;

-- Create redes_de_colegios table for network management
CREATE TABLE IF NOT EXISTS public.redes_de_colegios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL UNIQUE,
    descripcion TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    last_updated_by UUID REFERENCES auth.users(id)
);

-- Create red_escuelas table for network-school relationships
CREATE TABLE IF NOT EXISTS public.red_escuelas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    red_id UUID NOT NULL REFERENCES redes_de_colegios(id) ON DELETE CASCADE,
    school_id BIGINT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    fecha_agregada TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    agregado_por UUID NOT NULL REFERENCES auth.users(id),
    UNIQUE(red_id, school_id)
);

-- Create supervisor_auditorias table for audit trail
CREATE TABLE IF NOT EXISTS public.supervisor_auditorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supervisor_id UUID NOT NULL REFERENCES auth.users(id),
    accion VARCHAR(255) NOT NULL,
    red_id UUID REFERENCES redes_de_colegios(id),
    school_id BIGINT REFERENCES schools(id),
    detalles JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_redes_de_colegios_created_by ON redes_de_colegios(created_by);
CREATE INDEX IF NOT EXISTS idx_red_escuelas_red_id ON red_escuelas(red_id);
CREATE INDEX IF NOT EXISTS idx_red_escuelas_school_id ON red_escuelas(school_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_auditorias_supervisor_id ON supervisor_auditorias(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_auditorias_created_at ON supervisor_auditorias(created_at);

-- Enable RLS
ALTER TABLE redes_de_colegios ENABLE ROW LEVEL SECURITY;
ALTER TABLE red_escuelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_auditorias ENABLE ROW LEVEL SECURITY;

-- RLS Policies for redes_de_colegios (simplified - admin only for now)
CREATE POLICY "Admins can manage all networks" 
ON redes_de_colegios FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type = 'admin' 
        AND is_active = true
    )
);

-- RLS Policies for red_escuelas (simplified - admin only for now)
CREATE POLICY "Admins can manage all network schools"
ON red_escuelas FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type = 'admin' 
        AND is_active = true
    )
);

-- RLS Policies for supervisor_auditorias
CREATE POLICY "Admins can view all audit logs"
ON supervisor_auditorias FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type = 'admin' 
        AND is_active = true
    )
);

CREATE POLICY "Users can view their own audit logs"
ON supervisor_auditorias FOR SELECT
USING (supervisor_id = auth.uid());

CREATE POLICY "Users can insert their own audit logs"
ON supervisor_auditorias FOR INSERT
WITH CHECK (supervisor_id = auth.uid());

-- Create update timestamp trigger for redes_de_colegios
CREATE TRIGGER update_redes_de_colegios_updated_at 
BEFORE UPDATE ON redes_de_colegios
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();