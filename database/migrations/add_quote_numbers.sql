-- Add quote number sequence and column to pasantias_quotes table

-- Create a sequence for quote numbers
CREATE SEQUENCE IF NOT EXISTS pasantias_quote_number_seq
    START WITH 1001
    INCREMENT BY 1
    NO MAXVALUE
    NO CYCLE;

-- Add quote_number column to pasantias_quotes table
ALTER TABLE public.pasantias_quotes 
    ADD COLUMN IF NOT EXISTS quote_number INTEGER UNIQUE;

-- Set quote numbers for existing quotes
UPDATE public.pasantias_quotes 
SET quote_number = nextval('pasantias_quote_number_seq')
WHERE quote_number IS NULL;

-- Make quote_number NOT NULL after populating existing records
ALTER TABLE public.pasantias_quotes 
    ALTER COLUMN quote_number SET NOT NULL;

-- Set default value for new quotes
ALTER TABLE public.pasantias_quotes 
    ALTER COLUMN quote_number SET DEFAULT nextval('pasantias_quote_number_seq');

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pasantias_quotes_number ON public.pasantias_quotes(quote_number);