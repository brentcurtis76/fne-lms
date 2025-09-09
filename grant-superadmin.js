const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

// Read environment variables
const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.log("Missing required environment variables");
    process.exit(1);
}

async function grantSuperadmin() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const testUserId = 'c30a8484-8709-412a-8840-90e5fe94e7c8';
    const testEmail = 'carlcurtispp1976@gmail.com';
    
    console.log(`\n=== Granting superadmin to ${testEmail} ===`);
    console.log(`User ID: ${testUserId}`);
    
    try {
        // Insert or update superadmin record
        const { data, error } = await supabase
            .from('superadmins')
            .upsert({
                user_id: testUserId,
                granted_by: testUserId,
                reason: 'Local RBAC Phase 2 test grant',
                is_active: true,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            })
            .select();
        
        if (error) {
            console.log(`\nError granting superadmin: ${error.message}`);
            console.log('Full error:', JSON.stringify(error, null, 2));
        } else {
            console.log(`\n✅ Superadmin grant successful:`, JSON.stringify(data, null, 2));
        }
        
        // Verify the grant worked
        const { data: verifyData, error: verifyError } = await supabase
            .rpc('auth_is_superadmin', { check_user_id: testUserId });
        
        if (verifyError) {
            console.log(`\nVerification error: ${verifyError.message}`);
        } else {
            console.log(`\nVerification: User is now superadmin = ${verifyData}`);
        }
        
    } catch (err) {
        console.error('Error:', err);
    }
}

grantSuperadmin().catch(console.error);
