-- Update existing quotes to use November 30, 2025 early bird deadline
-- AND update Programa para Líderes Pedagógicos brochure URL
-- This migration updates all quotes that currently have the September 30, 2025 deadline

-- Update all quotes with the old early bird date to the new date
UPDATE public.pasantias_quotes
SET early_bird_payment_date = '2025-11-30'
WHERE early_bird_payment_date = '2025-09-30';

-- Also update quotes that have early bird discount enabled but no date set
UPDATE public.pasantias_quotes
SET early_bird_payment_date = '2025-11-30'
WHERE apply_early_bird_discount = true
  AND early_bird_payment_date IS NULL;

-- Update program descriptions to reflect the new deadline
UPDATE public.pasantias_programs
SET description = REPLACE(description, '30 de septiembre de 2025', '30 de noviembre de 2025')
WHERE description LIKE '%30 de septiembre de 2025%';

-- Update the PDF URL for "Programa para Líderes Pedagógicos" to the new brochure
UPDATE public.pasantias_programs
SET pdf_url = 'https://heyzine.com/flip-book/fb8cf2cfb1.html',
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'Programa para Líderes Pedagógicos';

-- Log the updates
DO $$
DECLARE
  updated_quotes_count INTEGER;
  updated_programs_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_quotes_count
  FROM public.pasantias_quotes
  WHERE early_bird_payment_date = '2025-11-30';

  SELECT COUNT(*) INTO updated_programs_count
  FROM public.pasantias_programs
  WHERE pdf_url = 'https://heyzine.com/flip-book/fb8cf2cfb1.html';

  RAISE NOTICE 'Updated % quotes with new early bird deadline', updated_quotes_count;
  RAISE NOTICE 'Updated % programs with new PDF URL', updated_programs_count;
END $$;
