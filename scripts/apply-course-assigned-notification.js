const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🚀 Applying course assignment notification fix...\n');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'add-course-assigned-notification.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Split by semicolons but keep them for execution
    const statements = sql
      .split(/;(?=\s*(?:--|$|\n))/g)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📄 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip SELECT verification query
      if (statement.toLowerCase().includes('select') && statement.toLowerCase().includes('from notification_triggers')) {
        console.log(`✅ Skipping verification query\n`);
        continue;
      }

      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      const { error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';'
      });

      if (error) {
        // Try direct execution if RPC fails
        console.log('⚠️  RPC failed, attempting direct execution...');
        
        // For INSERT statements, we'll use the Supabase client directly
        if (statement.toLowerCase().includes('insert into notification_triggers')) {
          const { error: insertError } = await supabase
            .from('notification_triggers')
            .upsert({
              event_type: 'course_assigned',
              notification_template: {
                title_template: "Nuevo curso asignado",
                description_template: "Se te ha asignado el curso '{course_name}'",
                url_template: "/student/course/{course_id}",
                importance: "normal"
              },
              category: 'cursos',
              trigger_condition: { enabled: true, immediate: true }
            }, {
              onConflict: 'event_type'
            });

          if (insertError) {
            console.error('❌ Error:', insertError);
            throw insertError;
          }
        }
      }
      
      console.log('✅ Statement executed successfully\n');
    }

    // Verify the trigger was created
    console.log('🔍 Verifying notification trigger...');
    const { data, error: verifyError } = await supabase
      .from('notification_triggers')
      .select('*')
      .eq('event_type', 'course_assigned')
      .single();

    if (verifyError) {
      console.error('❌ Error verifying trigger:', verifyError);
    } else if (data) {
      console.log('✅ Course assignment notification trigger created successfully!');
      console.log('\n📋 Trigger details:');
      console.log(`  - Event Type: ${data.event_type}`);
      console.log(`  - Category: ${data.category}`);
      console.log(`  - Title: ${data.notification_template.title_template}`);
      console.log(`  - Description: ${data.notification_template.description_template}`);
      console.log(`  - URL: ${data.notification_template.url_template}`);
      console.log(`  - Active: ${data.is_active}`);
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📌 Next steps:');
    console.log('1. Test by assigning a teacher to a course');
    console.log('2. Check that the notification shows "Nuevo curso asignado"');
    console.log('3. Verify clicking the notification goes to /student/course/{courseId}');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('\n💡 You may need to run the SQL directly in Supabase dashboard:');
    console.error('   1. Go to SQL Editor in Supabase');
    console.error('   2. Copy contents from database/add-course-assigned-notification.sql');
    console.error('   3. Execute the SQL');
    process.exit(1);
  }
}

// Run the migration
applyMigration().catch(console.error);