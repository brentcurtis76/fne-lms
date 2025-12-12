import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables');
    process.exit(1);
}

async function checkUserRoles() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const targetEmail = 'brent@perrotuertocm.cl';

    console.log(`Checking roles for: ${targetEmail}`);

    const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', targetEmail)
        .single();

    if (!profile) {
        console.error('User not found');
        return;
    }

    const { data: roles } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', profile.id);

    console.log('User Roles:', JSON.stringify(roles, null, 2));
}

checkUserRoles();
