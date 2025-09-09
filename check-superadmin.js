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

async function checkSuperadmin() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Known test user from session handoff
    const testUserId = 'c30a8484-8709-412a-8840-90e5fe94e7c8';
    const testEmail = 'carlcurtispp1976@gmail.com';
    
    console.log(`\n=== Checking superadmin for ${testEmail} ===`);
    console.log(`User ID: ${testUserId}`);
    
    try {
        // Check superadmin status using RPC
        const { data, error } = await supabase.rpc('auth_is_superadmin', { 
            check_user_id: testUserId 
        });
        
        if (error) {
            console.log(`\nRPC auth_is_superadmin error: ${error.message}`);
            
            // Try direct table check
            const { data: superadmins, error: tableError } = await supabase
                .from('superadmins')
                .select('*')
                .eq('user_id', testUserId);
                
            if (tableError) {
                console.log(`Direct table check error: ${tableError.message}`);
            } else {
                console.log(`\nSuperadmins table records:`, JSON.stringify(superadmins, null, 2));
            }
        } else {
            console.log(`\nSuperadmin status from RPC: ${data}`);
            
            if (!data) {
                console.log('\n⚠️ User is NOT a superadmin. Grant needed for testing.');
            } else {
                console.log('\n✅ User IS a superadmin.');
            }
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

checkSuperadmin().catch(console.error);
