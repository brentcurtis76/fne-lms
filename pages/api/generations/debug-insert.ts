import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { isGlobalAdmin } from '../../../utils/roleUtils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const supabase = createPagesServerClient({ req, res });

  // Check authentication
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  // Check admin
  const hasAdminAccess = await isGlobalAdmin(supabase, session.user.id);
  if (!hasAdminAccess) {
    return res.status(403).json({ error: 'Solo administradores' });
  }

  try {
    // Test 1: Try normal insert
    console.log('Test 1: Normal insert');
    const { data: test1, error: error1 } = await supabase
      .from('generations')
      .insert([{
        school_id: 25,
        name: 'Test Generation 1',
        grade_range: 'PreK-4'
      }])
      .select();

    // Test 2: Try insert without array wrapper
    console.log('Test 2: Insert without array');
    const { data: test2, error: error2 } = await supabase
      .from('generations')
      .insert({
        school_id: 25,
        name: 'Test Generation 2',
        grade_range: 'PreK-4'
      })
      .select();

    // Test 3: Try insert with explicit null ID
    console.log('Test 3: Insert with null id');
    const { data: test3, error: error3 } = await supabase
      .from('generations')
      .insert([{
        id: null,
        school_id: 25,
        name: 'Test Generation 3',
        grade_range: 'PreK-4'
      }])
      .select();

    // Test 4: Check if school exists first
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('id, name')
      .eq('id', 25)
      .single();

    return res.status(200).json({
      tests: {
        test1: { data: test1, error: error1 },
        test2: { data: test2, error: error2 },
        test3: { data: test3, error: error3 },
        school: { data: school, error: schoolError }
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}