-- Add viáticos (per diem) fields to pasantias_quotes table
-- Viáticos can be either daily or total amount per participant
-- Amounts are stored in Chilean Pesos (CLP)

BEGIN;

-- Add viáticos fields to pasantias_quotes table
ALTER TABLE public.pasantias_quotes
ADD COLUMN IF NOT EXISTS viaticos_type TEXT CHECK (viaticos_type IN ('daily', 'total', NULL)),
ADD COLUMN IF NOT EXISTS viaticos_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS viaticos_total DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS viaticos_display_amount DECIMAL(10,2) DEFAULT 0;

-- Add comments to explain the fields
COMMENT ON COLUMN public.pasantias_quotes.viaticos_type IS 'Type of viáticos calculation: daily (per day) or total (lump sum) per participant';
COMMENT ON COLUMN public.pasantias_quotes.viaticos_amount IS 'Base viáticos amount (before 15% surcharge) in CLP - either daily rate or total amount depending on viaticos_type';
COMMENT ON COLUMN public.pasantias_quotes.viaticos_total IS 'Total viáticos for all participants (calculated field)';
COMMENT ON COLUMN public.pasantias_quotes.viaticos_display_amount IS 'Amount to display in client proposal (includes 15% surcharge) in CLP';

-- Update or create trigger to calculate viáticos totals
CREATE OR REPLACE FUNCTION calculate_viaticos_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate viáticos total based on type
    IF NEW.viaticos_type = 'daily' AND NEW.viaticos_amount > 0 THEN
        -- Daily rate: multiply by number of days (nights + 1) and participants
        NEW.viaticos_total := NEW.viaticos_amount * (COALESCE(NEW.nights, 0) + 1) * NEW.num_pasantes;
    ELSIF NEW.viaticos_type = 'total' AND NEW.viaticos_amount > 0 THEN
        -- Total amount per participant: multiply by number of participants
        NEW.viaticos_total := NEW.viaticos_amount * NEW.num_pasantes;
    ELSE
        NEW.viaticos_total := 0;
    END IF;
    
    -- Calculate display amount with 15% surcharge (not itemized)
    IF NEW.viaticos_total > 0 THEN
        NEW.viaticos_display_amount := NEW.viaticos_total * 1.15;
    ELSE
        NEW.viaticos_display_amount := 0;
    END IF;
    
    -- Update grand total to include viáticos display amount
    -- Note: We add the display amount (with surcharge) to the grand total
    NEW.grand_total := COALESCE(NEW.accommodation_total, 0) + 
                       COALESCE(NEW.program_total, 0) + 
                       COALESCE(NEW.flight_price * NEW.num_pasantes, 0) +
                       COALESCE(NEW.viaticos_display_amount, 0);
    
    -- Recalculate total per person
    IF NEW.num_pasantes > 0 THEN
        NEW.total_per_person := NEW.grand_total / NEW.num_pasantes;
    ELSE
        NEW.total_per_person := 0;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS calculate_viaticos_totals_trigger ON public.pasantias_quotes;

-- Create trigger to calculate viáticos totals
CREATE TRIGGER calculate_viaticos_totals_trigger
    BEFORE INSERT OR UPDATE ON public.pasantias_quotes
    FOR EACH ROW
    EXECUTE FUNCTION calculate_viaticos_totals();

-- Also add viáticos fields to pasantias_quote_groups table for group-based quotes
ALTER TABLE public.pasantias_quote_groups
ADD COLUMN IF NOT EXISTS viaticos_type TEXT CHECK (viaticos_type IN ('daily', 'total', NULL)),
ADD COLUMN IF NOT EXISTS viaticos_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS viaticos_total DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS viaticos_display_amount DECIMAL(10,2) DEFAULT 0;

-- Add comments for group table
COMMENT ON COLUMN public.pasantias_quote_groups.viaticos_type IS 'Type of viáticos calculation for this group: daily (per day) or total (lump sum) per participant';
COMMENT ON COLUMN public.pasantias_quote_groups.viaticos_amount IS 'Base viáticos amount for this group (before 15% surcharge) in CLP';
COMMENT ON COLUMN public.pasantias_quote_groups.viaticos_total IS 'Total viáticos for this group (calculated field)';
COMMENT ON COLUMN public.pasantias_quote_groups.viaticos_display_amount IS 'Amount to display for this group (includes 15% surcharge) in CLP';

COMMIT;