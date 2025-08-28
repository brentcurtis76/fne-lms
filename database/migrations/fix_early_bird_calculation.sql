-- Fix the early bird discount calculation to properly handle multiple participants
CREATE OR REPLACE FUNCTION calculate_quote_totals_with_discount()
RETURNS TRIGGER AS $$
DECLARE
    programs_cost_per_person DECIMAL(10,2);
    accommodation_cost_per_person DECIMAL(10,2);
    room_price DECIMAL(10,2);
    discount_per_person DECIMAL(10,2) := 0;
BEGIN
    -- Skip calculation if using groups system (handled by groups trigger)
    IF NEW.use_groups = true THEN
        RETURN NEW;
    END IF;
    
    -- Only calculate if we have the necessary fields
    IF NEW.arrival_date IS NOT NULL AND NEW.departure_date IS NOT NULL THEN
        -- Calculate program costs per person
        SELECT COALESCE(SUM(price), 0) INTO programs_cost_per_person
        FROM public.pasantias_programs
        WHERE id = ANY(NEW.selected_programs)
        AND is_active = true;
        
        -- Store original program total (for all participants)
        NEW.original_program_total := programs_cost_per_person * COALESCE(NEW.num_pasantes, 1);
        
        -- Apply early bird discount if enabled ($500,000 CLP discount per program per person)
        IF NEW.apply_early_bird_discount = true THEN
            -- Calculate discount per person
            SELECT COALESCE(COUNT(*) * 500000, 0) INTO discount_per_person
            FROM public.pasantias_programs
            WHERE id = ANY(NEW.selected_programs)
            AND is_active = true;
            
            -- Apply discount to per-person cost
            programs_cost_per_person := GREATEST(0, programs_cost_per_person - discount_per_person);
            
            -- Total discount for all participants
            NEW.discount_amount := discount_per_person * COALESCE(NEW.num_pasantes, 1);
        ELSE
            NEW.discount_amount := 0;
        END IF;
        
        -- Get the appropriate room price
        IF NEW.room_type = 'single' THEN
            room_price := NEW.single_room_price;
        ELSE
            room_price := NEW.double_room_price;
        END IF;
        
        -- Calculate accommodation total based on number of ROOMS needed
        IF NEW.room_type = 'single' THEN
            -- Single rooms: one room per person
            NEW.accommodation_total := COALESCE((NEW.departure_date - NEW.arrival_date) * room_price * NEW.num_pasantes, 0);
            accommodation_cost_per_person := COALESCE((NEW.departure_date - NEW.arrival_date) * room_price, 0);
        ELSE
            -- Double rooms: calculate number of rooms needed (2 people per room)
            NEW.accommodation_total := COALESCE((NEW.departure_date - NEW.arrival_date) * room_price * CEIL(NEW.num_pasantes::numeric / 2), 0);
            accommodation_cost_per_person := NEW.accommodation_total / NEW.num_pasantes;
        END IF;
        
        -- Update totals
        NEW.program_total := programs_cost_per_person * COALESCE(NEW.num_pasantes, 1);
        NEW.total_per_person := COALESCE(NEW.flight_price, 0) + accommodation_cost_per_person + programs_cost_per_person;
        NEW.grand_total := NEW.total_per_person * COALESCE(NEW.num_pasantes, 1);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate the trigger to use the updated function
DROP TRIGGER IF EXISTS calculate_pasantias_quote_totals_with_discount ON public.pasantias_quotes;
CREATE TRIGGER calculate_pasantias_quote_totals_with_discount
    BEFORE INSERT OR UPDATE ON public.pasantias_quotes
    FOR EACH ROW
    EXECUTE FUNCTION calculate_quote_totals_with_discount();

-- Also update the groups calculation to handle discounts properly
CREATE OR REPLACE FUNCTION calculate_quote_totals_with_groups_and_discount()
RETURNS TRIGGER AS $$
DECLARE
    programs_cost_per_person DECIMAL(10,2);
    groups_accommodation_total DECIMAL(10,2);
    groups_flight_total DECIMAL(10,2);
    total_participants INTEGER;
    discount_per_person DECIMAL(10,2) := 0;
BEGIN
    -- Only calculate if using groups system
    IF NEW.use_groups = true THEN
        -- Calculate program costs per person
        SELECT COALESCE(SUM(price), 0) INTO programs_cost_per_person
        FROM public.pasantias_programs
        WHERE id = ANY(NEW.selected_programs)
        AND is_active = true;
        
        -- Get totals from groups
        SELECT 
            COALESCE(SUM(accommodation_total), 0),
            COALESCE(SUM(flight_total), 0),
            COALESCE(SUM(num_participants), 0)
        INTO groups_accommodation_total, groups_flight_total, total_participants
        FROM public.pasantias_quote_groups
        WHERE quote_id = NEW.id;
        
        -- Store original program total (for all participants)
        NEW.original_program_total := programs_cost_per_person * GREATEST(total_participants, 1);
        
        -- Apply early bird discount if enabled ($500,000 CLP discount per program per person)
        IF NEW.apply_early_bird_discount = true THEN
            -- Calculate discount per person
            SELECT COALESCE(COUNT(*) * 500000, 0) INTO discount_per_person
            FROM public.pasantias_programs
            WHERE id = ANY(NEW.selected_programs)
            AND is_active = true;
            
            -- Apply discount to per-person cost
            programs_cost_per_person := GREATEST(0, programs_cost_per_person - discount_per_person);
            
            -- Total discount for all participants
            NEW.discount_amount := discount_per_person * GREATEST(total_participants, 1);
        ELSE
            NEW.discount_amount := 0;
        END IF;
        
        -- Update totals
        NEW.num_pasantes := GREATEST(total_participants, 1);
        NEW.accommodation_total := groups_accommodation_total;
        NEW.program_total := programs_cost_per_person * NEW.num_pasantes;
        NEW.total_per_person := (groups_flight_total + groups_accommodation_total + (programs_cost_per_person * NEW.num_pasantes)) / GREATEST(NEW.num_pasantes, 1);
        NEW.grand_total := groups_flight_total + groups_accommodation_total + (programs_cost_per_person * NEW.num_pasantes);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate the groups trigger
DROP TRIGGER IF EXISTS calculate_quote_totals_with_groups_and_discount_trigger ON public.pasantias_quotes;
CREATE TRIGGER calculate_quote_totals_with_groups_and_discount_trigger
    BEFORE INSERT OR UPDATE ON public.pasantias_quotes
    FOR EACH ROW
    WHEN (NEW.use_groups = true)
    EXECUTE FUNCTION calculate_quote_totals_with_groups_and_discount();

-- Update existing quotes to recalculate with the fixed formula
UPDATE public.pasantias_quotes 
SET updated_at = NOW()
WHERE apply_early_bird_discount = true;