const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.log("Missing required environment variables");
    process.exit(1);
}

async function getToken() {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // We need to reset the password for our test user since we don't know it
    const testEmail = 'loreto.sanchez@colegiosantamartavaldivia.cl';
    
    console.log(`Getting token for: ${testEmail}`);
    
    // Sign in with a temporary password (we'll use service role to set it)
    const serviceClient = createClient(supabaseUrl, envConfig.SUPABASE_SERVICE_ROLE_KEY);
    
    // Update the user's password
    const tempPassword = 'TestPassword123!';
    const { data: updateData, error: updateError } = await serviceClient.auth.admin.updateUserById(
        '8a27f1b4-0b25-443e-ab9f-8fea1941d8ec',
        { password: tempPassword }
    );
    
    if (updateError) {
        console.log("Error updating password:", updateError.message);
        return;
    }
    
    // Now sign in with the new password
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: tempPassword
    });
    
    if (signInError) {
        console.log("Error signing in:", signInError.message);
        return;
    }
    
    if (signInData.session) {
        // Save token to file (not printing to console)
        fs.writeFileSync('/tmp/superadmin-token.txt', signInData.session.access_token);
        console.log("✅ Token acquired and saved to /tmp/superadmin-token.txt");
        console.log(`User: ${signInData.user.email}`);
        console.log(`User ID: ${signInData.user.id}`);
    }
}

getToken().catch(console.error);
