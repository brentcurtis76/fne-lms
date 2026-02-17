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

    // Verify admin role using user_roles table
    const { data: adminRole, error: adminRoleError } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1);

    if (adminRoleError) {
      console.error('Admin role check error:', adminRoleError.message);
      return res.status(500).json({ error: 'Failed to verify admin role', details: adminRoleError.message });
    }

    if (!adminRole || adminRole.length === 0) {
      console.error('User is not admin');
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Fetch consultants (users with consultor role from user_roles table)
    const { data: consultorRoles, error: consultorRolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'consultor')
      .eq('is_active', true);

    if (consultorRolesError) {
      console.error('Error fetching consultant roles:', consultorRolesError);
      return res.status(500).json({ error: 'Failed to fetch consultant roles' });
    }

    const consultantUserIds = [...new Set((consultorRoles || []).map(r => r.user_id))];

    let consultants: any[] = [];
    if (consultantUserIds.length > 0) {
      const { data: consultantProfiles, error: consultantsError } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          email,
          school_id,
          generation_id,
          community_id,
          external_school_affiliation
        `)
        .in('id', consultantUserIds)
        .eq('approval_status', 'approved')
        .order('last_name', { ascending: true });

      if (consultantsError) {
        console.error('Error fetching consultants:', consultantsError);
        return res.status(500).json({ error: 'Failed to fetch consultants' });
      }
      consultants = consultantProfiles || [];
    }

    // Fetch all users that can be assigned to consultants (all roles)
    const { data: students, error: studentsError } = await supabase
      .from('profiles')
      .select(`
        id,
        first_name,
        last_name,
        email,
        school_id,
        generation_id,
        community_id,
        school:schools(id, name),
        generation:generations(id, name),
        community:growth_communities(id, name)
      `)
      .eq('approval_status', 'approved')
      .order('last_name', { ascending: true });

    if (studentsError) {
      console.error('Error fetching students:', studentsError);
      return res.status(500).json({ error: 'Failed to fetch students' });
    }

    // Fetch organizational options
    const { data: schools, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
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
        school:schools(id, name),
        generation:generations(id, name)
      `)
      .order('name', { ascending: true });

    if (communitiesError) {
      console.error('Error fetching communities:', communitiesError);
      return res.status(500).json({ error: 'Failed to fetch communities', details: communitiesError.message });
    }

    // For each student, get their primary school and community from roles if not set
    const studentsWithSchools = await Promise.all((students || []).map(async (student) => {
      // Always check user_roles for the most up-to-date school and community info
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select(`
          school_id,
          community_id,
          school:schools(id, name),
          community:growth_communities(id, name)
        `)
        .eq('user_id', student.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (userRoles && userRoles.length > 0) {
        // Override with data from user_roles if available
        if (userRoles[0].school_id) {
          student.school_id = userRoles[0].school_id;
          student.school = userRoles[0].school;
        }
        if (userRoles[0].community_id) {
          student.community_id = userRoles[0].community_id;
          student.community = userRoles[0].community;
        }
      }
      return student;
    }));

    return res.status(200).json({
      consultants: consultants || [],
      students: studentsWithSchools || [],
      schools: schools || [],
      generations: generations || [],
      communities: communities || []
    });

  } catch (error) {
    console.error('Consultant assignment users API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}