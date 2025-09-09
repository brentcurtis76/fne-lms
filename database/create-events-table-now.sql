-- ================================================
-- EVENTS TABLE CREATION SCRIPT
-- Run this in Supabase SQL Editor
-- ================================================

-- Step 1: Create the events table
CREATE TABLE IF NOT EXISTS public.events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    date_start DATE NOT NULL,
    date_end DATE,
    time VARCHAR(50),
    description TEXT,
    link_url VARCHAR(500),
    link_display VARCHAR(255),
    is_published BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Step 2: Enable Row Level Security
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Step 3: Create policy for viewing published events (public access)
CREATE POLICY "Public can view published events" ON public.events
    FOR SELECT
    USING (is_published = true);

-- Step 4: Create policy for authorized roles to manage events
-- Note: superadmin capability is checked separately via auth_is_superadmin()
CREATE POLICY "Authorized roles can manage events" ON public.events
    FOR ALL
    USING (
        auth_is_superadmin() OR
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.is_active = true
            AND ur.role_type IN ('admin', 'community_manager')
        )
    )
    WITH CHECK (
        auth_is_superadmin() OR
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.is_active = true
            AND ur.role_type IN ('admin', 'community_manager')
        )
    );

-- Step 5: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_date_start ON public.events(date_start);
CREATE INDEX IF NOT EXISTS idx_events_is_published ON public.events(is_published);

-- Step 6: Create update trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Step 7: Create trigger for automatic updated_at
DROP TRIGGER IF EXISTS update_events_updated_at ON public.events;
CREATE TRIGGER update_events_updated_at 
    BEFORE UPDATE ON public.events
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Step 8: Insert sample events (optional - comment out if not needed)
INSERT INTO public.events (title, location, date_start, date_end, time, description, link_url, link_display, is_published)
VALUES 
    -- Past events
    ('Conferencia Anual FNE 2024', 'Santiago, Chile', '2024-12-05', '2024-12-06', '9:00 - 18:00', 
     'Un espacio de encuentro y reflexión para educadores de toda la red.', NULL, NULL, true),
    
    ('Encuentro Docentes', 'Santiago, Chile', '2024-12-20', NULL, '15:00 - 19:00', 
     'Cierre de año y presentación de logros 2024.', NULL, NULL, true),
    
    -- Future events
    ('Workshop Innovación Educativa', 'Santiago, Chile', '2025-01-15', NULL, '10:00 - 13:00', 
     'Metodologías transformadoras con expertos internacionales.', 
     'https://nuevaeducacion.org/workshop', 'Inscríbete aquí', true),
    
    ('Seminario Online: Aula Generativa', 'Virtual', '2025-01-28', NULL, '16:00 - 17:30', 
     'Explorando ecosistemas de aprendizaje para el siglo XXI.', 
     'https://meet.google.com/abc-defg-hij', 'Regístrate', true),
    
    ('Pasantía Barcelona 2025', 'Barcelona, España', '2025-02-10', '2025-02-15', NULL, 
     '5 días de inmersión en innovación educativa con las mejores escuelas de Cataluña.', 
     'https://nuevaeducacion.org/pasantias', 'Más información', true),
    
    ('Encuentro Red FNE', 'Los Pellines, Chile', '2025-02-25', '2025-02-27', 'Todo el día', 
     'Networking y formación continua con educadores de toda la red.', 
     'https://nuevaeducacion.org/encuentro', 'Reserva tu lugar', true);

-- Verify the table was created successfully
SELECT COUNT(*) as total_events FROM public.events;
