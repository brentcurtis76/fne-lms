const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data, error } = await supabase
    .from('transformation_assessments')
    .select('id, status, context_metadata')
    .eq('id', '43a5b3ee-5a0a-45bf-9cde-4f652330e964')
    .single();

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log('📊 Assessment Status:', data.status);
  console.log('📊 Has evaluation?', data.context_metadata?.evaluation ? 'YES' : 'NO');
  console.log('📊 Responses count:', Object.keys(data.context_metadata?.responses || {}).length);

  if (data.context_metadata?.evaluation) {
    console.log('\n✅ Evaluation exists! You should see the visualizations.');
    console.log('Overall stage:', data.context_metadata.evaluation.overall_stage);
    console.log('Overall label:', data.context_metadata.evaluation.overall_stage_label);
  } else {
    console.log('\n⚠️ No evaluation yet. To see visualizations:');
    console.log('1. Navigate to http://localhost:3000/community/transformation/assessment?communityId=2230958d-1fd4-4bfb-ad77-83bfa043c366');
    console.log('2. Scroll down and click "Generar Reporte Final" or "Finalizar"');
    console.log('3. Wait for the AI evaluation to complete');
    console.log('4. Refresh the page to see the new visualizations');
  }
})();
