import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.error('No authorization header provided');
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      console.error('No token in authorization header');
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError) {
      console.error('Auth error:', authError.message);
      return res.status(401).json({ error: 'Invalid authentication', details: authError.message });
    }
    
    if (!user) {
      console.error('No user found for token');
      return res.status(401).json({ error: 'User not found' });
    }

    // Verify admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError.message);
      return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
    }

    if (profile?.role !== 'admin') {
      console.error('User is not admin:', profile?.role);
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Fetch consultants (users with consultor role or admins)
    const { data: consultants, error: consultantsError } = await supabase
      .from('profiles')
      .select(`
        id,
        first_name,
        last_name,
        email,
        role,
        school_id,
        generation_id,
        community_id,
        school:school_id(id, name),
        generation:generation_id(id, name),
        community:community_id(id, name)
      `)
      .in('role', ['consultor', 'admin'])
      .eq('approval_status', 'approved')
      .order('last_name', { ascending: true });

    if (consultantsError) {
      console.error('Error fetching consultants:', consultantsError);
      return res.status(500).json({ error: 'Failed to fetch consultants' });
    }

    // Fetch students/teachers (users with docente/teacher role)
    const { data: students, error: studentsError } = await supabase
      .from('profiles')
      .select(`
        id,
        first_name,
        last_name,
        email,
        role,
        school_id,
        generation_id,
        community_id,
        school:school_id(id, name),
        generation:generation_id(id, name),
        community:community_id(id, name)
      `)
      .in('role', ['docente', 'teacher'])
      .eq('approval_status', 'approved')
      .order('last_name', { ascending: true });

    if (studentsError) {
      console.error('Error fetching students:', studentsError);
      return res.status(500).json({ error: 'Failed to fetch students' });
    }

    // Fetch organizational options
    const { data: schools, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name')
      .order('name', { ascending: true });

    if (schoolsError) {
      console.error('Error fetching schools:', schoolsError);
      return res.status(500).json({ error: 'Failed to fetch schools' });
    }

    const { data: generations, error: generationsError } = await supabase
      .from('generations')
      .select(`
        id,
        name,
        grade_range,
        school_id,
        school:school_id(id, name)
      `)
      .order('name', { ascending: true });

    if (generationsError) {
      console.error('Error fetching generations:', generationsError);
      return res.status(500).json({ error: 'Failed to fetch generations' });
    }

    const { data: communities, error: communitiesError } = await supabase
      .from('growth_communities')
      .select(`
        id,
        name,
        school_id,
        generation_id,
        school:school_id(id, name),
        generation:generation_id(id, name)
      `)
      .order('name', { ascending: true });

    if (communitiesError) {
      console.error('Error fetching communities:', communitiesError);
      return res.status(500).json({ error: 'Failed to fetch communities' });
    }

    return res.status(200).json({
      consultants: consultants || [],
      students: students || [],
      schools: schools || [],
      generations: generations || [],
      communities: communities || []
    });

  } catch (error) {
    console.error('Consultant assignment users API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}