import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getUserRoles, getHighestRole } from '../../../utils/roleUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface FilterOptions {
  schools: Array<{id: string, name: string}>;
  generations: Array<{id: string, name: string, school_id: string}>;
  communities: Array<{id: string, name: string, generation_id: string, school_id: string}>;
}

const handler = async (req: NextApiRequest, res: NextApiResponse<FilterOptions | { error: string }>) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const sessionClient = createPagesServerClient({ req, res });
    const { data: { session } } = await sessionClient.auth.getSession();

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user roles using the modern role system
    const userRoles = await getUserRoles(supabase, session.user.id);
    const highestRole = getHighestRole(userRoles);
    
    // Check if user has access to reports
    const allowedRoles = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red'];
    if (!highestRole || !allowedRoles.includes(highestRole)) {
      return res.status(403).json({ error: 'You do not have permission to view this report.' });
    }

    // Get user profile data for role-based filtering
    const { data: userProfile, error: userProfileError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, school_id, generation_id, community_id')
      .eq('id', session.user.id)
      .single();

    if (userProfileError || !userProfile) {
        return res.status(404).json({ error: 'User profile not found.' });
    }

    // Fetch filter data based on user role
    let schoolsData = [];
    let generationsData = [];
    let communitiesData = [];

    if (highestRole === 'admin') {
      // Admins see all options
      const [schoolsRes, generationsRes, communitiesRes] = await Promise.all([
        supabase.from('schools').select('id, name').order('name'),
        supabase.from('generations').select('id, name, school_id').order('name'),
        supabase.from('growth_communities').select('id, name, generation_id, school_id').order('name')
      ]);

      schoolsData = schoolsRes.data || [];
      generationsData = generationsRes.data || [];
      communitiesData = communitiesRes.data || [];

    } else if (highestRole === 'consultor') {
      // Consultants see all options but filtered data will be restricted by service
      const [schoolsRes, generationsRes, communitiesRes] = await Promise.all([
        supabase.from('schools').select('id, name').order('name'),
        supabase.from('generations').select('id, name, school_id').order('name'),
        supabase.from('growth_communities').select('id, name, generation_id, school_id').order('name')
      ]);

      schoolsData = schoolsRes.data || [];
      generationsData = generationsRes.data || [];
      communitiesData = communitiesRes.data || [];

    } else if (highestRole === 'equipo_directivo' && userProfile.school_id) {
      // School leadership see only their school and its related data
      const schoolRes = await supabase
        .from('schools')
        .select('id, name')
        .eq('id', userProfile.school_id)
        .single();
      
      if (schoolRes.data) schoolsData = [schoolRes.data];

      const [generationsRes, communitiesRes] = await Promise.all([
        supabase
          .from('generations')
          .select('id, name, school_id')
          .eq('school_id', userProfile.school_id)
          .order('name'),
        supabase
          .from('growth_communities')
          .select('id, name, generation_id, school_id')
          .eq('school_id', userProfile.school_id)
          .order('name')
      ]);

      generationsData = generationsRes.data || [];
      communitiesData = communitiesRes.data || [];

    } else if (highestRole === 'lider_generacion' && userProfile.school_id && userProfile.generation_id) {
      // Generation leaders see their school and generation
      const schoolRes = await supabase
        .from('schools')
        .select('id, name')
        .eq('id', userProfile.school_id)
        .single();
      
      if (schoolRes.data) schoolsData = [schoolRes.data];

      const generationRes = await supabase
        .from('generations')
        .select('id, name, school_id')
        .eq('id', userProfile.generation_id)
        .single();
      
      if (generationRes.data) generationsData = [generationRes.data];

      const communitiesRes = await supabase
        .from('growth_communities')
        .select('id, name, generation_id, school_id')
        .eq('generation_id', userProfile.generation_id)
        .order('name');

      communitiesData = communitiesRes.data || [];

    } else if (highestRole === 'lider_comunidad' && userProfile.community_id) {
      // Community leaders see only their community
      const communityRes = await supabase
        .from('growth_communities')
        .select('id, name, generation_id, school_id')
        .eq('id', userProfile.community_id)
        .single();
      
      if (communityRes.data) {
        communitiesData = [communityRes.data];
        
        // Get the related school and generation
        if (communityRes.data.school_id) {
          const schoolRes = await supabase
            .from('schools')
            .select('id, name')
            .eq('id', communityRes.data.school_id)
            .single();
          
          if (schoolRes.data) schoolsData = [schoolRes.data];
        }
        
        if (communityRes.data.generation_id) {
          const generationRes = await supabase
            .from('generations')
            .select('id, name, school_id')
            .eq('id', communityRes.data.generation_id)
            .single();
          
          if (generationRes.data) generationsData = [generationRes.data];
        }
      }

    } else if (highestRole === 'supervisor_de_red') {
      // Network supervisors see schools in their network
      const { data: networkSchools } = await supabase
        .from('red_escuelas')
        .select('school_id')
        .eq('supervisor_id', session.user.id);
      
      if (networkSchools && networkSchools.length > 0) {
        const schoolIds = networkSchools.map(ns => ns.school_id);

        const [schoolsRes, generationsRes, communitiesRes] = await Promise.all([
          supabase
            .from('schools')
            .select('id, name')
            .in('id', schoolIds)
            .order('name'),
          supabase
            .from('generations')
            .select('id, name, school_id')
            .in('school_id', schoolIds)
            .order('name'),
          supabase
            .from('growth_communities')
            .select('id, name, generation_id, school_id')
            .in('school_id', schoolIds)
            .order('name')
        ]);

        schoolsData = schoolsRes.data || [];
        generationsData = generationsRes.data || [];
        communitiesData = communitiesRes.data || [];
      }
    }

    // Return structured filter options
    const filterOptions: FilterOptions = {
      schools: schoolsData,
      generations: generationsData,
      communities: communitiesData
    };

    res.status(200).json(filterOptions);

  } catch (error: any) {
    console.error('Error in filter options API:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export default handler;