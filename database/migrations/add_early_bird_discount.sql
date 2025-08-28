-- Add early bird discount tracking to quotes
ALTER TABLE public.pasantias_quotes
    ADD COLUMN IF NOT EXISTS apply_early_bird_discount BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS early_bird_payment_date DATE,
    ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS original_program_total DECIMAL(10,2) DEFAULT 0;

-- Add comment to explain the discount
COMMENT ON COLUMN public.pasantias_quotes.apply_early_bird_discount IS 'Si aplica el descuento por pago anticipado (antes del 30 de septiembre 2025)';
COMMENT ON COLUMN public.pasantias_quotes.early_bird_payment_date IS 'Fecha límite para aplicar el descuento';
COMMENT ON COLUMN public.pasantias_quotes.discount_amount IS 'Monto total del descuento aplicado';
COMMENT ON COLUMN public.pasantias_quotes.original_program_total IS 'Precio original de los programas sin descuento';

-- Update the calculation function to handle discounts
CREATE OR REPLACE FUNCTION calculate_quote_totals_with_discount()
RETURNS TRIGGER AS $$
DECLARE
    programs_total DECIMAL(10,2);
    discounted_programs_total DECIMAL(10,2);
    accommodation_cost DECIMAL(10,2);
    room_price DECIMAL(10,2);
    discount_per_program DECIMAL(10,2) := 500000; -- $500,000 CLP discount per program
BEGIN
    -- Skip calculation if using groups system (handled by groups trigger)
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
        
        -- Store original program total
        NEW.original_program_total := programs_total;
        
        -- Apply early bird discount if enabled
        IF NEW.apply_early_bird_discount = true THEN
            -- Calculate discounted total (each program gets $500,000 CLP discount)
            SELECT COALESCE(SUM(price - 500000), 0) INTO discounted_programs_total
            FROM public.pasantias_programs
            WHERE id = ANY(NEW.selected_programs)
            AND is_active = true;
            
            NEW.discount_amount := programs_total - discounted_programs_total;
            programs_total := discounted_programs_total;
        ELSE
            NEW.discount_amount := 0;
        END IF;
        
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

-- Update trigger for quotes
DROP TRIGGER IF EXISTS calculate_pasantias_quote_totals ON public.pasantias_quotes;
CREATE TRIGGER calculate_pasantias_quote_totals_with_discount
    BEFORE INSERT OR UPDATE ON public.pasantias_quotes
    FOR EACH ROW
    EXECUTE FUNCTION calculate_quote_totals_with_discount();

-- Also update the groups calculation to handle discounts
CREATE OR REPLACE FUNCTION calculate_quote_totals_with_groups_and_discount()
RETURNS TRIGGER AS $$
DECLARE
    programs_total DECIMAL(10,2);
    discounted_programs_total DECIMAL(10,2);
    groups_accommodation_total DECIMAL(10,2);
    groups_flight_total DECIMAL(10,2);
    total_participants INTEGER;
    discount_per_program DECIMAL(10,2) := 500000; -- $500,000 CLP discount per program
BEGIN
    -- Only calculate if using groups system
    IF NEW.use_groups = true THEN
        -- Calculate program costs
        SELECT COALESCE(SUM(price), 0) INTO programs_total
        FROM public.pasantias_programs
        WHERE id = ANY(NEW.selected_programs)
        AND is_active = true;
        
        -- Store original program total
        NEW.original_program_total := programs_total;
        
        -- Apply early bird discount if enabled
        IF NEW.apply_early_bird_discount = true THEN
            -- Calculate discounted total (each program gets $500,000 CLP discount)
            SELECT COALESCE(SUM(price - 500000), 0) INTO discounted_programs_total
            FROM public.pasantias_programs
            WHERE id = ANY(NEW.selected_programs)
            AND is_active = true;
            
            NEW.discount_amount := (programs_total - discounted_programs_total);
            programs_total := discounted_programs_total;
        ELSE
            NEW.discount_amount := 0;
        END IF;
        
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
        NEW.discount_amount := NEW.discount_amount * NEW.num_pasantes; -- Multiply discount by participants
        NEW.total_per_person := (groups_flight_total + groups_accommodation_total + (programs_total * NEW.num_pasantes)) / GREATEST(NEW.num_pasantes, 1);
        NEW.grand_total := groups_flight_total + groups_accommodation_total + (programs_total * NEW.num_pasantes);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for groups with discount
DROP TRIGGER IF EXISTS calculate_quote_totals_with_groups_trigger ON public.pasantias_quotes;
CREATE TRIGGER calculate_quote_totals_with_groups_and_discount_trigger
    BEFORE INSERT OR UPDATE ON public.pasantias_quotes
    FOR EACH ROW
    WHEN (NEW.use_groups = true)
    EXECUTE FUNCTION calculate_quote_totals_with_groups_and_discount();