import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the user's session using the auth helper
    const supabaseClient = createServerSupabaseClient({ req, res });
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    
    if (sessionError || !session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentUserId = session.user.id;

    // Create service role client to bypass RLS
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Check if the current user is an admin using service role
    const { data: adminCheck, error: adminError } = await supabaseService
      .from('user_roles')
      .select('id')
      .eq('user_id', currentUserId)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1);

    if (adminError || !adminCheck || adminCheck.length === 0) {
      return res.status(403).json({ error: 'Solo administradores pueden remover roles' });
    }

    // Extract role ID from request body
    const { roleId } = req.body;

    // Validate required fields
    if (!roleId) {
      return res.status(400).json({ error: 'roleId is required' });
    }

    // Deactivate the role (soft delete)
    const { data: roleData, error: roleError } = await supabaseService
      .from('user_roles')
      .update({ is_active: false })
      .eq('id', roleId)
      .select()
      .single();

    if (roleError) {
      console.error('Error removing role:', roleError);
      return res.status(500).json({ error: 'Error al remover rol' });
    }

    // Return success
    return res.status(200).json({
      success: true,
      role: roleData
    });

  } catch (error) {
    console.error('Unexpected error in remove-role API:', error);
    return res.status(500).json({ error: 'Error inesperado al remover rol' });
  }
}