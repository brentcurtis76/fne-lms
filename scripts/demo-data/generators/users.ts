/**
 * Users Generator
 * Creates demo user profiles and role assignments
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';
import { DEMO_CONFIG } from '../config';
import { SPANISH_FIRST_NAMES, SPANISH_LAST_NAMES } from '../content/spanish-content';

export interface DemoProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
}

export interface DemoUsersData {
  teachers: DemoProfile[];
  leaders: DemoProfile[];
  directivos: DemoProfile[];
  allUsers: DemoProfile[];
}

function generateSpanishName(index: number): { firstName: string; lastName: string; gender: 'female' | 'male' } {
  const gender = index % 2 === 0 ? 'female' : 'male';
  const firstNames = SPANISH_FIRST_NAMES[gender];
  const firstName = firstNames[index % firstNames.length];
  const lastName = SPANISH_LAST_NAMES[index % SPANISH_LAST_NAMES.length];
  return { firstName, lastName, gender };
}

function generateEmail(firstName: string, lastName: string): string {
  const cleanFirst = firstName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const cleanLast = lastName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return `${cleanFirst}.${cleanLast}${DEMO_CONFIG.DEMO_EMAIL_DOMAIN}`;
}

function generateAvatarUrl(firstName: string, lastName: string): string {
  // Using UI Avatars for consistent, professional avatars
  const name = encodeURIComponent(`${firstName} ${lastName}`);
  const colors = ['0D8ABC', '6366F1', '8B5CF6', 'EC4899', '10B981', 'F59E0B'];
  const bgColor = colors[Math.abs(firstName.charCodeAt(0) + lastName.charCodeAt(0)) % colors.length];
  return `https://ui-avatars.com/api/?name=${name}&background=${bgColor}&color=fff&size=150&bold=true`;
}

export async function createDemoUsers(
  supabase: SupabaseClient,
  schoolId: number,
  generationId: string,
  communityId: string
): Promise<DemoUsersData> {
  console.log('  Creating demo users...');

  const teachers: DemoProfile[] = [];
  const leaders: DemoProfile[] = [];
  const directivos: DemoProfile[] = [];

  // Create teachers
  for (let i = 0; i < DEMO_CONFIG.TEACHER_COUNT; i++) {
    const { firstName, lastName } = generateSpanishName(i);
    const email = generateEmail(firstName, lastName);
    const userId = crypto.randomUUID();

    // Create profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        first_name: firstName,
        last_name: lastName,
        email: email,
        avatar_url: generateAvatarUrl(firstName, lastName),
        school: schoolId
      })
      .select()
      .single();

    if (profileError) {
      console.error(`Failed to create profile for ${firstName} ${lastName}: ${profileError.message}`);
      continue;
    }

    // Create user_role as docente
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        role_type: 'docente',
        school_id: schoolId,
        generation_id: generationId,
        community_id: communityId,
        is_active: true
      });

    if (roleError) {
      console.error(`Failed to create role for ${firstName} ${lastName}: ${roleError.message}`);
    }

    teachers.push(profile);
  }
  console.log(`    Created ${teachers.length} teachers`);

  // Create leaders (from first 2 teachers, add leader role)
  for (let i = 0; i < DEMO_CONFIG.LEADER_COUNT && i < teachers.length; i++) {
    const teacher = teachers[i];

    // Add lider_comunidad role
    const { error: leaderRoleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: teacher.id,
        role_type: 'lider_comunidad',
        school_id: schoolId,
        generation_id: generationId,
        community_id: communityId,
        is_active: true
      });

    if (leaderRoleError) {
      console.error(`Failed to add leader role: ${leaderRoleError.message}`);
    }

    leaders.push(teacher);
  }
  console.log(`    Promoted ${leaders.length} teachers to leaders`);

  // Create directivos (new users)
  for (let i = 0; i < DEMO_CONFIG.DIRECTIVO_COUNT; i++) {
    const nameIndex = DEMO_CONFIG.TEACHER_COUNT + i;
    const { firstName, lastName } = generateSpanishName(nameIndex);
    const email = generateEmail(firstName, lastName);
    const userId = crypto.randomUUID();

    // Create profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        first_name: firstName,
        last_name: lastName,
        email: email,
        avatar_url: generateAvatarUrl(firstName, lastName),
        school: schoolId
      })
      .select()
      .single();

    if (profileError) {
      console.error(`Failed to create directivo profile: ${profileError.message}`);
      continue;
    }

    // Create user_role as equipo_directivo
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        role_type: 'equipo_directivo',
        school_id: schoolId,
        is_active: true
      });

    if (roleError) {
      console.error(`Failed to create directivo role: ${roleError.message}`);
    }

    directivos.push(profile);
  }
  console.log(`    Created ${directivos.length} directivos`);

  const allUsers = [...teachers, ...directivos];

  return { teachers, leaders, directivos, allUsers };
}
