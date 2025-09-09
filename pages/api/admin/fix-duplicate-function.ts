import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    // Verify the user is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authorization token' });
    }

    // Check if user is admin
    const { data: userRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('role_type', 'admin');

    if (!userRoles || userRoles.length === 0) {
      return res.status(403).json({ error: 'Unauthorized. Only admins can access this.' });
    }

    // The problem is we can't execute DDL (CREATE FUNCTION) via Supabase client
    // So instead, let's return instructions for manual fix
    
    const sqlToRun = `-- Fix duplicate users in get_all_auth_users function
DROP FUNCTION IF EXISTS get_all_auth_users();

CREATE OR REPLACE FUNCTION get_all_auth_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  email_confirmed_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  first_name TEXT,
  last_name TEXT,
  school_id INTEGER,
  school_name TEXT,
  approval_status TEXT,
  role_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (au.id)
    au.id,
    au.email::TEXT,
    au.created_at,
    au.email_confirmed_at,
    au.last_sign_in_at,
    p.first_name::TEXT,
    p.last_name::TEXT,
    p.school_id,
    s.name::TEXT as school_name,
    p.approval_status::TEXT,
    COALESCE(
      (SELECT ur.role_type::TEXT 
       FROM public.user_roles ur 
       WHERE ur.user_id = au.id 
       LIMIT 1),
      NULL
    ) as role_type
  FROM auth.users au
  LEFT JOIN public.profiles p ON au.id = p.id
  LEFT JOIN public.schools s ON p.school_id = s.id
  WHERE au.deleted_at IS NULL
  ORDER BY au.id, au.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_auth_users() TO authenticated;`;

    return res.status(200).json({
      message: 'Manual SQL execution required',
      instructions: 'Please run the following SQL in Supabase SQL Editor',
      supabaseUrl: 'https://sxlogxqzmarhqsblxmtj.supabase.co/project/sxlogxqzmarhqsblxmtj/sql/new',
      sql: sqlToRun
    });

  } catch (error: any) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to generate fix'
    });
  }
}