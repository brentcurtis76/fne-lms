import { supabase } from '../supabase-wrapper';

class GroupAssignmentsV2Service {
  /**
   * Get all group assignments for a user's enrolled courses
   * This fetches group assignment blocks directly from lessons in assigned courses
   */
  async getGroupAssignmentsForUser(userId) {
    try {
      // First get the user's profile to determine their community
      const { data: profile, error: profileError } = await supabase
        .from('user_roles')
        .select('community_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (profileError) {
        // Try getting from profiles table instead
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
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
      if (courseIds.length === 0 && profile) {
        // Get user's community
        const { data: userRole } = await supabase
          .from('user_roles')
          .select('community_id')
          .eq('user_id', userId)
          .eq('is_active', true)
          .single();
        
        if (userRole?.community_id) {
          // Find consultants assigned to this community
          const { data: consultantAssignments } = await supabase
            .from('consultant_assignments')
            .select('consultant_id')
            .eq('community_id', userRole.community_id)
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
      const { data: blocks, error: blocksError } = await supabase
        .from('blocks')
        .select('*')
        .in('lesson_id', lessonIds)
        .order('position', { ascending: true });

      if (blocksError) {
        console.error('Error fetching blocks:', blocksError);
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
      const { data: submissions } = await supabase
        .from('group_assignment_submissions')
        .select('assignment_id, status, grade')
        .eq('user_id', userId)
        .in('assignment_id', assignmentIds);

      // Merge submission data with assignments
      const assignmentsWithStatus = groupAssignments.map(assignment => {
        const submission = submissions?.find(s => s.assignment_id === assignment.id);
        return {
          ...assignment,
          status: submission?.status || 'pending',
          grade: submission?.grade || null
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
      // Parse the assignment ID to get lesson ID and block index
      const [lessonId, , blockIndex] = assignmentId.split('_');
      
      const { data: lesson, error: lessonError } = await supabase
        .from('lessons')
        .select(`
          id,
          title,
          course:courses!inner(
            id,
            title,
            description
          )
        `)
        .eq('id', lessonId)
        .single();

      if (lessonError) throw lessonError;

      // Get blocks for this lesson from the blocks table
      const { data: blocks, error: blocksError } = await supabase
        .from('blocks')
        .select('*')
        .eq('lesson_id', lessonId)
        .order('position', { ascending: true });

      if (blocksError) throw blocksError;

      const block = blocks?.[parseInt(blockIndex)];
      if (!block || (block.type !== 'group-assignment' && block.type !== 'group_assignment')) {
        throw new Error('Group assignment block not found');
      }

      return {
        assignment: {
          id: assignmentId,
          lesson_id: lesson.id,
          lesson_title: lesson.title,
          course_id: lesson.course.id,
          course_title: lesson.course.title,
          block_index: parseInt(blockIndex),
          title: block.payload?.title || 'Tarea Grupal Sin Título',
          description: block.payload?.description || '',
          instructions: block.payload?.instructions || '',
          resources: block.payload?.resources || [],
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
      const { data: existingMember } = await supabase
        .from('group_assignment_members')
        .select(`
          group_id,
          group:group_assignment_groups!inner(*)
        `)
        .eq('assignment_id', assignmentId)
        .eq('user_id', userId)
        .single();

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
      const { data: profile } = await supabase
        .from('user_roles')
        .select('community_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (!profile?.community_id) {
        throw new Error('User community not found');
      }

      // Auto-create a new group (existing behavior)
      const { data: newGroup, error: groupError } = await supabase
        .from('group_assignment_groups')
        .insert({
          assignment_id: assignmentId,
          community_id: profile.community_id,
          name: `Grupo ${Date.now()}`,
          is_consultant_managed: false
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add user as member
      const { error: memberError } = await supabase
        .from('group_assignment_members')
        .insert({
          group_id: newGroup.id,
          assignment_id: assignmentId,
          user_id: userId,
          role: 'member'
        });

      if (memberError) throw memberError;

      return { group: newGroup, error: null };
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
        if (profiles) {
          members.forEach(member => {
            const profile = profiles.find(p => p.id === member.user_id);
            if (profile) {
              member.profile = profile;
            }
          });
        }
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
      // Get all group members
      const { data: members } = await supabase
        .from('group_assignment_members')
        .select('user_id')
        .eq('group_id', groupId);

      if (!members || members.length === 0) {
        throw new Error('No group members found');
      }

      // Create submission records for all group members
      const submissions = members.map(member => ({
        assignment_id: assignmentId,
        group_id: groupId,
        user_id: member.user_id,
        content: submissionData.content || '',
        file_url: submissionData.file_url || null,
        status: 'submitted',
        submitted_at: new Date().toISOString()
      }));

      const { error: submissionError } = await supabase
        .from('group_assignment_submissions')
        .upsert(submissions, {
          onConflict: 'assignment_id,user_id'
        });

      if (submissionError) throw submissionError;

      // Notify consultants assigned to the community
      await this.notifyConsultants(assignmentId, groupId);

      return { success: true, error: null };
    } catch (error) {
      console.error('Error submitting group assignment:', error);
      return { success: false, error };
    }
  }

  /**
   * Notify consultants about assignment submission
   */
  async notifyConsultants(assignmentId, groupId) {
    try {
      // Get assignment details
      const { assignment } = await this.getGroupAssignment(assignmentId);
      if (!assignment) return;

      // Get group details
      const { data: group } = await supabase
        .from('group_assignment_groups')
        .select('community_id, name')
        .eq('id', groupId)
        .single();

      if (!group) return;

      // Get consultants assigned to this community
      const { data: consultantAssignments } = await supabase
        .from('consultant_assignments')
        .select('consultant_id')
        .eq('assigned_entity_id', group.community_id)
        .eq('assigned_entity_type', 'community');

      if (!consultantAssignments || consultantAssignments.length === 0) return;

      // Create notifications for each consultant
      const notifications = consultantAssignments.map(ca => ({
        user_id: ca.consultant_id,
        type: 'group_assignment_submitted',
        title: 'Nueva tarea grupal entregada',
        message: `El ${group.name} ha entregado la tarea "${assignment.title}" del curso ${assignment.course_title}`,
        data: {
          assignment_id: assignmentId,
          group_id: groupId,
          course_id: assignment.course_id
        }
      }));

      await supabase
        .from('notifications')
        .insert(notifications);

    } catch (error) {
      console.error('Error notifying consultants:', error);
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
          content,
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

      // Extract group assignment blocks
      const groupAssignments = [];
      
      lessons?.forEach(lesson => {
        if (lesson.content?.blocks) {
          lesson.content.blocks.forEach((block, blockIndex) => {
            if (block.type === 'group-assignment' || block.type === 'group_assignment') {
              // For each assignment, track which students have access
              const studentsWithAccess = courseAssignments
                .filter(ca => ca.course_id === lesson.course.id)
                .map(ca => {
                  const studentInfo = studentAssignments.find(sa => sa.student_id === ca.teacher_id);
                  return studentInfo?.profiles;
                })
                .filter(Boolean);

              // Note: Using composite ID for backward compatibility with legacy content blocks
              // These blocks don't have their own UUIDs like the new blocks table
              groupAssignments.push({
                id: `${lesson.id}_block_${blockIndex}`,
                lesson_id: lesson.id,
                lesson_title: lesson.title,
                course_id: lesson.course.id,
                course_title: lesson.course.title,
                block_index: blockIndex,
                title: block.payload?.title || 'Tarea Grupal Sin Título',
                description: block.payload?.description || '',
                instructions: block.payload?.instructions || '',
                resources: block.payload?.resources || [],
                created_at: lesson.created_at,
                students_with_access: studentsWithAccess
              });
            }
          });
        }
      });

      // Get submission status for all assignments and students
      const assignmentIds = groupAssignments.map(a => a.id);
      const { data: submissions } = await supabase
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
}

export const groupAssignmentsV2Service = new GroupAssignmentsV2Service();