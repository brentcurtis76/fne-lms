import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables');
    process.exit(1);
}

async function checkUserMetadata() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const targetEmail = 'brent@perrotuertocm.cl';

    console.log(`Checking metadata for: ${targetEmail}`);

    // We need to use the admin auth client to get user metadata
    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    const user = users.find(u => u.email === targetEmail);

    if (!user) {
        console.error('User not found');
        return;
    }

    console.log('User Metadata:', JSON.stringify(user.user_metadata, null, 2));

    // Also check user_roles table again to be sure
    const { data: roles } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id);

    console.log('New System Roles:', JSON.stringify(roles, null, 2));
}

checkUserMetadata();
