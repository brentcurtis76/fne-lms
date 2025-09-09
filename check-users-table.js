const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.log("Missing required environment variables");
    process.exit(1);
}

async function checkUsers() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log("\n=== Checking users table structure ===");
    
    // Check if user exists in public.users
    const { data: publicUser, error: publicError } = await supabase
        .from('users')
        .select('*')
        .eq('id', 'c30a8484-8709-412a-8840-90e5fe94e7c8')
        .single();
        
    if (publicError) {
        console.log("User not found in public.users table");
        console.log("Need to create user in public.users first");
        
        // Get user details from auth.users via service role
        const { data: authData, error: authError } = await supabase.auth.admin.getUserById(
            'c30a8484-8709-412a-8840-90e5fe94e7c8'
        );
        
        if (authError) {
            console.log("Error getting auth user:", authError.message);
        } else if (authData && authData.user) {
            console.log("\nFound in auth.users:", {
                id: authData.user.id,
                email: authData.user.email
            });
            
            // Create user in public.users
            const { data: createData, error: createError } = await supabase
                .from('users')
                .insert({
                    id: authData.user.id,
                    email: authData.user.email,
                    full_name: authData.user.user_metadata?.full_name || 'Test Superadmin'
                })
                .select();
                
            if (createError) {
                console.log("\nError creating public.users record:", createError.message);
            } else {
                console.log("\n✅ Created public.users record:", createData);
            }
        }
    } else {
        console.log("User found in public.users:", publicUser);
    }
}

checkUsers().catch(console.error);
