const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeNotificationCreation() {
  console.log('\n🔍 ANALYZING NOTIFICATION CREATION PATTERNS\n');
  
  try {
    // 1. Check notification_events table for recent events
    console.log('📊 RECENT NOTIFICATION EVENTS:');
    console.log('='.repeat(50));
    
    const { data: events, error: eventsError } = await supabase
      .from('notification_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
      
    if (eventsError) {
      console.log('⚠️  notification_events table not found or error:', eventsError.message);
    } else if (events && events.length > 0) {
      console.log(`Found ${events.length} recent events:`);
      events.forEach((event, idx) => {
        console.log(`\n${idx + 1}. Event Type: ${event.event_type}`);
        console.log(`   Created: ${event.created_at}`);
        console.log(`   Status: ${event.status}`);
        console.log(`   Notifications Created: ${event.notifications_count || 0}`);
        if (event.event_data) {
          console.log(`   Event Data: ${JSON.stringify(event.event_data, null, 2)}`);
        }
      });
    } else {
      console.log('No events found in notification_events table');
    }
    
    // 2. Check notification_templates
    console.log('\n\n📝 ACTIVE NOTIFICATION TEMPLATES:');
    console.log('='.repeat(50));
    
    const { data: templates, error: templatesError } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('is_active', true);
      
    if (templatesError) {
      console.log('⚠️  notification_templates table not found or error:', templatesError.message);
    } else if (templates && templates.length > 0) {
      console.log(`Found ${templates.length} active templates:`);
      templates.forEach((template, idx) => {
        console.log(`\n${idx + 1}. Template: ${template.name}`);
        console.log(`   Event Type: ${template.event_type}`);
        console.log(`   Title: ${template.title_template}`);
        console.log(`   URL: ${template.url_template || 'NULL'}`);
      });
    } else {
      console.log('No active templates found');
    }
    
    // 3. Check notification_triggers
    console.log('\n\n🎯 ACTIVE NOTIFICATION TRIGGERS:');
    console.log('='.repeat(50));
    
    const { data: triggers, error: triggersError } = await supabase
      .from('notification_triggers')
      .select('*')
      .eq('is_active', true);
      
    if (triggersError) {
      console.log('⚠️  notification_triggers table not found or error:', triggersError.message);
    } else if (triggers && triggers.length > 0) {
      console.log(`Found ${triggers.length} active triggers:`);
      triggers.forEach((trigger, idx) => {
        console.log(`\n${idx + 1}. Trigger ID: ${trigger.trigger_id}`);
        console.log(`   Event Type: ${trigger.event_type}`);
        console.log(`   Template ID: ${trigger.template_id}`);
        console.log(`   Target Type: ${trigger.target_type}`);
      });
    } else {
      console.log('No active triggers found');
    }
    
    // 4. Analyze recent course assignment notifications specifically
    console.log('\n\n🎓 RECENT COURSE ASSIGNMENT NOTIFICATIONS:');
    console.log('='.repeat(50));
    
    const { data: courseNotifs, error: courseError } = await supabase
      .from('user_notifications')
      .select('*')
      .like('title', '%curso asignado%')
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (courseError) {
      console.error('Error fetching course notifications:', courseError);
    } else if (courseNotifs && courseNotifs.length > 0) {
      console.log(`Found ${courseNotifs.length} recent course assignment notifications:`);
      
      // Group by creation time to find batch creations
      const batches = {};
      courseNotifs.forEach(notif => {
        const timeKey = new Date(notif.created_at).toISOString().substring(0, 19); // Group by second
        if (!batches[timeKey]) batches[timeKey] = [];
        batches[timeKey].push(notif);
      });
      
      Object.entries(batches).forEach(([time, notifs]) => {
        console.log(`\n⏰ Batch at ${time}: ${notifs.length} notifications`);
        notifs.forEach(n => {
          console.log(`   - User: ${n.user_id.substring(0, 8)}... Key: ${n.idempotency_key}`);
        });
      });
    } else {
      console.log('No recent course assignment notifications found');
    }
    
    // 5. Check for any database constraints or indexes
    console.log('\n\n🔧 DATABASE CONSTRAINTS CHECK:');
    console.log('='.repeat(50));
    
    const { data: constraints, error: constraintsError } = await supabase.rpc('get_table_constraints', {
      table_name: 'user_notifications'
    }).select();
    
    if (constraintsError) {
      console.log('⚠️  Could not fetch table constraints (function may not exist)');
    } else if (constraints) {
      console.log('Table constraints:', JSON.stringify(constraints, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

async function main() {
  await analyzeNotificationCreation();
}

main();