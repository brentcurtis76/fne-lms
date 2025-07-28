/**
 * Script to check if notification triggers exist for user_mentioned events
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Using Supabase URL:', supabaseUrl);
console.log('Service key exists:', !!supabaseServiceKey);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkNotificationTriggers() {
  console.log('🔍 Checking notification trigger configuration...');
  
  try {
    // Check notification_types table
    console.log('\n1. Checking notification_types for user_mentioned...');
    const { data: types, error: typesError } = await supabase
      .from('notification_types')
      .select('*')
      .eq('event_type', 'user_mentioned');
      
    if (typesError) {
      console.error('❌ Error fetching notification types:', typesError);
    } else {
      console.log(`✅ Found ${types?.length || 0} notification types for user_mentioned:`, types);
    }
    
    // Check notification_triggers table
    console.log('\n2. Checking notification_triggers for user_mentioned...');
    const { data: triggers, error: triggersError } = await supabase
      .from('notification_triggers')
      .select('*')
      .eq('event_type', 'user_mentioned');
      
    if (triggersError) {
      console.error('❌ Error fetching notification triggers:', triggersError);
    } else {
      console.log(`✅ Found ${triggers?.length || 0} notification triggers for user_mentioned:`, triggers);
    }
    
    // Check notification_templates table
    console.log('\n3. Checking notification_templates...');
    const { data: templates, error: templatesError } = await supabase
      .from('notification_templates')
      .select('*');
      
    if (templatesError) {
      console.error('❌ Error fetching notification templates:', templatesError);
    } else {
      console.log(`✅ Found ${templates?.length || 0} notification templates:`, 
        templates?.map(t => `${t.id}: ${t.event_type} - ${t.title_template}`));
    }
    
    // Test the get_active_triggers RPC function
    console.log('\n4. Testing get_active_triggers RPC function...');
    const { data: activeTriggers, error: rpcError } = await supabase
      .rpc('get_active_triggers', { p_event_type: 'user_mentioned' });
      
    if (rpcError) {
      console.error('❌ Error calling get_active_triggers RPC:', rpcError);
    } else {
      console.log(`✅ RPC returned ${activeTriggers?.length || 0} active triggers:`, activeTriggers);
    }
    
    // Check if the RPC function exists
    console.log('\n5. Checking if get_active_triggers function exists...');
    const { data: functions, error: funcError } = await supabase
      .from('pg_proc')
      .select('proname')
      .eq('proname', 'get_active_triggers');
      
    if (funcError) {
      console.error('❌ Error checking function existence:', funcError);
    } else {
      console.log(`✅ Found ${functions?.length || 0} functions named get_active_triggers`);
    }
    
  } catch (error) {
    console.error('❌ Error in check:', error);
  }
}

// Run the check
checkNotificationTriggers();