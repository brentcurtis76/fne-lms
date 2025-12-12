import { createClient } from '@supabase/supabase-js';

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables');
    process.exit(1);
}

async function checkUserProfile() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const targetEmail = 'brent@perrotuertocm.cl';

    console.log(`Checking profile for: ${targetEmail}`);

    const { data: profile, error } = await supabase
        .from('profiles')
        .select(`
      *,
      school:schools(id, name)
    `)
        .eq('email', targetEmail)
        .single();

    if (error) {
        console.error('Error fetching profile:', error);
        return;
    }

    console.log('User Profile:', JSON.stringify(profile, null, 2));
}

checkUserProfile();
