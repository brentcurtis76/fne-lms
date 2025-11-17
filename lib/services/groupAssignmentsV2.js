import { supabase } from '../supabase-wrapper';

class GroupAssignmentsV2Service {
  /**
   * Get all group assignments for a user's enrolled courses
   * This fetches group assignment blocks directly from lessons in assigned courses
   */
  async getGroupAssignmentsForUser(userId) {
    try {
      // First get the user's profile to determine their community
      let profile = null;

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('community_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (userRole) {
        profile = userRole;
      }

      if (!profile) {
        const { data: profileFallback } = await supabase
          .from('profiles')
          .select('community_id')
          .eq('id', userId)
          .maybeSingle();

        if (profileFallback) {
          profile = profileFallback;
        }
      }

      // Get all courses through different methods:
      // 1. Direct course enrollments (student enrollments)
      // 2. Direct course assignments (teacher/consultant assignments)
      // 3. Through consultant assignments to the community
      // 4. Through consultant assignments to the user
      
      let courseIds = [];
      
      // Method 1: Check for direct course enrollments (student enrollments)
      const { data: courseEnrollments } = await supabase
        .from('course_enrollments')
        .select('course_id')
        .eq('user_id', userId)
        .eq('status', 'active');
      
      if (courseEnrollments && courseEnrollments.length > 0) {
        courseIds = courseEnrollments.map(ce => ce.course_id);
      }
      
      // Method 2: Check for direct course assignments (teacher/consultant)
      if (courseIds.length === 0) {
        const { data: courseAssignments } = await supabase
          .from('course_assignments')
          .select('course_id')
          .eq('teacher_id', userId);
        
        if (courseAssignments && courseAssignments.length > 0) {
          courseIds = courseAssignments.map(ca => ca.course_id);
        }
      }
      
      // Method 3: Check if user's community has a consultant with course assignments
      if (courseIds.length === 0 && profile?.community_id) {
        const communityId = profile.community_id;

        if (communityId) {
          // Find consultants assigned to this community
          const { data: consultantAssignments } = await supabase
            .from('consultant_assignments')
            .select('consultant_id')
            .eq('community_id', communityId)
            .eq('is_active', true)
            .eq('can_assign_courses', true);
          
          if (consultantAssignments && consultantAssignments.length > 0) {
            const consultantIds = consultantAssignments.map(ca => ca.consultant_id);
            
            // Get courses assigned to these consultants
            const { data: consultantCourses } = await supabase
              .from('course_assignments')
              .select('course_id')
              .in('teacher_id', consultantIds);
            
            if (consultantCourses && consultantCourses.length > 0) {
              courseIds = [...new Set(consultantCourses.map(cc => cc.course_id))];
            }
          }
        }
      }
      
      // Method 4: For now, if still no courses found, get courses with group assignments
      // This is a temporary fallback to ensure users can see group assignments
      if (courseIds.length === 0) {
        const { data: coursesWithGroupAssignments } = await supabase
          .from('lessons')
          .select('course_id')
          .not('content', 'is', null)
          .limit(20);
        
        if (coursesWithGroupAssignments && coursesWithGroupAssignments.length > 0) {
          // Filter unique course IDs that have group assignments in their content
          const uniqueCourseIds = new Set();
          for (const lesson of coursesWithGroupAssignments) {
            if (lesson.course_id) {
              uniqueCourseIds.add(lesson.course_id);
            }
          }
          courseIds = Array.from(uniqueCourseIds);
        }
      }
      
      if (courseIds.length === 0) {
        return { assignments: [], error: null };
      }

      // Get all lessons from assigned courses
      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select(`
          id,
          title,
          order_number,
          created_at,
          course:courses!inner(
            id,
            title,
            description
          )
        `)
        .in('course_id', courseIds)
        .order('course_id', { ascending: true })
        .order('order_number', { ascending: true });

      if (lessonsError) throw lessonsError;

      // Get all blocks for these lessons from the blocks table
      const lessonIds = lessons.map(l => l.id);
      let blocks = [];

      if (lessonIds.length > 0) {
        const { data: fetchedBlocks, error: blocksError } = await supabase
          .from('blocks')
          .select('*')
          .in('lesson_id', lessonIds)
          .order('position', { ascending: true });

        if (blocksError) {
          console.error('Error fetching blocks:', blocksError);
        }

        blocks = fetchedBlocks || [];
      }

      // Extract group assignment blocks
      const groupAssignments = [];
      
      lessons?.forEach(lesson => {
        // Get blocks for this lesson
        const lessonBlocks = blocks?.filter(b => b.lesson_id === lesson.id) || [];
        
        lessonBlocks.forEach((block, blockIndex) => {
          if (block.type === 'group-assignment' || block.type === 'group_assignment') {
            groupAssignments.push({
              id: block.id,
              lesson_id: lesson.id,
              lesson_title: lesson.title,
              course_id: lesson.course.id,
              course_title: lesson.course.title,
              block_index: block.position || blockIndex,
              title: block.payload?.title || 'Tarea Grupal Sin Título',
              description: block.payload?.description || '',
              instructions: block.payload?.instructions || '',
              resources: block.payload?.resources || [],
              community_id: profile?.community_id || null,
              created_at: lesson.created_at
            });
          }
        });
      });

      // Get existing submissions for these assignments
      const assignmentIds = groupAssignments.map(a => a.id);
      let submissions = [];

      if (assignmentIds.length > 0) {
        const { data: fetchedSubmissions } = await supabase
          .from('group_assignment_submissions')
          .select('assignment_id, status, grade, submitted_at')
          .eq('user_id', userId)
          .in('assignment_id', assignmentIds);

        submissions = fetchedSubmissions || [];
      }

      // Merge submission data with assignments
      const assignmentsWithStatus = groupAssignments.map(assignment => {
        const submission = submissions?.find(s => s.assignment_id === assignment.id);
        return {
          ...assignment,
          status: submission?.status || 'pending',
          grade: submission?.grade || null,
          submitted_at: submission?.submitted_at || null
        };
      });
      
      return { assignments: assignmentsWithStatus, error: null };
    } catch (error) {
      console.error('Error fetching group assignments:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details
      });
      return { assignments: [], error };
    }
  }

  /**
   * Get a specific group assignment by ID
   */
  async getGroupAssignment(assignmentId) {
    try {
      // Attempt direct lookup by block ID first (newer format)
      let blockRecord = null;

      const { data: directBlock } = await supabase
        .from('blocks')
        .select('*')
        .eq('id', assignmentId)
        .maybeSingle();

      if (directBlock) {
        blockRecord = directBlock;
      }

      // Support legacy composite IDs of the form {lessonId}_block_{index}
      if (!blockRecord && assignmentId.includes('_block_')) {
        const [lessonId, , blockIndexRaw] = assignmentId.split('_');
        const blockIndex = parseInt(blockIndexRaw, 10);

        if (!Number.isNaN(blockIndex)) {
          const { data: blocksForLesson } = await supabase
            .from('blocks')
            .select('*')
            .eq('lesson_id', lessonId)
            .order('position', { ascending: true });

          blockRecord = blocksForLesson?.[blockIndex] || null;
        }
      }

      if (!blockRecord) {
        throw new Error('Group assignment block not found');
      }

      if (blockRecord.type !== 'group-assignment' && blockRecord.type !== 'group_assignment') {
        throw new Error('Requested block is not a group assignment');
      }

      const { data: lesson, error: lessonError } = await supabase
        .from('lessons')
        .select(`
          id,
          title,
          created_at,
          course:courses!inner(
            id,
            title,
            description
          )
        `)
        .eq('id', blockRecord.lesson_id)
        .single();

      if (lessonError) throw lessonError;

      return {
        assignment: {
          id: blockRecord.id,
          lesson_id: lesson.id,
          lesson_title: lesson.title,
          course_id: lesson.course.id,
          course_title: lesson.course.title,
          block_index: blockRecord.position ?? null,
          title: blockRecord.payload?.title || 'Tarea Grupal Sin Título',
          description: blockRecord.payload?.description || '',
          instructions: blockRecord.payload?.instructions || '',
          resources: blockRecord.payload?.resources || [],
          created_at: lesson.created_at
        },
        error: null
      };
    } catch (error) {
      console.error('Error fetching group assignment:', error);
      return { assignment: null, error };
    }
  }

  /**
   * Get or create a group for an assignment
   */
  async getOrCreateGroup(assignmentId, userId) {
    try {
      // First check if user already belongs to a group for this assignment
      const { data: existingMember, error: memberCheckError } = await supabase
        .from('group_assignment_members')
        .select(`
          group_id,
          group:group_assignment_groups!inner(*)
        `)
        .eq('assignment_id', assignmentId)
        .eq('user_id', userId)
        .maybeSingle();

      // Detect RLS policy errors (infinite recursion or permission denied)
      if (memberCheckError) {
        const errorCode = memberCheckError.code;
        const errorMessage = memberCheckError.message || '';

        // PostgreSQL error codes for policy issues
        if (errorCode === '42P17' || errorMessage.includes('infinite recursion')) {
          console.error('[GroupAssignments] RLS policy infinite recursion detected. Check group_assignment_members policy.');
          return {
            group: null,
            error: new Error('Error de configuración del sistema. Por favor contacta al administrador.')
          };
        }

        if (errorCode === '42501' || errorMessage.includes('permission denied')) {
          console.error('[GroupAssignments] RLS policy permission denied. User may not have access to view group members.');
          return {
            group: null,
            error: new Error('No tienes permiso para ver los miembros del grupo.')
          };
        }

        // If error is PGRST116 (no rows), that's expected - user has no group yet
        // Continue to group creation logic below
        if (errorCode === 'PGRST116') {
          // This is expected - user doesn't have a group yet, we'll create one
        } else {
          // Any other error is unexpected and should be returned
          // Don't risk creating duplicate groups when we can't confirm membership
          console.error('[GroupAssignments] Unexpected error checking group membership:', memberCheckError);
          return {
            group: null,
            error: memberCheckError
          };
        }
      }

      if (existingMember?.group) {
        return { group: existingMember.group, error: null };
      }

      // Check if this assignment is consultant-managed
      const { data: assignmentSettings } = await supabase
        .from('group_assignment_settings')
        .select('consultant_managed')
        .eq('assignment_id', assignmentId)
        .maybeSingle();

      // If consultant-managed, don't auto-create groups
      if (assignmentSettings?.consultant_managed) {
        return { 
          group: null, 
          error: new Error('Este trabajo requiere que un consultor te asigne a un grupo. Por favor, contacta a tu consultor.')
        };
      }

      // Get user's community
      const { data: userRoleRows, error: userRoleError } = await supabase
        .from('user_roles')
        .select('community_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (userRoleError) {
        console.error('[GroupAssignments] Error fetching user role community:', userRoleError);
        throw userRoleError;
      }

      let communityId = userRoleRows?.find((row) => row?.community_id)?.community_id || null;

      if (!communityId) {
        const { data: profileFallback, error: profileFallbackError } = await supabase
          .from('profiles')
          .select('community_id')
          .eq('id', userId)
          .maybeSingle();

        if (profileFallbackError && profileFallbackError.code !== 'PGRST116') {
          console.error('[GroupAssignments] Error fetching profile community fallback:', profileFallbackError);
          throw profileFallbackError;
        }

        communityId = profileFallback?.community_id || null;
      }

      if (!communityId) {
        throw new Error('User community not found');
      }

      // Check if a group already exists for this assignment/community
      const { data: existingGroup, error: existingGroupError } = await supabase
        .from('group_assignment_groups')
        .select('*')
        .eq('assignment_id', assignmentId)
        .eq('community_id', communityId)
        .maybeSingle();

      if (existingGroupError && existingGroupError.code !== 'PGRST116') {
        console.error('[GroupAssignments] Error checking existing group:', existingGroupError);
        throw existingGroupError;
      }

      let targetGroup = existingGroup;

      if (!targetGroup) {
        // Auto-create a new group when none exists yet
        const { data: newGroup, error: groupError } = await supabase
          .from('group_assignment_groups')
          .insert({
            assignment_id: assignmentId,
            community_id: communityId,
            name: `Grupo ${Date.now()}`,
            is_consultant_managed: false
          })
          .select()
          .single();

        if (groupError) {
          // Handle rare race condition where another user created the group first
          if (groupError.code === '23505' || groupError.code === 'PGRST116') {
            const { data: fallbackGroup } = await supabase
              .from('group_assignment_groups')
              .select('*')
              .eq('assignment_id', assignmentId)
              .eq('community_id', communityId)
              .single();
            targetGroup = fallbackGroup;
          } else {
            throw groupError;
          }
        } else {
          targetGroup = newGroup;
        }
      }

      // Add user as member
      const { error: memberError } = await supabase
        .from('group_assignment_members')
        .insert({
          group_id: targetGroup.id,
          assignment_id: assignmentId,
          user_id: userId,
          role: 'member'
        })
        .select()
        .single();

      if (memberError) {
        if (memberError.code === '23505') {
          // User already added by another process; fetch group membership info for return
          return { group: targetGroup, error: null };
        }
        throw memberError;
      }

      return { group: targetGroup, error: null };
    } catch (error) {
      console.error('Error getting/creating group:', error);
      return { group: null, error };
    }
  }

  /**
   * Get group members for an assignment
   */
  async getGroupMembers(groupId) {
    try {
      const { data: members, error } = await supabase
        .from('group_assignment_members')
        .select('*')
        .eq('group_id', groupId);

      // Get user details separately to avoid join errors
      if (members && members.length > 0) {
        const userIds = members.map(m => m.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', userIds);

        // Merge profile data with members
        // IMPORTANT: Always create a user object, even if profile is missing
        members.forEach(member => {
          const profile = profiles?.find(p => p.id === member.user_id);

          // Always assign a user object to prevent undefined errors
          member.user = {
            id: member.user_id,
            first_name: profile?.first_name || null,
            last_name: profile?.last_name || null,
            full_name: profile
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Usuario desconocido'
              : 'Usuario desconocido',
            avatar_url: profile?.avatar_url || null
          };

          // Keep profile for backward compatibility (if needed elsewhere)
          if (profile) {
            member.profile = profile;
          }
        });
      }

      if (error) throw error;

      return { members: members || [], error: null };
    } catch (error) {
      console.error('Error fetching group members:', error);
      return { members: [], error };
    }
  }

  /**
   * Submit group assignment
   */
  async submitGroupAssignment(assignmentId, groupId, submissionData) {
    try {
      const response = await fetch('/api/assignments/submit-group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          assignmentId,
          groupId,
          submission: submissionData
        })
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Error al enviar el trabajo' };
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('Error submitting group assignment:', error);
      return { success: false, error: 'Error al enviar el trabajo' };
    }
  }

  /**
   * Get submission status for a user and assignment
   */
  async getSubmissionStatus(assignmentId, userId) {
    try {
      const { data: submission, error } = await supabase
        .from('group_assignment_submissions')
        .select('*')
        .eq('assignment_id', assignmentId)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return { submission, error: null };
    } catch (error) {
      console.error('Error fetching submission status:', error);
      return { submission: null, error };
    }
  }

  /**
   * Get all assignments for admin/consultant view with filtering and pagination
   * Admins see all assignments, consultants see only their assigned students/communities
   */
  async getAllAssignmentsForAdmin(userId, filters = {}, limit = 50, offset = 0) {
    try {
      // First check user role
      // Get user's roles from user_roles table
      const { data: userRoles, error: profileError } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (profileError) throw profileError;

      // Check if user has admin or consultant role
      const roles = userRoles?.map(r => r.role_type) || [];
      const isAdmin = roles.includes('admin');
      const isConsultant = roles.includes('consultor');

      if (!isAdmin && !isConsultant) {
        return { assignments: [], total: 0, error: null };
      }

      // Build the base query to get all lessons with group assignment blocks
      let courseIds = [];

      if (isAdmin) {
        // Admin sees all courses
        const { data: allCourses, error: coursesError } = await supabase
          .from('courses')
          .select('id');

        if (coursesError) throw coursesError;
        courseIds = allCourses.map(c => c.id);
      } else if (isConsultant) {
        // Consultant sees courses assigned to their students/communities
        // First get all consultant assignments
        const { data: consultantAssignments, error: assignmentsError } = await supabase
          .from('consultant_assignments')
          .select('student_id, community_id, school_id, generation_id')
          .eq('consultant_id', userId)
          .eq('is_active', true);

        if (assignmentsError) throw assignmentsError;

        // Get unique community IDs from consultant assignments
        const communityIds = [...new Set(consultantAssignments
          .filter(ca => ca.community_id)
          .map(ca => ca.community_id))];

        // Get student IDs
        const studentIds = consultantAssignments
          .filter(ca => ca.student_id)
          .map(ca => ca.student_id);

        // Get courses assigned to these students or their communities
        const { data: courseAssignments } = await supabase
          .from('course_assignments')
          .select('course_id')
          .in('teacher_id', studentIds);

        // Get courses through community enrollments
        const { data: communityEnrollments } = await supabase
          .from('course_enrollments')
          .select('course_id, user_id')
          .in('user_id', await this.getStudentsInCommunities(communityIds));

        // Combine all course IDs
        const allCourseIds = new Set();
        courseAssignments?.forEach(ca => allCourseIds.add(ca.course_id));
        communityEnrollments?.forEach(ce => allCourseIds.add(ce.course_id));
        courseIds = Array.from(allCourseIds);
      }

      if (courseIds.length === 0) {
        return { assignments: [], total: 0, error: null };
      }

      // Apply filters to get matching communities
      let filteredCommunityIds = null;
      if (filters.school_id || filters.community_id || filters.generation_id) {
        // Get communities that match the filters
        let communityQuery = supabase
          .from('growth_communities')
          .select('id');

        if (filters.community_id) {
          communityQuery = communityQuery.eq('id', filters.community_id);
        }
        if (filters.school_id) {
          // Convert school_id to integer if it's a string
          const schoolId = parseInt(filters.school_id);
          communityQuery = communityQuery.eq('school_id', schoolId);
        }
        if (filters.generation_id) {
          communityQuery = communityQuery.eq('generation_id', filters.generation_id);
        }

        const { data: filteredCommunities, error: commError } = await communityQuery;
        
        if (commError) {
          console.error('Error filtering communities:', commError);
        }
        
        filteredCommunityIds = filteredCommunities?.map(c => c.id) || [];

        // If we're filtering by school/community but no communities match, return empty
        if (filteredCommunityIds.length === 0 && (filters.school_id || filters.community_id)) {
          return { assignments: [], total: 0, error: null };
        }
      }

      if (courseIds.length === 0) {
        return { assignments: [], total: 0, error: null };
      }

      // Get lessons from filtered courses
      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select(`
          id,
          title,
          order_number,
          course_id,
          created_at,
          course:courses!inner(
            id,
            title,
            description
          )
        `)
        .in('course_id', courseIds)
        .order('created_at', { ascending: false });

      if (lessonsError) throw lessonsError;

      if (!lessons || lessons.length === 0) {
        return { assignments: [], total: 0, error: null };
      }

      // Get all blocks for these lessons
      const lessonIds = lessons.map(l => l.id);
      if (lessonIds.length === 0) {
        return { assignments: [], total: 0, error: null };
      }

      const { data: blocks, error: blocksError } = await supabase
        .from('blocks')
        .select('*')
        .in('lesson_id', lessonIds)
        .in('type', ['group-assignment', 'group_assignment']);

      if (blocksError) {
        console.error('Error fetching blocks:', blocksError);
        throw blocksError;
      }

      // Build assignment objects
      const allAssignments = [];
      
      for (const block of blocks || []) {
        const lesson = lessons.find(l => l.id === block.lesson_id);
        if (!lesson) continue;

        const assignmentId = block.id;

        // Get submission stats for this assignment
        const { data: submissions } = await supabase
          .from('group_assignment_submissions')
          .select('user_id, status, group_id')
          .eq('assignment_id', assignmentId);

        // Get unique groups and students
        const uniqueGroups = new Set(submissions?.map(s => s.group_id) || []);
        const uniqueStudents = new Set(submissions?.map(s => s.user_id) || []);
        const submittedCount = submissions?.filter(s => s.status === 'submitted' || s.status === 'graded').length || 0;

        // Get community information for this assignment
        let communityInfo = null;
        let assignmentCommunities = [];

        // First try to get from existing groups
        if (uniqueGroups.size > 0) {
          const { data: groups } = await supabase
            .from('group_assignment_groups')
            .select(`
              community_id,
              community:growth_communities(
                id,
                name,
                school_id,
                generation_id,
                school:schools(id, name),
                generation:generations(id, name)
              )
            `)
            .in('id', Array.from(uniqueGroups))
            .limit(1);

          if (groups && groups[0]?.community) {
            communityInfo = groups[0].community;
            assignmentCommunities.push(communityInfo.id);
          }
        }

        // If no groups exist, determine which communities can access this course
        if (!communityInfo) {
          try {
            // Get all users assigned to this course (teachers/consultants)
            const { data: courseAssignments } = await supabase
              .from('course_assignments')
              .select('teacher_id')
              .eq('course_id', lesson.course.id);

            // Also check course enrollments
            const { data: enrollments } = await supabase
              .from('course_enrollments')
              .select('user_id')
              .eq('course_id', lesson.course.id)
              .eq('status', 'active');

            // Collect all user IDs
            const allUserIds = new Set();
            courseAssignments?.forEach(ca => allUserIds.add(ca.teacher_id));
            enrollments?.forEach(e => allUserIds.add(e.user_id));

            if (allUserIds.size > 0) {
              // Now fetch user roles and communities for these users
              const { data: userRoles } = await supabase
                .from('user_roles')
                .select(`
                  user_id,
                  community_id,
                  community:growth_communities(
                    id,
                    name,
                    school_id,
                    generation_id,
                    school:schools(id, name),
                    generation:generations(id, name)
                  )
                `)
                .in('user_id', Array.from(allUserIds))
                .eq('is_active', true);

              // Collect unique communities
              const communitiesMap = new Map();
              userRoles?.forEach(userRole => {
                if (userRole.community) {
                  const comm = userRole.community;
                  if (!communitiesMap.has(comm.id)) {
                    communitiesMap.set(comm.id, comm);
                    assignmentCommunities.push(comm.id);
                  }
                }
              });

              // Use the first community as display info if we have any
              // If we're filtering by community, try to use the filtered community
              if (communitiesMap.size > 0) {
                if (filteredCommunityIds !== null && filteredCommunityIds.length > 0) {
                  // Find a community that matches the filter
                  for (const [commId, comm] of communitiesMap) {
                    if (filteredCommunityIds.includes(commId)) {
                      communityInfo = comm;
                      break;
                    }
                  }
                  // If no matching community found in filter, use the first one
                  if (!communityInfo) {
                    communityInfo = Array.from(communitiesMap.values())[0];
                  }
                } else {
                  // No filter applied, use the first community
                  communityInfo = Array.from(communitiesMap.values())[0];
                }
              }
            }
          } catch (err) {
            console.error('Error determining communities for assignment:', err);
            // Continue without community info rather than failing completely
          }
        }

        // If we have filter criteria, check if this assignment matches
        if (filteredCommunityIds !== null) {
          // Skip if no communities match the filter
          const hasMatchingCommunity = assignmentCommunities.some(commId => 
            filteredCommunityIds.includes(commId)
          );
          
          if (!hasMatchingCommunity) {
            continue;
          }
        }

        allAssignments.push({
          id: assignmentId,
          lesson_id: lesson.id,
          lesson_title: lesson.title,
          course_id: lesson.course.id,
          course_title: lesson.course.title,
          title: block.payload?.title || 'Tarea Grupal Sin Título',
          description: block.payload?.description || '',
          instructions: block.payload?.instructions || '',
          resources: block.payload?.resources || [],
          created_at: lesson.created_at,
          groups_count: uniqueGroups.size,
          students_count: uniqueStudents.size,
          submitted_count: submittedCount,
          submission_rate: uniqueStudents.size > 0 ? Math.round((submittedCount / uniqueStudents.size) * 100) : 0,
          community: communityInfo
        });
      }

      // Apply pagination
      const paginatedAssignments = allAssignments.slice(offset, offset + limit);

      return { 
        assignments: paginatedAssignments, 
        total: allAssignments.length,
        error: null 
      };
    } catch (error) {
      console.error('Error fetching all assignments:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      return { assignments: [], total: 0, error };
    }
  }

  /**
   * Helper method to get all students in given communities
   */
  async getStudentsInCommunities(communityIds) {
    if (!communityIds || communityIds.length === 0) return [];

    try {
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('community_id', communityIds);

      return userRoles?.map(ur => ur.user_id) || [];
    } catch (error) {
      console.error('Error fetching students in communities:', error);
      return [];
    }
  }

  /**
   * Get group assignments for students that a consultant is monitoring
   * This allows consultants to see assignments their students are working on
   */
  async getGroupAssignmentsForConsultant(consultantId) {
    try {
      // First check if user is a consultant
      // Get consultant's roles from user_roles table
      const { data: consultantRoles } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', consultantId)
        .eq('is_active', true);

      // Check if user has consultant role
      const roles = consultantRoles?.map(r => r.role_type) || [];
      if (!roles.includes('consultor')) {
        return { assignments: [], students: [], error: null };
      }

      // Get all students assigned to this consultant
      const { data: studentAssignments, error: assignmentError } = await supabase
        .from('consultant_assignments')
        .select(`
          student_id,
          assignment_type,
          community_id,
          school_id,
          generation_id,
          profiles!consultant_assignments_student_id_fkey(
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq('consultant_id', consultantId)
        .eq('is_active', true);

      if (assignmentError) throw assignmentError;

      if (!studentAssignments || studentAssignments.length === 0) {
        return { assignments: [], students: [], error: null };
      }

      // Get unique student IDs
      const studentIds = [...new Set(studentAssignments.map(sa => sa.student_id))];
      
      // Get all course assignments for these students
      const { data: courseAssignments } = await supabase
        .from('course_assignments')
        .select('course_id, teacher_id')
        .in('teacher_id', studentIds);

      if (!courseAssignments || courseAssignments.length === 0) {
        return { assignments: [], students: studentAssignments, error: null };
      }

      // Get unique course IDs
      const courseIds = [...new Set(courseAssignments.map(ca => ca.course_id))];

      // Get all lessons from these courses
      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select(`
          id,
          title,
          order_number,
          created_at,
          course:courses!inner(
            id,
            title,
            description
          )
        `)
        .in('course_id', courseIds)
        .order('course_id', { ascending: true })
        .order('order_number', { ascending: true });

      if (lessonsError) throw lessonsError;

      const lessonIds = lessons?.map(lesson => lesson.id) || [];

      let lessonBlocks = [];

      if (lessonIds.length > 0) {
        const { data: fetchedLessonBlocks, error: blocksError } = await supabase
          .from('blocks')
          .select('*')
          .in('lesson_id', lessonIds)
          .in('type', ['group-assignment', 'group_assignment'])
          .order('position', { ascending: true });

        if (blocksError) throw blocksError;

        lessonBlocks = fetchedLessonBlocks || [];
      }

      const blocksByLesson = lessonBlocks.reduce((acc, block) => {
        if (!acc.has(block.lesson_id)) {
          acc.set(block.lesson_id, []);
        }
        acc.get(block.lesson_id).push(block);
        return acc;
      }, new Map());

      const groupAssignments = [];

      lessons?.forEach(lesson => {
        const blocksForLesson = blocksByLesson.get(lesson.id) || [];

        blocksForLesson.forEach((block, idx) => {
          const studentsWithAccess = courseAssignments
            .filter(ca => ca.course_id === lesson.course.id)
            .map(ca => {
              const studentInfo = studentAssignments.find(sa => sa.student_id === ca.teacher_id);
              return studentInfo?.profiles;
            })
            .filter(Boolean);

          groupAssignments.push({
            id: block.id,
            lesson_id: lesson.id,
            lesson_title: lesson.title,
            course_id: lesson.course.id,
            course_title: lesson.course.title,
            block_index: block.position ?? idx,
            title: block.payload?.title || 'Tarea Grupal Sin Título',
            description: block.payload?.description || '',
            instructions: block.payload?.instructions || '',
            resources: block.payload?.resources || [],
            created_at: lesson.created_at,
            students_with_access: studentsWithAccess
          });
        });
      });

      // Get submission status for all assignments and students
      const assignmentIds = groupAssignments.map(a => a.id);
      let submissions = [];

      if (assignmentIds.length > 0 && studentIds.length > 0) {
        const { data: fetchedSubmissions } = await supabase
          .from('group_assignment_submissions')
          .select(`
            assignment_id, 
            user_id, 
          status, 
          grade, 
          submitted_at,
          group_id
        `)
          .in('assignment_id', assignmentIds)
          .in('user_id', studentIds);

        submissions = fetchedSubmissions || [];
      }

      // Add submission data to assignments
      const assignmentsWithSubmissions = groupAssignments.map(assignment => {
        const assignmentSubmissions = submissions?.filter(s => s.assignment_id === assignment.id) || [];
        
        // Group submissions by group_id
        const groupedSubmissions = {};
        assignmentSubmissions.forEach(submission => {
          if (!groupedSubmissions[submission.group_id]) {
            groupedSubmissions[submission.group_id] = [];
          }
          groupedSubmissions[submission.group_id].push(submission);
        });

        return {
          ...assignment,
          submissions: assignmentSubmissions,
          groups_count: Object.keys(groupedSubmissions).length,
          submitted_count: assignmentSubmissions.filter(s => s.status === 'submitted' || s.status === 'graded').length,
          students_count: assignment.students_with_access.length
        };
      });

      return { 
        assignments: assignmentsWithSubmissions, 
        students: studentAssignments,
        error: null 
      };
    } catch (error) {
      console.error('Error fetching consultant assignments:', error);
      return { assignments: [], students: [], error };
    }
  }

  /**
   * Get assignment settings to check if it's consultant-managed
   */
  async getAssignmentSettings(assignmentId) {
    try {
      const { data, error } = await supabase
        .from('group_assignment_settings')
        .select('*')
        .eq('assignment_id', assignmentId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

      return { settings: data, error: null };
    } catch (error) {
      console.error('Error fetching assignment settings:', error);
      return { settings: null, error };
    }
  }

  /**
   * Get discussion thread metadata and message count for a group assignment
   */
  async getDiscussionStats(assignmentId, groupId) {
    try {
      const { data: mapping, error: mappingError } = await supabase
        .from('group_assignment_discussions')
        .select('thread_id')
        .eq('assignment_id', assignmentId)
        .eq('group_id', groupId)
        .maybeSingle();

      if (mappingError && mappingError.code !== 'PGRST116') {
        throw mappingError;
      }

      if (!mapping?.thread_id) {
        return { threadId: null, commentCount: 0, error: null };
      }

      const { count, error: countError } = await supabase
        .from('community_messages')
        .select('*', { count: 'exact', head: true })
        .eq('thread_id', mapping.thread_id)
        .eq('is_deleted', false);

      if (countError) throw countError;

      return { threadId: mapping.thread_id, commentCount: count || 0, error: null };
    } catch (error) {
      console.error('Error getting discussion stats for assignment:', error);
      return { threadId: null, commentCount: 0, error };
    }
  }

  /**
   * Update assignment settings (consultant only)
   */
  async updateAssignmentSettings(assignmentId, settings, userId) {
    try {
      const { data, error } = await supabase
        .from('group_assignment_settings')
        .upsert({
          assignment_id: assignmentId,
          ...settings,
          created_by: userId,
          updated_at: new Date().toISOString()
        })
        .select()
        .maybeSingle();

      if (error) throw error;

      return { settings: data, error: null };
    } catch (error) {
      console.error('Error updating assignment settings:', error);
      return { settings: null, error };
    }
  }

  /**
   * Create a consultant-managed group
   */
  async createConsultantGroup(assignmentId, communityId, groupData, consultantId) {
    try {
      const { data: group, error: groupError } = await supabase
        .from('group_assignment_groups')
        .insert({
          assignment_id: assignmentId,
          community_id: communityId,
          name: groupData.name,
          created_by: consultantId,
          is_consultant_managed: true,
          max_members: groupData.max_members || 8
        })
        .select()
        .single();

      if (groupError) throw groupError;

      return { group, error: null };
    } catch (error) {
      console.error('Error creating consultant group:', error);
      return { group: null, error };
    }
  }

  /**
   * Add student to consultant-managed group
   */
  async addStudentToGroup(groupId, studentId, assignmentId, role = 'member') {
    try {
      // Check if group is consultant-managed
      const { data: group } = await supabase
        .from('group_assignment_groups')
        .select('is_consultant_managed, max_members')
        .eq('id', groupId)
        .single();

      if (!group?.is_consultant_managed) {
        throw new Error('This method is only for consultant-managed groups');
      }

      // Check current member count
      const { count } = await supabase
        .from('group_assignment_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId);

      if (count >= group.max_members) {
        throw new Error(`Este grupo ha alcanzado el límite máximo de ${group.max_members} miembros`);
      }

      // Add the member
      const { data, error } = await supabase
        .from('group_assignment_members')
        .insert({
          group_id: groupId,
          assignment_id: assignmentId,
          user_id: studentId,
          role: role
        })
        .select()
        .single();

      if (error) throw error;

      return { member: data, error: null };
    } catch (error) {
      console.error('Error adding student to group:', error);
      return { member: null, error };
    }
  }

  /**
   * Remove student from consultant-managed group
   */
  async removeStudentFromGroup(groupId, studentId) {
    try {
      const { error } = await supabase
        .from('group_assignment_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', studentId);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error) {
      console.error('Error removing student from group:', error);
      return { success: false, error };
    }
  }

  /**
   * Get all groups for an assignment in a community (consultant view)
   */
  async getGroupsForAssignment(assignmentId, communityId) {
    try {
      const { data: groups, error } = await supabase
        .from('group_assignment_groups')
        .select(`
          *,
          members:group_assignment_members(
            *,
            user:profiles(
              id,
              first_name,
              last_name,
              email,
              avatar_url
            )
          ),
          submissions:group_assignment_submissions(
            status,
            submitted_at
          )
        `)
        .eq('assignment_id', assignmentId)
        .eq('community_id', communityId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Calculate stats for each group
      const groupsWithStats = groups?.map(group => {
        const submittedCount = group.submissions?.filter(s => 
          s.status === 'submitted' || s.status === 'graded'
        ).length || 0;
        
        return {
          ...group,
          member_count: group.members?.length || 0,
          submitted_count: submittedCount,
          submission_rate: group.members?.length > 0 
            ? Math.round((submittedCount / group.members.length) * 100) 
            : 0
        };
      }) || [];

      return { groups: groupsWithStats, error: null };
    } catch (error) {
      console.error('Error fetching groups for assignment:', error);
      return { groups: [], error };
    }
  }

  /**
   * Get available students for group assignment (not yet in a group)
   */
  async getAvailableStudentsForGroup(assignmentId, communityId) {
    try {
      // Get all students in the community
      const { data: communityMembers } = await supabase
        .from('user_roles')
        .select(`
          user_id,
          user:profiles(
            id,
            first_name,
            last_name,
            email,
            avatar_url
          )
        `)
        .eq('community_id', communityId)
        .eq('is_active', true);

      if (!communityMembers || communityMembers.length === 0) {
        return { students: [], error: null };
      }

      // Get students already in a group for this assignment
      const { data: groupMembers } = await supabase
        .from('group_assignment_members')
        .select('user_id')
        .eq('assignment_id', assignmentId);

      const assignedUserIds = groupMembers?.map(m => m.user_id) || [];

      // Filter out assigned students
      const availableStudents = communityMembers
        .filter(member => !assignedUserIds.includes(member.user_id))
        .map(member => member.user);

      return { students: availableStudents, error: null };
    } catch (error) {
      console.error('Error fetching available students:', error);
      return { students: [], error };
    }
  }

  /**
   * @deprecated This method is deprecated and should not be used in new code.
   * Use the API endpoint /api/assignments/eligible-classmates instead, which
   * provides school-based filtering + course enrollment verification.
   *
   * Get eligible classmates for a student to invite to their group
   * Filters by same community, excludes already grouped students and self
   */
  async getEligibleClassmatesForAssignment(assignmentId, userId, communityId) {
    try {
      // Get all students in the same community
      const { data: communityMembers, error: membersError } = await supabase
        .from('user_roles')
        .select(`
          user_id,
          user:profiles(
            id,
            first_name,
            last_name,
            email,
            avatar_url
          )
        `)
        .eq('community_id', communityId)
        .eq('is_active', true)
        .neq('user_id', userId); // Exclude self

      if (membersError) throw membersError;

      if (!communityMembers || communityMembers.length === 0) {
        return { classmates: [], error: null };
      }

      // Get students already in ANY group for this assignment
      const { data: groupMembers, error: groupError } = await supabase
        .from('group_assignment_members')
        .select('user_id')
        .eq('assignment_id', assignmentId);

      if (groupError) throw groupError;

      const assignedUserIds = groupMembers?.map(m => m.user_id) || [];

      // Filter out self and already-assigned students
      const eligibleClassmates = communityMembers
        .filter(member =>
          member.user_id !== userId &&
          !assignedUserIds.includes(member.user_id)
        )
        .map(member => ({
          id: member.user?.id || member.user_id,
          first_name: member.user?.first_name,
          last_name: member.user?.last_name,
          full_name: member.user
            ? `${member.user.first_name || ''} ${member.user.last_name || ''}`.trim() || 'Usuario desconocido'
            : 'Usuario desconocido',
          email: member.user?.email,
          avatar_url: member.user?.avatar_url
        }));

      return { classmates: eligibleClassmates, error: null };
    } catch (error) {
      console.error('Error fetching eligible classmates:', error);
      return { classmates: [], error };
    }
  }

  /**
   * Add classmates to a group (student-initiated)
   * Validates group size, permissions, and creates member records
   */
  async addClassmatesToGroup(groupId, assignmentId, userIds, addedByUserId) {
    try {
      // Validate group exists and get details
      const { data: group, error: groupError } = await supabase
        .from('group_assignment_groups')
        .select('is_consultant_managed, max_members, community_id')
        .eq('id', groupId)
        .single();

      if (groupError) throw groupError;

      // Check if consultant-managed (students can't add to these)
      if (group?.is_consultant_managed) {
        return {
          members: null,
          error: new Error('No puedes agregar compañeros a un grupo administrado por el consultor')
        };
      }

      // Check current member count
      const { count, error: countError } = await supabase
        .from('group_assignment_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId);

      if (countError) throw countError;

      const maxMembers = group.max_members || 8;
      if (count + userIds.length > maxMembers) {
        return {
          members: null,
          error: new Error(`El grupo alcanzaría el límite de ${maxMembers} miembros`)
        };
      }

      // Insert all new members
      const members = userIds.map(userId => ({
        group_id: groupId,
        assignment_id: assignmentId,
        user_id: userId,
        role: 'member',
        added_by: addedByUserId
      }));

      const { data, error: insertError } = await supabase
        .from('group_assignment_members')
        .insert(members)
        .select();

      if (insertError) throw insertError;

      // Send notifications to added classmates
      await this.notifyClassmatesAdded(groupId, assignmentId, userIds, addedByUserId);

      return { members: data, error: null };
    } catch (error) {
      console.error('Error adding classmates to group:', error);
      return { members: null, error };
    }
  }

  /**
   * Notify classmates that they've been added to a group
   */
  async notifyClassmatesAdded(groupId, assignmentId, userIds, addedByUserId) {
    try {
      // Get the user who added them
      const { data: adderProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', addedByUserId)
        .single();

      const adderName = adderProfile
        ? `${adderProfile.first_name || ''} ${adderProfile.last_name || ''}`.trim()
        : 'Un compañero';

      // Get assignment details
      const { assignment } = await this.getGroupAssignment(assignmentId);

      const notifications = userIds.map(userId => ({
        user_id: userId,
        type: 'group_invitation',
        title: 'Te agregaron a un grupo',
        message: `${adderName} te agregó a su grupo para la tarea "${assignment?.title || 'Sin título'}"`,
        data: {
          assignment_id: assignmentId,
          group_id: groupId,
          added_by: addedByUserId
        },
        created_at: new Date().toISOString()
      }));

      await supabase
        .from('notifications')
        .insert(notifications);

    } catch (error) {
      console.error('Error sending classmate notifications:', error);
      // Don't throw - notifications are non-critical
    }
  }
}

export const groupAssignmentsV2Service = new GroupAssignmentsV2Service();
