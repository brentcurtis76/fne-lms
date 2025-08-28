const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyQuoteNumbersMigration() {
  console.log('Adding quote numbers to pasantias_quotes table...');

  try {
    // Create sequence for quote numbers
    const { error: seqError } = await supabase.rpc('execute_sql', {
      query: `
        CREATE SEQUENCE IF NOT EXISTS pasantias_quote_number_seq
        START WITH 1001
        INCREMENT BY 1
        NO MAXVALUE
        NO CYCLE;
      `
    });

    if (seqError) {
      console.log('Note: Sequence might already exist or was created.');
    }

    // Add quote_number column
    const { error: colError } = await supabase.rpc('execute_sql', {
      query: `
        ALTER TABLE public.pasantias_quotes 
        ADD COLUMN IF NOT EXISTS quote_number INTEGER UNIQUE;
      `
    });

    if (colError) {
      console.log('Note: Column might already exist.');
    }

    // Set quote numbers for existing quotes
    const { error: updateError } = await supabase.rpc('execute_sql', {
      query: `
        UPDATE public.pasantias_quotes 
        SET quote_number = nextval('pasantias_quote_number_seq')
        WHERE quote_number IS NULL;
      `
    });

    if (updateError) {
      console.error('Error updating quote numbers:', updateError);
    }

    // Make quote_number NOT NULL
    const { error: notNullError } = await supabase.rpc('execute_sql', {
      query: `
        ALTER TABLE public.pasantias_quotes 
        ALTER COLUMN quote_number SET NOT NULL;
      `
    });

    if (notNullError) {
      console.log('Note: Column might already be NOT NULL.');
    }

    // Set default value for new quotes
    const { error: defaultError } = await supabase.rpc('execute_sql', {
      query: `
        ALTER TABLE public.pasantias_quotes 
        ALTER COLUMN quote_number SET DEFAULT nextval('pasantias_quote_number_seq');
      `
    });

    if (defaultError) {
      console.log('Note: Default might already be set.');
    }

    // Create index
    const { error: indexError } = await supabase.rpc('execute_sql', {
      query: `
        CREATE INDEX IF NOT EXISTS idx_pasantias_quotes_number 
        ON public.pasantias_quotes(quote_number);
      `
    });

    if (indexError) {
      console.log('Note: Index might already exist.');
    }

    // Check if it worked
    const { data: quotes, error: checkError } = await supabase
      .from('pasantias_quotes')
      .select('id, quote_number, client_name')
      .order('quote_number', { ascending: true })
      .limit(5);

    if (checkError) {
      console.error('Error checking quotes:', checkError);
    } else {
      console.log('\n✅ Quote numbers successfully added!');
      console.log('\nSample quotes with numbers:');
      quotes.forEach(q => {
        console.log(`  #${q.quote_number} - ${q.client_name}`);
      });
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

applyQuoteNumbersMigration();