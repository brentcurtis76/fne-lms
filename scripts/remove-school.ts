import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables');
    process.exit(1);
}

async function removeSchoolFromProfile() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const targetEmail = 'brent@perrotuertocm.cl';

    console.log(`Removing school association for: ${targetEmail}`);

    // 1. Get User ID
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', targetEmail)
        .single();

    if (profileError || !profile) {
        console.error('Error fetching profile:', profileError);
        return;
    }

    // 2. Update profile to remove school_id
    const { data, error } = await supabase
        .from('profiles')
        .update({
            school_id: null,
            school: null // Also clear legacy text field if it exists
        })
        .eq('id', profile.id)
        .select();

    if (error) {
        console.error('Error updating profile:', error);
    } else {
        console.log('Successfully removed school association:', data);
    }
}

removeSchoolFromProfile();
