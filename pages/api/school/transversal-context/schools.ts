import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

// Service-role client to bypass RLS safely on the server
const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const sessionClient = createPagesServerClient({ req, res });
    const { data: sessionData } = await sessionClient.auth.getSession();
    const session = sessionData?.session;

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is admin or consultor
    const { data: userRoles, error: rolesError } = await serviceClient
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    if (rolesError) {
      console.error('Error fetching user roles:', rolesError);
      return res.status(500).json({ error: 'Failed to verify permissions' });
    }

    const isAdminOrConsultor = userRoles?.some(r =>
      r.role_type === 'admin' || r.role_type === 'consultor'
    );

    if (!isAdminOrConsultor) {
      return res.status(403).json({ error: 'Forbidden: Admin or Consultor access required' });
    }

    // Fetch all schools (only id and name - minimal columns)
    const { data: schools, error: schoolsError } = await serviceClient
      .from('schools')
      .select('id, name')
      .order('name', { ascending: true });

    if (schoolsError) {
      console.error('Error fetching schools:', schoolsError);
      return res.status(500).json({ error: 'Failed to fetch schools' });
    }

    return res.status(200).json({ schools: schools || [] });
  } catch (error) {
    console.error('Unexpected error in schools API:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
