const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key
const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function activateJorgeAdmin() {
  console.log("========================================");
  console.log("Activating Jorge's Platform-Wide Admin Role");
  console.log("========================================\n");

  try {
    // Step 1: Get user IDs
    console.log("Step 1: Getting user IDs...");

    // Get Jorge's ID
    const { data: jorgeUser, error: jorgeError } = await supabase
      .auth.admin.listUsers();
    
    if (jorgeError) {
      console.error("Error listing users:", jorgeError);
      return;
    }

    const jorge = jorgeUser.users.find(u => u.email === 'jorge@lospellines.cl');
    const brent = jorgeUser.users.find(u => u.email === 'brent@perrotuertocm.cl');

    if (!jorge) {
      console.error("Jorge's user not found!");
      return;
    }

    if (!brent) {
      console.error("Brent's user not found!");
      return;
    }

    console.log("✓ Jorge's user ID:", jorge.id);
    console.log("✓ Brent's user ID:", brent.id);

    // Step 2: Check current admin role status
    console.log("\nStep 2: Checking current admin role status...");
    
    const { data: currentRole, error: currentError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', jorge.id)
      .eq('role_type', 'admin')
      .is('school_id', null)
      .is('community_id', null)
      .single();

    if (currentError && currentError.code !== 'PGRST116') {
      console.error("Error checking current role:", currentError);
      return;
    }

    if (currentRole) {
      console.log("\nCurrent admin role found:");
      console.log("- Role ID:", currentRole.id);
      console.log("- Is Active:", currentRole.is_active);
      console.log("- Assigned By:", currentRole.assigned_by);
      console.log("- Created At:", currentRole.created_at);
    } else {
      console.log("\n❌ No platform-wide admin role found for Jorge!");
      return;
    }

    // Step 3: Activate the admin role
    console.log("\nStep 3: Activating Jorge's platform-wide admin role...");

    const { data: updateData, error: updateError } = await supabase
      .from('user_roles')
      .update({ 
        is_active: true, 
        assigned_by: brent.id 
      })
      .eq('user_id', jorge.id)
      .eq('role_type', 'admin')
      .is('school_id', null)
      .is('community_id', null)
      .select();

    if (updateError) {
      console.error("Error updating role:", updateError);
      return;
    }

    console.log("\n✅ Admin role successfully activated!");
    console.log("Updated role data:", JSON.stringify(updateData, null, 2));

    // Step 4: Verify the update
    console.log("\nStep 4: Verifying the update...");

    const { data: verifyData, error: verifyError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', jorge.id)
      .eq('role_type', 'admin')
      .is('school_id', null)
      .single();

    if (verifyError) {
      console.error("Error verifying update:", verifyError);
      return;
    }

    console.log("\n✅ Verification successful!");
    console.log("Final admin role status:");
    console.log("- Role ID:", verifyData.id);
    console.log("- User ID:", verifyData.user_id);
    console.log("- Role Type:", verifyData.role_type);
    console.log("- Is Active:", verifyData.is_active);
    console.log("- Assigned By:", verifyData.assigned_by);
    console.log("- School ID:", verifyData.school_id);
    console.log("- Community ID:", verifyData.community_id);
    console.log("- Created At:", verifyData.created_at);

    console.log("\n========================================");
    console.log("✅ Jorge's platform-wide admin role is now ACTIVE!");
    console.log("========================================");

  } catch (error) {
    console.error("Unexpected error:", error);
  }
}

// Run the activation
activateJorgeAdmin();