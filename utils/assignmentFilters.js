import { supabase } from '../lib/supabase';

/**
 * Utilities for managing cascading filters in assignment overview
 */

/**
 * Get all schools available for filtering
 * For admins: all schools
 * For consultants: only schools they're assigned to
 */
export async function getAvailableSchools(userId, userRole) {
  try {
    if (userRole === 'admin') {
      // Admins see all schools
      const { data: schools, error } = await supabase
        .from('schools')
        .select('id, name')
        .order('name');

      if (error) throw error;
      return schools || [];
    } else if (userRole === 'consultor') {
      // Consultants see only schools they're assigned to
      const { data: assignments, error: assignError } = await supabase
        .from('consultant_assignments')
        .select(`
          school_id,
          school:schools!consultant_assignments_school_id_fkey(id, name)
        `)
        .eq('consultant_id', userId)
        .eq('is_active', true)
        .not('school_id', 'is', null);

      if (assignError) throw assignError;

      // Deduplicate schools
      const schoolMap = new Map();
      assignments?.forEach(a => {
        if (a.school && a.school_id) {
          schoolMap.set(a.school_id, a.school);
        }
      });

      return Array.from(schoolMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    return [];
  } catch (error) {
    console.error('Error fetching available schools:', error);
    return [];
  }
}

/**
 * Get communities based on selected school
 * If no school selected, return all available communities
 */
export async function getAvailableCommunitiesForSchool(userId, userRole, schoolId = null) {
  try {
    let query = supabase
      .from('growth_communities')
      .select('id, name, school_id');

    // Filter by school if provided
    if (schoolId) {
      // Convert to integer if it's a string
      const schoolIdInt = typeof schoolId === 'string' ? parseInt(schoolId) : schoolId;
      query = query.eq('school_id', schoolIdInt);
    }

    // For consultants, only show communities they're assigned to
    if (userRole === 'consultor') {
      const { data: assignments } = await supabase
        .from('consultant_assignments')
        .select('community_id')
        .eq('consultant_id', userId)
        .eq('is_active', true)
        .not('community_id', 'is', null);

      const communityIds = assignments?.map(a => a.community_id) || [];
      if (communityIds.length > 0) {
        query = query.in('id', communityIds);
      } else {
        return []; // No communities assigned
      }
    }

    const { data: communities, error } = await query.order('name');

    if (error) throw error;
    return communities || [];
  } catch (error) {
    console.error('Error fetching available communities:', error);
    return [];
  }
}

/**
 * Get generations based on selected school
 * Only returns generations if the school has generations enabled
 */
export async function getAvailableGenerationsForSchool(userId, userRole, schoolId) {
  try {
    if (!schoolId) return [];

    // First check if school has generations
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('has_generations')
      .eq('id', schoolId)
      .single();

    if (schoolError || !school?.has_generations) {
      return [];
    }

    let query = supabase
      .from('generations')
      .select('id, name')
      .eq('school_id', schoolId);

    // For consultants, only show generations they're assigned to
    if (userRole === 'consultor') {
      const { data: assignments } = await supabase
        .from('consultant_assignments')
        .select('generation_id')
        .eq('consultant_id', userId)
        .eq('is_active', true)
        .eq('school_id', schoolId)
        .not('generation_id', 'is', null);

      const generationIds = assignments?.map(a => a.generation_id) || [];
      if (generationIds.length > 0) {
        query = query.in('id', generationIds);
      } else {
        return []; // No generations assigned
      }
    }

    const { data: generations, error } = await query.order('name');

    if (error) throw error;
    return generations || [];
  } catch (error) {
    console.error('Error fetching available generations:', error);
    return [];
  }
}

/**
 * Update filter state based on interdependencies
 * When a community is selected, auto-select its school
 * When a school is cleared, clear community and generation
 */
export function updateFilterDependencies(filters, changedField, newValue) {
  const updatedFilters = { ...filters };

  switch (changedField) {
    case 'school_id':
      if (!newValue) {
        // Clear dependent filters when school is cleared
        updatedFilters.community_id = null;
        updatedFilters.generation_id = null;
      }
      updatedFilters.school_id = newValue;
      break;

    case 'community_id':
      updatedFilters.community_id = newValue;
      // Note: We'll auto-select school in the component after fetching community details
      break;

    case 'generation_id':
      updatedFilters.generation_id = newValue;
      break;

    default:
      break;
  }

  return updatedFilters;
}

/**
 * Get the count of active filters
 */
export function getActiveFilterCount(filters) {
  let count = 0;
  if (filters.school_id) count++;
  if (filters.community_id) count++;
  if (filters.generation_id) count++;
  return count;
}

/**
 * Clear all filters
 */
export function clearAllFilters() {
  return {
    school_id: null,
    community_id: null,
    generation_id: null
  };
}