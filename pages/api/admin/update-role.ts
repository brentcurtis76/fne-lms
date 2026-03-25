import { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdmin, createServiceRoleClient } from '@/lib/api-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!isAdmin) {
    return res.status(403).json({ error: 'Solo administradores pueden cambiar roles' });
  }

  const supabaseAdmin = createServiceRoleClient();

  try {
    const { userId, newRole } = req.body;

    if (!userId || !newRole) {
      return res.status(400).json({ error: 'User ID and new role are required' });
    }

    if (!['admin', 'docente'].includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role. Must be "admin" or "docente"' });
    }

    console.log('Updating role for user:', userId, 'to:', newRole);

    // Update the user's role in profiles table
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)
      .select('id, email, role');

    if (error) {
      console.error('Error updating role:', error);
      return res.status(500).json({ error: `Failed to update role: ${error.message}` });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('Role update successful:', data[0]);

    return res.status(200).json({ 
      success: true,
      message: `Role updated to ${newRole}`,
      user: data[0]
    });

  } catch (error: any) {
    console.error('Update role error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}