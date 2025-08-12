const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function setupFormTracking() {
  console.log('🔧 Setting up form submission tracking...');

  try {
    // Create the table using raw SQL
    const { error } = await supabase.rpc('execute_sql', {
      query: `
        -- Create table to track form submissions for Formspree limit monitoring
        CREATE TABLE IF NOT EXISTS form_submissions (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            submission_date TIMESTAMP WITH TIME ZONE NOT NULL,
            form_type VARCHAR(50) DEFAULT 'contact',
            recipient_email VARCHAR(255) NOT NULL,
            sender_email VARCHAR(255) NOT NULL,
            sender_name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Create index for efficient monthly queries
        CREATE INDEX IF NOT EXISTS idx_form_submissions_date 
        ON form_submissions(submission_date DESC);

        -- Create index for form type queries
        CREATE INDEX IF NOT EXISTS idx_form_submissions_type 
        ON form_submissions(form_type);

        -- Enable RLS
        ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Service role can insert form submissions" ON form_submissions;
        DROP POLICY IF EXISTS "Service role can read form submissions" ON form_submissions;
        DROP POLICY IF EXISTS "Admins can view form submissions" ON form_submissions;

        -- Create policy to allow service role to insert
        CREATE POLICY "Service role can insert form submissions" ON form_submissions
            FOR INSERT
            TO service_role
            USING (true);

        -- Create policy to allow service role to read
        CREATE POLICY "Service role can read form submissions" ON form_submissions
            FOR SELECT
            TO service_role
            USING (true);

        -- Create policy to allow authenticated users (admins) to read
        CREATE POLICY "Admins can view form submissions" ON form_submissions
            FOR SELECT
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM user_roles
                    WHERE user_roles.user_id = auth.uid()
                    AND user_roles.role_type = 'admin'
                    AND user_roles.is_active = true
                )
            );

        -- Add comment to table
        COMMENT ON TABLE form_submissions IS 'Tracks all form submissions to monitor Formspree usage limits (50/month free tier)';
      `
    });

    if (error) {
      console.error('❌ Error creating table:', error);
      return;
    }

    console.log('✅ Form submissions table created successfully');

    // Test by inserting a sample record
    const { data, error: insertError } = await supabase
      .from('form_submissions')
      .insert({
        submission_date: new Date().toISOString(),
        form_type: 'contact',
        recipient_email: 'info@nuevaeducacion.org',
        sender_email: 'test@setup.com',
        sender_name: 'Setup Test'
      })
      .select();

    if (insertError) {
      console.error('❌ Error testing insert:', insertError);
    } else {
      console.log('✅ Test record inserted successfully:', data);

      // Delete the test record
      const { error: deleteError } = await supabase
        .from('form_submissions')
        .delete()
        .eq('sender_email', 'test@setup.com');

      if (!deleteError) {
        console.log('✅ Test record cleaned up');
      }
    }

    console.log('🎉 Form tracking system is ready!');
    console.log('📊 Visit /admin/form-usage to view usage statistics');
    console.log('⚠️  You will receive an email alert when you reach 45 submissions');

  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

setupFormTracking();