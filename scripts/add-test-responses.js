const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseKey);

const assessmentId = '43a5b3ee-5a0a-45bf-9cde-4f652330e964';

async function addTestResponses() {
  console.log('📝 Adding test responses for Objective 4...');

  // Get rubric items for Objective 4
  const { data: rubricItems, error: rubricError } = await supabase
    .from('transformation_rubric')
    .select('*')
    .eq('area', 'personalizacion')
    .eq('objective_number', 4)
    .order('display_order');

  if (rubricError || !rubricItems) {
    console.error('❌ Error loading rubric:', rubricError);
    process.exit(1);
  }

  console.log(`✅ Found ${rubricItems.length} rubric items for Objective 4`);

  // Create mock responses (using UUID keys)
  const responses = {};
  rubricItems.forEach((item, index) => {
    responses[item.id] = {
      rubricItemId: item.id,
      response: `Test response for ${item.dimension} - This is a mock response to test the evaluation system. We have implemented this across 160 students in grades 5 and 6, with activities occurring monthly.`,
      suggestedLevel: null,
      confirmedLevel: null,
      lastUpdated: new Date().toISOString()
    };
  });

  console.log(`✅ Created ${Object.keys(responses).length} test responses`);

  // Update assessment with responses
  const { error: updateError } = await supabase
    .from('transformation_assessments')
    .update({
      context_metadata: {
        responses: responses,
        objective_evaluations: {}
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', assessmentId);

  if (updateError) {
    console.error('❌ Error updating assessment:', updateError);
    process.exit(1);
  }

  console.log('✅ Test responses added to assessment');
  console.log('Ready to test evaluation!');
}

addTestResponses();
