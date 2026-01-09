import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch from the instructors table as specified
    const { data: instructors, error } = await supabaseAdmin
      .from('instructors')
      .select('id, full_name')
      .order('full_name');

    if (error) throw error;

    res.status(200).json(instructors || []);
  } catch (error: any) {
    console.error('Error fetching instructors:', error);
    res.status(500).json({ error: 'Failed to fetch instructors' });
  }
}