/**
 * School Generator
 * Creates demo school with generations, communities, and workspace
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_CONFIG } from '../config';

export interface DemoSchoolData {
  school: { id: number; name: string };
  tractorGen: { id: string; school_id: number; name: string };
  innovaGen: { id: string; school_id: number; name: string };
  community: { id: string; generation_id: string; school_id: number; name: string };
  workspace: { id: string; community_id: string; name: string };
}

export async function createDemoSchool(supabase: SupabaseClient): Promise<DemoSchoolData> {
  console.log('  Creating demo school...');

  // 1. Create school
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .insert({ name: DEMO_CONFIG.DEMO_SCHOOL_NAME })
    .select()
    .single();

  if (schoolError) {
    throw new Error(`Failed to create school: ${schoolError.message}`);
  }
  console.log(`    School created: ${school.name} (ID: ${school.id})`);

  // 2. Create Tractor generation (GT)
  const { data: tractorGen, error: tractorError } = await supabase
    .from('generations')
    .insert({
      school_id: school.id,
      name: DEMO_CONFIG.TRACTOR_GENERATION_NAME
    })
    .select()
    .single();

  if (tractorError) {
    throw new Error(`Failed to create tractor generation: ${tractorError.message}`);
  }
  console.log(`    Tractor generation created: ${tractorGen.name}`);

  // 3. Create Innova generation (GI)
  const { data: innovaGen, error: innovaError } = await supabase
    .from('generations')
    .insert({
      school_id: school.id,
      name: DEMO_CONFIG.INNOVA_GENERATION_NAME
    })
    .select()
    .single();

  if (innovaError) {
    throw new Error(`Failed to create innova generation: ${innovaError.message}`);
  }
  console.log(`    Innova generation created: ${innovaGen.name}`);

  // 4. Create growth community
  const { data: community, error: communityError } = await supabase
    .from('growth_communities')
    .insert({
      generation_id: tractorGen.id,
      school_id: school.id,
      name: DEMO_CONFIG.COMMUNITY_NAME,
      max_teachers: DEMO_CONFIG.MAX_TEACHERS
    })
    .select()
    .single();

  if (communityError) {
    throw new Error(`Failed to create community: ${communityError.message}`);
  }
  console.log(`    Community created: ${community.name}`);

  // 5. Create workspace
  const { data: workspace, error: workspaceError } = await supabase
    .from('community_workspaces')
    .insert({
      community_id: community.id,
      name: DEMO_CONFIG.WORKSPACE_NAME,
      description: 'Espacio de colaboracion para la comunidad de aprendizaje',
      settings: {
        features: {
          meetings: true,
          documents: true,
          messaging: true,
          feed: true
        },
        permissions: {
          all_can_post: true,
          all_can_upload: true
        }
      },
      is_active: true
    })
    .select()
    .single();

  if (workspaceError) {
    throw new Error(`Failed to create workspace: ${workspaceError.message}`);
  }
  console.log(`    Workspace created: ${workspace.name}`);

  return { school, tractorGen, innovaGen, community, workspace };
}
