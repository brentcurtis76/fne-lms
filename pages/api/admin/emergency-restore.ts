import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const targetEmail = 'brent@perrotuertocm.cl';

        // 1. Get User ID
        // We can't query auth.users directly easily with just the client usually, 
        // but we can try to find them in the profiles table first to get the ID
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', targetEmail)
            .single();

        if (profileError || !profile) {
            return res.status(404).json({ error: 'User profile not found', details: profileError });
        }

        const userId = profile.id;

        // 2. Check for existing admin role (active or inactive)
        const { data: existingRoles, error: roleError } = await supabase
            .from('user_roles')
            .select('*')
            .eq('user_id', userId)
            .eq('role_type', 'admin');

        if (roleError) {
            return res.status(500).json({ error: 'Error checking roles', details: roleError });
        }

        let result;

        if (existingRoles && existingRoles.length > 0) {
            // Reactivate the first found role
            const roleToActivate = existingRoles[0];
            const { data, error } = await supabase
                .from('user_roles')
                .update({ is_active: true, assigned_at: new Date().toISOString() })
                .eq('id', roleToActivate.id)
                .select()
                .single();

            if (error) throw error;
            result = { action: 'reactivated', role: data, count: existingRoles.length };
        } else {
            // Create new role
            const { data, error } = await supabase
                .from('user_roles')
                .insert({
                    user_id: userId,
                    role_type: 'admin',
                    is_active: true,
                    assigned_at: new Date().toISOString(),
                    assigned_by: userId // Assigned by self (emergency)
                })
                .select()
                .single();

            if (error) throw error;
            result = { action: 'created', role: data };
        }

        return res.status(200).json({
            success: true,
            message: `Admin access restored for ${targetEmail}`,
            result
        });

    } catch (error: any) {
        console.error('Emergency restore failed:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
}
