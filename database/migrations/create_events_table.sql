-- Create events table for timeline
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

-- Add RLS policies
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Policy for viewing published events (everyone can see)
CREATE POLICY "Public can view published events" ON public.events
    FOR SELECT
    USING (is_published = true);

-- Policy for admins, superadmins, and community managers to manage events
CREATE POLICY "Authorized roles can manage events" ON public.events
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.is_active = true
            AND ur.role_type IN ('admin', 'superadmin', 'community_manager')
        )
    );

-- Create index for date queries
CREATE INDEX idx_events_date_start ON public.events(date_start);
CREATE INDEX idx_events_is_published ON public.events(is_published);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();