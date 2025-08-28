const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyQuoteNumbersMigration() {
  console.log('Adding quote numbers to pasantias_quotes table...');

  try {
    // First, let's check if the column exists
    const { data: existingQuotes, error: checkError } = await supabase
      .from('pasantias_quotes')
      .select('id, client_name')
      .limit(1);

    if (!checkError) {
      console.log('✅ Connected to pasantias_quotes table');
    } else {
      console.error('Error connecting:', checkError);
      return;
    }

    // Since we can't run raw SQL, we'll need to do this manually in the Supabase dashboard
    console.log('\n⚠️  MANUAL STEPS REQUIRED:');
    console.log('\nPlease run the following SQL in your Supabase SQL editor:');
    console.log('https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new\n');
    
    console.log(`-- Create sequence for quote numbers
CREATE SEQUENCE IF NOT EXISTS pasantias_quote_number_seq
    START WITH 1001
    INCREMENT BY 1
    NO MAXVALUE
    NO CYCLE;

-- Add quote_number column
ALTER TABLE public.pasantias_quotes 
    ADD COLUMN IF NOT EXISTS quote_number INTEGER UNIQUE;

-- Set quote numbers for existing quotes
UPDATE public.pasantias_quotes 
SET quote_number = nextval('pasantias_quote_number_seq')
WHERE quote_number IS NULL;

-- Make quote_number NOT NULL after populating
ALTER TABLE public.pasantias_quotes 
    ALTER COLUMN quote_number SET NOT NULL;

-- Set default value for new quotes
ALTER TABLE public.pasantias_quotes 
    ALTER COLUMN quote_number SET DEFAULT nextval('pasantias_quote_number_seq');

-- Create index
CREATE INDEX IF NOT EXISTS idx_pasantias_quotes_number 
ON public.pasantias_quotes(quote_number);
`);

    console.log('\n✅ Once you run this SQL, the quote numbers will be added to all quotes.');
    console.log('   New quotes will automatically get sequential numbers starting from 1001.');

  } catch (error) {
    console.error('Error:', error);
  }
}

applyQuoteNumbersMigration();