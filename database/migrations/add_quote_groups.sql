-- Create table for quote travel groups
CREATE TABLE IF NOT EXISTS public.pasantias_quote_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES public.pasantias_quotes(id) ON DELETE CASCADE,
    
    -- Group Details
    group_name TEXT, -- Optional name like "Group A" or "First Week"
    num_participants INTEGER NOT NULL DEFAULT 1 CHECK (num_participants > 0),
    
    -- Travel Details
    arrival_date DATE NOT NULL,
    departure_date DATE NOT NULL,
    nights INTEGER GENERATED ALWAYS AS (departure_date - arrival_date) STORED,
    
    -- Flight Information
    flight_price DECIMAL(10,2) DEFAULT 0,
    
    -- Accommodation Details
    room_type TEXT NOT NULL CHECK (room_type IN ('single', 'double')),
    room_price_per_night DECIMAL(10,2) DEFAULT 0,
    
    -- Calculated Subtotals for this group
    accommodation_total DECIMAL(10,2) GENERATED ALWAYS AS ((departure_date - arrival_date) * room_price_per_night * num_participants) STORED,
    flight_total DECIMAL(10,2) GENERATED ALWAYS AS (flight_price * num_participants) STORED,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create index for performance
CREATE INDEX idx_quote_groups_quote_id ON public.pasantias_quote_groups(quote_id);

-- Migrate existing quotes data to groups table
-- First, create a group for each existing quote with data
INSERT INTO public.pasantias_quote_groups (
    quote_id,
    group_name,
    num_participants,
    arrival_date,
    departure_date,
    flight_price,
    room_type,
    room_price_per_night
)
SELECT 
    id as quote_id,
    'Grupo Principal' as group_name,
    num_pasantes as num_participants,
    arrival_date,
    departure_date,
    flight_price,
    room_type,
    CASE 
        WHEN room_type = 'single' THEN single_room_price
        ELSE double_room_price
    END as room_price_per_night
FROM public.pasantias_quotes
WHERE arrival_date IS NOT NULL AND departure_date IS NOT NULL;

-- Now modify the quotes table to remove individual travel fields
-- We'll keep these columns for now but mark them as deprecated
-- This allows for a gradual migration
ALTER TABLE public.pasantias_quotes 
    ADD COLUMN IF NOT EXISTS use_groups BOOLEAN DEFAULT false;

-- Update quotes that have groups to use the new system
UPDATE public.pasantias_quotes q
SET use_groups = true
WHERE EXISTS (
    SELECT 1 FROM public.pasantias_quote_groups g 
    WHERE g.quote_id = q.id
);

-- Add RLS policies for the new table
ALTER TABLE public.pasantias_quote_groups ENABLE ROW LEVEL SECURITY;

-- Public can view groups by quote ID (for sharing)
CREATE POLICY "Quote groups are viewable by ID" ON public.pasantias_quote_groups
    FOR SELECT USING (true);

-- Admins and consultors can manage quote groups
CREATE POLICY "Quote groups are manageable by admins and consultors" ON public.pasantias_quote_groups
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND role_type IN ('admin', 'consultor')
            AND is_active = true
        )
    );

-- Create function to calculate quote totals with groups
CREATE OR REPLACE FUNCTION calculate_quote_totals_with_groups()
RETURNS TRIGGER AS $$
DECLARE
    programs_total DECIMAL(10,2);
    groups_accommodation_total DECIMAL(10,2);
    groups_flight_total DECIMAL(10,2);
    total_participants INTEGER;
BEGIN
    -- Only calculate if using groups system
    IF NEW.use_groups = true THEN
        -- Calculate program costs
        SELECT COALESCE(SUM(price), 0) INTO programs_total
        FROM public.pasantias_programs
        WHERE id = ANY(NEW.selected_programs)
        AND is_active = true;
        
        -- Calculate totals from groups
        SELECT 
            COALESCE(SUM(accommodation_total), 0),
            COALESCE(SUM(flight_total), 0),
            COALESCE(SUM(num_participants), 0)
        INTO groups_accommodation_total, groups_flight_total, total_participants
        FROM public.pasantias_quote_groups
        WHERE quote_id = NEW.id;
        
        -- Update totals
        NEW.num_pasantes := GREATEST(total_participants, 1);
        NEW.accommodation_total := groups_accommodation_total;
        NEW.program_total := programs_total * NEW.num_pasantes;
        NEW.total_per_person := (groups_flight_total + groups_accommodation_total + (programs_total * NEW.num_pasantes)) / GREATEST(NEW.num_pasantes, 1);
        NEW.grand_total := groups_flight_total + groups_accommodation_total + (programs_total * NEW.num_pasantes);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for the new calculation
CREATE TRIGGER calculate_quote_totals_with_groups_trigger
    BEFORE INSERT OR UPDATE ON public.pasantias_quotes
    FOR EACH ROW
    WHEN (NEW.use_groups = true)
    EXECUTE FUNCTION calculate_quote_totals_with_groups();

-- Create trigger to update quote totals when groups change
CREATE OR REPLACE FUNCTION update_quote_on_group_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Force recalculation of the parent quote
    UPDATE public.pasantias_quotes
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = COALESCE(NEW.quote_id, OLD.quote_id)
    AND use_groups = true;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_quote_on_group_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.pasantias_quote_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_quote_on_group_change();