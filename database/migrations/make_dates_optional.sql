-- Make arrival_date and departure_date nullable for quotes using groups
ALTER TABLE public.pasantias_quotes 
    ALTER COLUMN arrival_date DROP NOT NULL,
    ALTER COLUMN departure_date DROP NOT NULL;

-- Also make num_pasantes nullable since it will be calculated from groups
ALTER TABLE public.pasantias_quotes 
    ALTER COLUMN num_pasantes SET DEFAULT 1;

-- Update the trigger to handle null dates
CREATE OR REPLACE FUNCTION calculate_quote_totals()
RETURNS TRIGGER AS $$
DECLARE
    programs_total DECIMAL(10,2);
    accommodation_cost DECIMAL(10,2);
    room_price DECIMAL(10,2);
BEGIN
    -- Skip calculation if using groups system
    IF NEW.use_groups = true THEN
        RETURN NEW;
    END IF;
    
    -- Only calculate if we have the necessary fields
    IF NEW.arrival_date IS NOT NULL AND NEW.departure_date IS NOT NULL THEN
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
        NEW.grand_total := NEW.total_per_person * COALESCE(NEW.num_pasantes, 1);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;