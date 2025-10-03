import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createServerSupabaseClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const tests = {
    user: {
      id: session.user.id,
      email: session.user.email
    },
    results: {}
  };

  try {
    // Test 1: Check user role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, name')
      .eq('id', session.user.id)
      .single();

    tests.results['userRole'] = {
      passed: !!profile,
      data: profile,
      canCreateAssignments: ['admin', 'consultor'].includes(profile?.role || '')
    };

    // Test 2: Check if user has group assignments
    const { data: assignments } = await supabase
      .from('lesson_assignments')
      .select('*')
      .eq('assignment_type', 'group');

    const userAssignments = assignments?.filter(a => {
      if (!a.group_assignments) return false;
      return a.group_assignments.some((g: any) => 
        g.members.some((m: any) => m.user_id === session.user.id)
      );
    }) || [];

    tests.results['groupAssignments'] = {
      passed: true,
      count: userAssignments.length,
      assignments: userAssignments.map(a => ({
        id: a.id,
        title: a.title,
        groups: a.group_assignments?.map((g: any) => ({
          name: g.group_name,
          isUserMember: g.members.some((m: any) => m.user_id === session.user.id),
          hasSubmission: !!g.submission
        }))
      }))
    };

    // Test 3: Check enrolled courses
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select(`
        course_id,
        courses (
          id,
          title
        )
      `)
      .eq('user_id', session.user.id)
      .eq('status', 'enrolled');

    tests.results['enrolledCourses'] = {
      passed: true,
      count: enrollments?.length || 0,
      courses: enrollments?.map(e => e.courses) || []
    };

    // Test 4: Check if lessons have group assignment blocks
    if (profile?.role === 'consultor' || profile?.role === 'admin') {
      const { data: lessons } = await supabase
        .from('lessons')
        .select('id, title, blocks')
        .limit(10);

      const lessonsWithGroupAssignments = lessons?.filter(l => 
        l.blocks?.some((b: any) => b.type === 'group-assignment')
      ) || [];

      tests.results['lessonsWithGroupBlocks'] = {
        passed: true,
        count: lessonsWithGroupAssignments.length,
        lessons: lessonsWithGroupAssignments.map(l => ({
          id: l.id,
          title: l.title,
          groupBlocks: l.blocks?.filter((b: any) => b.type === 'group-assignment')
            .map((b: any) => ({
              title: b.payload?.title,
              groups: b.payload?.groups?.length || 0
            }))
        }))
      };
    }

    // Summary
    tests.results['summary'] = {
      role: profile?.role,
      canCreateAssignments: ['admin', 'consultor'].includes(profile?.role || ''),
      hasGroupAssignments: userAssignments.length > 0,
      enrolledInCourses: (enrollments?.length || 0) > 0
    };

    res.status(200).json(tests);
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ 
      error: 'Test failed', 
      details: error instanceof Error ? error.message : 'Unknown error',
      tests 
    });
  }
}