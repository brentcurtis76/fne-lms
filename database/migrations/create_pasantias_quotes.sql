-- Create pasantias_programs table for available programs
CREATE TABLE IF NOT EXISTS public.pasantias_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    pdf_url TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create pasantias_quotes table for storing quote/proposals
CREATE TABLE IF NOT EXISTS public.pasantias_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Client Information
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_phone TEXT,
    client_institution TEXT,
    
    -- Travel Details
    arrival_date DATE NOT NULL,
    departure_date DATE NOT NULL,
    nights INTEGER GENERATED ALWAYS AS (departure_date - arrival_date) STORED,
    
    -- Flight Information
    flight_price DECIMAL(10,2) DEFAULT 0,
    flight_notes TEXT,
    
    -- Accommodation Details
    room_type TEXT NOT NULL CHECK (room_type IN ('single', 'double')),
    single_room_price DECIMAL(10,2) DEFAULT 0,
    double_room_price DECIMAL(10,2) DEFAULT 0,
    num_pasantes INTEGER NOT NULL DEFAULT 1 CHECK (num_pasantes > 0),
    
    -- Program Selection (array of program IDs)
    selected_programs UUID[] DEFAULT ARRAY[]::UUID[],
    program_total DECIMAL(10,2) DEFAULT 0,
    
    -- Calculated Totals
    accommodation_total DECIMAL(10,2) DEFAULT 0,
    total_per_person DECIMAL(10,2) DEFAULT 0,
    grand_total DECIMAL(10,2) DEFAULT 0,
    
    -- Additional Information
    notes TEXT,
    internal_notes TEXT,
    
    -- Status and Tracking
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired')),
    valid_until DATE,
    viewed_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    
    -- User tracking
    created_by UUID REFERENCES public.profiles(id),
    updated_by UUID REFERENCES public.profiles(id),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Insert only the 2 correct programs with proper pricing information
INSERT INTO public.pasantias_programs (name, description, price, pdf_url, display_order) VALUES
('Programa para Líderes Pedagógicos', 'Pasantía internacional para líderes educativos con visitas a escuelas innovadoras, talleres especializados y certificación internacional. Precio regular: $2.500.000 CLP. Precio especial: $2.000.000 CLP si se paga antes del 30 de septiembre de 2025.', 2500000.00, 'https://heyzine.com/flip-book/9723a41fa1.html', 1),
('Programa Estratégico para Directivos', 'Experiencia intensiva de liderazgo educativo y gestión del cambio para equipos directivos. Precio regular: $2.500.000 CLP. Precio especial: $2.000.000 CLP si se paga antes del 30 de septiembre de 2025.', 2500000.00, 'https://heyzine.com/flip-book/562763b1bb.html', 2)
ON CONFLICT DO NOTHING;

-- Create indexes for better performance
CREATE INDEX idx_pasantias_quotes_status ON public.pasantias_quotes(status);
CREATE INDEX idx_pasantias_quotes_created_at ON public.pasantias_quotes(created_at DESC);
CREATE INDEX idx_pasantias_quotes_client_name ON public.pasantias_quotes(client_name);
CREATE INDEX idx_pasantias_programs_active ON public.pasantias_programs(is_active);

-- Create RLS policies for pasantias_programs (public read, admin write)
ALTER TABLE public.pasantias_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Programs are viewable by everyone" ON public.pasantias_programs
    FOR SELECT USING (true);

CREATE POLICY "Programs are editable by admins" ON public.pasantias_programs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true
        )
    );

-- Create RLS policies for pasantias_quotes
ALTER TABLE public.pasantias_quotes ENABLE ROW LEVEL SECURITY;

-- Public can view quotes by ID (for sharing)
CREATE POLICY "Quotes are viewable by ID" ON public.pasantias_quotes
    FOR SELECT USING (true);

-- Admins and consultors can manage quotes
CREATE POLICY "Quotes are manageable by admins and consultors" ON public.pasantias_quotes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND role_type IN ('admin', 'consultor')
            AND is_active = true
        )
    );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pasantias_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_pasantias_quotes_updated_at
    BEFORE UPDATE ON public.pasantias_quotes
    FOR EACH ROW
    EXECUTE FUNCTION update_pasantias_updated_at();

CREATE TRIGGER update_pasantias_programs_updated_at
    BEFORE UPDATE ON public.pasantias_programs
    FOR EACH ROW
    EXECUTE FUNCTION update_pasantias_updated_at();

-- Add function to calculate quote totals
CREATE OR REPLACE FUNCTION calculate_quote_totals()
RETURNS TRIGGER AS $$
DECLARE
    programs_total DECIMAL(10,2);
    accommodation_cost DECIMAL(10,2);
    room_price DECIMAL(10,2);
BEGIN
    -- Calculate program costs
    SELECT COALESCE(SUM(price), 0) INTO programs_total
    FROM public.pasantias_programs
    WHERE id = ANY(NEW.selected_programs)
    AND is_active = true;
    
    -- Get the appropriate room price
    IF NEW.room_type = 'single' THEN
        room_price := NEW.single_room_price;
    ELSE
        room_price := NEW.double_room_price;
    END IF;
    
    -- Calculate accommodation total
    accommodation_cost := COALESCE((NEW.departure_date - NEW.arrival_date) * room_price, 0);
    
    -- Update totals
    NEW.program_total := programs_total;
    NEW.accommodation_total := accommodation_cost;
    NEW.total_per_person := COALESCE(NEW.flight_price, 0) + accommodation_cost + programs_total;
    NEW.grand_total := NEW.total_per_person * NEW.num_pasantes;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate totals
CREATE TRIGGER calculate_pasantias_quote_totals
    BEFORE INSERT OR UPDATE ON public.pasantias_quotes
    FOR EACH ROW
    EXECUTE FUNCTION calculate_quote_totals();