const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkQuoteNumbers() {
  console.log('Checking quote numbers in database...\n');

  try {
    // Get all quotes to see what fields they have
    const { data: quotes, error } = await supabase
      .from('pasantias_quotes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error fetching quotes:', error.message);
      return;
    }

    if (!quotes || quotes.length === 0) {
      console.log('No quotes found in the database');
      return;
    }

    console.log(`Found ${quotes.length} quotes\n`);
    
    // Check if quote_number field exists
    const firstQuote = quotes[0];
    const hasQuoteNumber = 'quote_number' in firstQuote;
    
    if (!hasQuoteNumber) {
      console.log('❌ quote_number field NOT FOUND in the database!');
      console.log('\nThe migration may not have been applied correctly.');
      console.log('Please run the SQL migration in Supabase dashboard.');
      console.log('\nAvailable fields in quotes table:');
      console.log(Object.keys(firstQuote).join(', '));
    } else {
      console.log('✅ quote_number field EXISTS in the database!\n');
      console.log('Quote numbers assigned:');
      quotes.forEach(q => {
        console.log(`  #${q.quote_number || 'NULL'} - ${q.client_name} (Created: ${new Date(q.created_at).toLocaleDateString()})`);
      });
      
      // Check for any quotes without numbers
      const { data: quotesWithoutNumbers, error: countError } = await supabase
        .from('pasantias_quotes')
        .select('id')
        .is('quote_number', null);
        
      if (!countError && quotesWithoutNumbers) {
        if (quotesWithoutNumbers.length > 0) {
          console.log(`\n⚠️  Found ${quotesWithoutNumbers.length} quotes WITHOUT numbers`);
          console.log('These need to be updated with the migration.');
        } else {
          console.log('\n✅ All quotes have numbers assigned!');
        }
      }
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkQuoteNumbers();