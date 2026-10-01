import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getUserRoles, getHighestRole } from '../../../utils/roleUtils';
import { readClientSchoolScope } from '../../../lib/simulation/tenant-policy';
import { requireVerifiedCaller } from '../../../lib/api-auth';

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
    // Identity comes from the auth server; the cookie's stored `user` is
    // client-controlled (SM-B015).
    const caller = await requireVerifiedCaller(req, res);
    if (!caller.user) {
      return res.status(caller.status).json(caller.body);
    }
    const callerId = caller.user.id;

    // Get user roles using the modern role system
    const userRoles = await getUserRoles(supabase, callerId);
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
      .eq('id', callerId)
      .single();

    if (userProfileError || !userProfile) {
        return res.status(404).json({ error: 'User profile not found.' });
    }

    // Official report selectors contain client tenants only. This is resolved on the
    // server before any role-specific option query; an unavailable classification fails
    // the request instead of returning a plausible but incomplete selector.
    const clientSchools = await readClientSchoolScope(supabase);

    // Leadership scope comes from the row of the role that grants it, never
    // from the profile or from another role the caller holds elsewhere (the
    // same rule as reports/detailed getReportableUsers).
    const scopeRole = userRoles.find((r) => r.role_type === highestRole && !r.from_cache);
    const scopeGenerationId = scopeRole?.generation_id ?? null;
    const scopeCommunityId = scopeRole?.community_id ?? null;
    let scopeSchoolId: string | number | null = scopeRole?.school_id ?? null;
    if (highestRole === 'lider_generacion' && !scopeSchoolId && scopeGenerationId) {
      // A generation-leader row may carry only its generation; its school is the generation's.
      const { data: generation } = await supabase
        .from('generations')
        .select('school_id')
        .eq('id', scopeGenerationId)
        .maybeSingle();
      scopeSchoolId = generation?.school_id ?? null;
    }

    // Fetch filter data based on user role
    let schoolsData = [];
    let generationsData = [];
    let communitiesData = [];

    if (highestRole === 'admin') {
      // Admins see all options
      const [schoolsRes, generationsRes, communitiesRes] = await Promise.all([
        supabase.from('schools').select('id, name').eq('tenant_kind', 'client').order('name'),
        supabase.from('generations').select('id, name, school_id').in('school_id', clientSchools.ids).order('name'),
        supabase.from('growth_communities').select('id, name, generation_id, school_id').in('school_id', clientSchools.ids).order('name')
      ]);

      schoolsData = schoolsRes.data || [];
      generationsData = generationsRes.data || [];
      communitiesData = communitiesRes.data || [];

    } else if (highestRole === 'consultor') {
      // Consultants see all options but filtered data will be restricted by service
      const [schoolsRes, generationsRes, communitiesRes] = await Promise.all([
        supabase.from('schools').select('id, name').eq('tenant_kind', 'client').order('name'),
        supabase.from('generations').select('id, name, school_id').in('school_id', clientSchools.ids).order('name'),
        supabase.from('growth_communities').select('id, name, generation_id, school_id').in('school_id', clientSchools.ids).order('name')
      ]);

      schoolsData = schoolsRes.data || [];
      generationsData = generationsRes.data || [];
      communitiesData = communitiesRes.data || [];

    } else if (highestRole === 'equipo_directivo' && scopeSchoolId && clientSchools.isClientSchool(scopeSchoolId)) {
      // School leadership see only their school and its related data
      const schoolRes = await supabase
        .from('schools')
        .select('id, name')
        .eq('id', scopeSchoolId)
        .single();
      
      if (schoolRes.data) schoolsData = [schoolRes.data];

      const [generationsRes, communitiesRes] = await Promise.all([
        supabase
          .from('generations')
          .select('id, name, school_id')
          .eq('school_id', scopeSchoolId)
          .order('name'),
        supabase
          .from('growth_communities')
          .select('id, name, generation_id, school_id')
          .eq('school_id', scopeSchoolId)
          .order('name')
      ]);

      generationsData = generationsRes.data || [];
      communitiesData = communitiesRes.data || [];

    } else if (highestRole === 'lider_generacion' && scopeSchoolId && scopeGenerationId && clientSchools.isClientSchool(scopeSchoolId)) {
      // Generation leaders see their school and generation
      const schoolRes = await supabase
        .from('schools')
        .select('id, name')
        .eq('id', scopeSchoolId)
        .single();
      
      if (schoolRes.data) schoolsData = [schoolRes.data];

      const generationRes = await supabase
        .from('generations')
        .select('id, name, school_id')
        .eq('id', scopeGenerationId)
        .single();
      
      if (generationRes.data) generationsData = [generationRes.data];

      const communitiesRes = await supabase
        .from('growth_communities')
        .select('id, name, generation_id, school_id')
        .eq('generation_id', scopeGenerationId)
        .order('name');

      communitiesData = communitiesRes.data || [];

    } else if (highestRole === 'lider_comunidad' && scopeCommunityId) {
      // Community leaders see only their community
      const communityRes = await supabase
        .from('growth_communities')
        .select('id, name, generation_id, school_id')
        .eq('id', scopeCommunityId)
        .single();
      
      if (communityRes.data && clientSchools.isClientSchool(communityRes.data.school_id)) {
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
      // Step 1: Get supervisor's network ID from user_roles
      const { data: supervisorRole } = await supabase
        .from('user_roles')
        .select('red_id')
        .eq('user_id', callerId)
        .eq('role_type', 'supervisor_de_red')
        .eq('is_active', true)
        .maybeSingle();

      if (!supervisorRole?.red_id) {
        return res.status(200).json({
          schools: [],
          generations: [],
          communities: []
        });
      }

      // Step 2: Get schools in that network
      const { data: networkSchools } = await supabase
        .from('red_escuelas')
        .select('school_id')
        .eq('red_id', supervisorRole.red_id);
      
      if (networkSchools && networkSchools.length > 0) {
        const schoolIds = networkSchools
          .map(ns => ns.school_id)
          .filter(id => clientSchools.isClientSchool(id));

        if (schoolIds.length === 0) {
          return res.status(200).json({ schools: [], generations: [], communities: [] });
        }

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
