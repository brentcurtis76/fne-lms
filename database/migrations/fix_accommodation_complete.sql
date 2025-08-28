-- Complete fix for accommodation calculation and missing columns

-- First, ensure all necessary columns exist
ALTER TABLE public.pasantias_quotes
    ADD COLUMN IF NOT EXISTS apply_early_bird_discount BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS early_bird_payment_date DATE,
    ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS original_program_total DECIMAL(10,2) DEFAULT 0;

-- Fix the quote groups table (remove incorrect generated columns if they exist)
ALTER TABLE public.pasantias_quote_groups 
    DROP COLUMN IF EXISTS accommodation_total CASCADE,
    DROP COLUMN IF EXISTS flight_total CASCADE;

-- Add them back as regular columns
ALTER TABLE public.pasantias_quote_groups 
    ADD COLUMN IF NOT EXISTS accommodation_total DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS flight_total DECIMAL(10,2) DEFAULT 0;

-- Create function to calculate group totals correctly
CREATE OR REPLACE FUNCTION calculate_group_totals()
RETURNS TRIGGER AS $$
DECLARE
    nights_count INTEGER;
    rooms_needed INTEGER;
BEGIN
    -- Calculate nights
    nights_count := COALESCE(NEW.departure_date - NEW.arrival_date, 0);
    
    -- Calculate number of rooms needed based on room type
    IF NEW.room_type = 'single' THEN
        -- Single rooms: one room per person
        rooms_needed := NEW.num_participants;
    ELSE
        -- Double rooms: 2 people per room (round up for odd numbers)
        rooms_needed := CEIL(NEW.num_participants::numeric / 2);
    END IF;
    
    -- Calculate accommodation total (nights * price per room * number of rooms)
    NEW.accommodation_total := nights_count * COALESCE(NEW.room_price_per_night, 0) * rooms_needed;
    
    -- Calculate flight total (price per person * number of participants)
    NEW.flight_total := COALESCE(NEW.flight_price, 0) * NEW.num_participants;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for group totals
DROP TRIGGER IF EXISTS calculate_group_totals_trigger ON public.pasantias_quote_groups;
CREATE TRIGGER calculate_group_totals_trigger
    BEFORE INSERT OR UPDATE ON public.pasantias_quote_groups
    FOR EACH ROW
    EXECUTE FUNCTION calculate_group_totals();

-- Main quote calculation function with proper room calculation
CREATE OR REPLACE FUNCTION calculate_quote_totals_with_discount()
RETURNS TRIGGER AS $$
DECLARE
    programs_cost_per_person DECIMAL(10,2);
    accommodation_cost_per_person DECIMAL(10,2);
    room_price DECIMAL(10,2);
    discount_per_person DECIMAL(10,2) := 0;
    nights_count INTEGER;
    rooms_needed DECIMAL(10,2);
BEGIN
    -- Skip calculation if using groups system
    IF NEW.use_groups = true THEN
        RETURN NEW;
    END IF;
    
    -- Only calculate if we have the necessary fields
    IF NEW.arrival_date IS NOT NULL AND NEW.departure_date IS NOT NULL THEN
        -- Calculate nights
        nights_count := NEW.departure_date - NEW.arrival_date;
        
        -- Calculate program costs per person
        SELECT COALESCE(SUM(price), 0) INTO programs_cost_per_person
        FROM public.pasantias_programs
        WHERE id = ANY(NEW.selected_programs)
        AND is_active = true;
        
        -- Store original program total (for all participants)
        NEW.original_program_total := programs_cost_per_person * COALESCE(NEW.num_pasantes, 1);
        
        -- Apply early bird discount if enabled ($500,000 CLP discount per program per person)
        IF NEW.apply_early_bird_discount = true THEN
            -- Calculate discount per person (number of programs * 500000)
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
        
        -- Get the appropriate room price and calculate rooms needed
        IF NEW.room_type = 'single' THEN
            room_price := NEW.single_room_price;
            rooms_needed := NEW.num_pasantes;  -- One room per person
            accommodation_cost_per_person := nights_count * room_price;  -- Full room cost per person
        ELSE
            room_price := NEW.double_room_price;
            rooms_needed := CEIL(NEW.num_pasantes::numeric / 2);  -- Two people per room
            -- CRITICAL: Accommodation per person is room cost divided by 2 for double occupancy
            accommodation_cost_per_person := nights_count * room_price / 2;
        END IF;
        
        -- Calculate accommodation total based on number of rooms
        NEW.accommodation_total := nights_count * room_price * rooms_needed;
        
        -- Update totals
        NEW.program_total := programs_cost_per_person * COALESCE(NEW.num_pasantes, 1);
        NEW.total_per_person := COALESCE(NEW.flight_price, 0) + accommodation_cost_per_person + programs_cost_per_person;
        NEW.grand_total := NEW.total_per_person * COALESCE(NEW.num_pasantes, 1);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS calculate_pasantias_quote_totals ON public.pasantias_quotes;
DROP TRIGGER IF EXISTS calculate_pasantias_quote_totals_with_discount ON public.pasantias_quotes;
CREATE TRIGGER calculate_pasantias_quote_totals_with_discount
    BEFORE INSERT OR UPDATE ON public.pasantias_quotes
    FOR EACH ROW
    EXECUTE FUNCTION calculate_quote_totals_with_discount();

-- Groups calculation with proper accommodation handling
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
        
        -- Get totals from groups (already calculated correctly by trigger)
        SELECT 
            COALESCE(SUM(accommodation_total), 0),
            COALESCE(SUM(flight_total), 0),
            COALESCE(SUM(num_participants), 0)
        INTO groups_accommodation_total, groups_flight_total, total_participants
        FROM public.pasantias_quote_groups
        WHERE quote_id = NEW.id;
        
        -- Store original program total
        NEW.original_program_total := programs_cost_per_person * GREATEST(total_participants, 1);
        
        -- Apply early bird discount if enabled
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

-- Drop and recreate groups trigger
DROP TRIGGER IF EXISTS calculate_quote_totals_with_groups_trigger ON public.pasantias_quotes;
DROP TRIGGER IF EXISTS calculate_quote_totals_with_groups_and_discount_trigger ON public.pasantias_quotes;
CREATE TRIGGER calculate_quote_totals_with_groups_and_discount_trigger
    BEFORE INSERT OR UPDATE ON public.pasantias_quotes
    FOR EACH ROW
    WHEN (NEW.use_groups = true)
    EXECUTE FUNCTION calculate_quote_totals_with_groups_and_discount();

-- Force recalculation of all existing quotes
UPDATE public.pasantias_quotes 
SET updated_at = NOW();

-- Recalculate all groups
UPDATE public.pasantias_quote_groups 
SET updated_at = NOW();