/**
 * User Assignments Service
 * Handles assignment aggregation across multiple Growth Communities
 * and collaborative submission functionality
 * FIXED: Now uses lesson_assignments + lesson_assignment_submissions (correct pipeline)
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface Assignment {
  id: string;
  assignment_id: string;
  title: string;
  description?: string;
  instructions?: string;
  resources?: Array<{
    id: string;
    title: string;
    description?: string;
    url: string;
    type: 'link' | 'file';
  }>;
  course_id: string;
  lesson_id?: string;
  course_title?: string;
  lesson_title?: string;
  due_date?: string;
  points?: number;
  assignment_type: string;
  community_id?: string;
  community_name?: string;
  school_name?: string;
  generation_name?: string;
  status?: 'pending' | 'submitted' | 'graded';
  submission_id?: string;
  submitted_at?: string;
  score?: number;
  feedback?: string;
  is_original?: boolean;
  submitted_by?: string;
  submitter_name?: string;
  file_url?: string;
  content?: string;
  submission_text?: string;
}

export interface CommunityMember {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  has_submitted?: boolean;
}

export interface CollaborativeSubmissionParams {
  assignmentId: string;
  submitterId: string;
  communityId?: string;
  content?: string;
  fileUrl?: string;
  sharedWithUserIds: string[];
}

export interface SubmissionResult {
  success: boolean;
  submissionId?: string;
  sharedCount?: number;
  error?: string;
}

class UserAssignmentsService {
  /**
   * Get all assignments for a user across all their courses
   * FIXED: Now mirrors the logic from assignmentService.getStudentAssignments()
   * NOTE: This fetches from lesson_assignments table (legacy individual assignments)
   * For group assignments, use groupAssignmentsV2Service directly from the client.
   */
  async getAllUserAssignments(
    supabase: SupabaseClient,
    userId: string
  ): Promise<Assignment[]> {
    try {
      console.log('[UserAssignments] Getting assignments for user:', userId);

      // Step 1: Get student's enrolled courses (active only)
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('course_enrollments')
        .select('course_id')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (enrollmentsError) throw enrollmentsError;

      if (!enrollments || enrollments.length === 0) {
        console.log('[UserAssignments] Student has no enrolled courses');
        return [];
      }

      const courseIds = enrollments.map((e) => e.course_id);
      console.log('[UserAssignments] Found course IDs:', courseIds);

      // Step 2: Get published assignments from enrolled courses (same as legacy)
      const { data: assignments, error: assignmentsError } = await supabase
        .from('lesson_assignments')
        .select(`
          *,
          courses!inner (
            id,
            title
          ),
          lessons (
            id,
            title
          )
        `)
        .in('course_id', courseIds)
        .eq('is_published', true)
        .order('due_date', { ascending: true });

      console.log('[UserAssignments] Assignments query result:', {
        count: assignments?.length,
        error: assignmentsError
      });

      if (assignmentsError) throw assignmentsError;

      // Step 3: Get submissions for this student (including shared ones)
      const { data: submissions, error: submissionsError } = await supabase
        .from('lesson_assignment_submissions')
        .select(`
          id,
          assignment_id,
          student_id,
          status,
          score,
          submitted_at,
          is_late,
          attachment_urls,
          content,
          feedback,
          is_original,
          submitted_by,
          profiles:submitted_by(first_name, last_name, name)
        `)
        .eq('student_id', userId);

      if (submissionsError) throw submissionsError;

      // Create submission map
      const submissionMap: Record<string, any> = {};
      submissions?.forEach((sub) => {
        submissionMap[sub.assignment_id] = sub;
      });

      // Step 4: Combine assignments with submission status
      const result: Assignment[] = (assignments || []).map((a) => {
        const submission = submissionMap[a.id];

        // Build submitter name from profiles data (name, or first_name + last_name)
        let submitterName = null;
        if (submission?.profiles) {
          const profile = submission.profiles;
          submitterName = profile.name ||
                         (profile.first_name && profile.last_name
                           ? `${profile.first_name} ${profile.last_name}`.trim()
                           : profile.first_name || profile.last_name || null);
        }

        return {
          id: a.id,
          assignment_id: a.id,
          title: a.title,
          description: a.description,
          course_id: a.course_id,
          lesson_id: a.lesson_id,
          course_title: a.courses?.title,
          lesson_title: a.lessons?.title,
          due_date: a.due_date,
          points: a.points,
          assignment_type: a.assignment_type,
          status: submission
            ? submission.status === 'graded'
              ? 'graded'
              : 'submitted'
            : 'pending',
          submission_id: submission?.id,
          submitted_at: submission?.submitted_at,
          score: submission?.score,
          feedback: submission?.feedback,
          is_original: submission?.is_original,
          submitted_by: submission?.submitted_by,
          submitter_name: submitterName,
          file_url: submission?.attachment_urls?.[0] || null,
          content: submission?.content,
          submission_text: submission?.content // Legacy compatibility
        };
      });

      console.log('[UserAssignments] Returning', result.length, 'assignments');
      return result;
    } catch (error) {
      console.error('[UserAssignments] Error fetching assignments:', error);
      throw error;
    }
  }

  /**
   * Get community members eligible for collaborative submission
   * Excludes users who have already submitted the assignment
   * FIXED: Now queries lesson_assignment_submissions
   */
  async getShareableMembers(
    supabase: SupabaseClient,
    assignmentId: string,
    communityId: string,
    excludeUserId?: string
  ): Promise<CommunityMember[]> {
    try {
      // Get all active members of the community (excluding consultants and admins)
      const { data: members, error: membersError } = await supabase
        .from('user_roles')
        .select(`
          user_id,
          profiles:user_id(id, email, name, first_name, last_name, avatar_url)
        `)
        .eq('community_id', communityId)
        .eq('is_active', true)
        .not('role_type', 'in', '(consultor,admin,equipo_directivo,lider_generacion)');

      if (membersError) throw membersError;

      // Get users who have already submitted this assignment
      const { data: submissions } = await supabase
        .from('lesson_assignment_submissions')
        .select('student_id')
        .eq('assignment_id', assignmentId);

      const submittedUserIds = new Set(submissions?.map((s) => s.student_id) || []);

      // Filter out users who have submitted and the current user
      const eligible = members
        ?.filter((m) => {
          const profile = m.profiles as any;
          return (
            profile &&
            !submittedUserIds.has(profile.id) &&
            profile.id !== excludeUserId
          );
        })
        .map((m) => {
          const profile = m.profiles as any;
          // Build full_name from available fields
          const fullName = profile.name ||
                          (profile.first_name && profile.last_name
                            ? `${profile.first_name} ${profile.last_name}`.trim()
                            : profile.first_name || profile.last_name || null);
          return {
            id: profile.id,
            email: profile.email,
            full_name: fullName,
            avatar_url: profile.avatar_url,
            has_submitted: false
          };
        });

      return eligible || [];
    } catch (error) {
      console.error('Error fetching shareable members:', error);
      throw error;
    }
  }

  /**
   * Check if a user already has a submission for an assignment
   * (either as original submitter or as a recipient of a shared submission)
   * FIXED: Now queries lesson_assignment_submissions
   */
  async hasExistingSubmission(
    supabase: SupabaseClient,
    userId: string,
    assignmentId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('lesson_assignment_submissions')
        .select('id')
        .eq('student_id', userId)
        .eq('assignment_id', assignmentId)
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found" which is fine
        throw error;
      }

      return !!data;
    } catch (error) {
      console.error('Error checking existing submission:', error);
      return false;
    }
  }

  /**
   * Create a collaborative submission
   * Creates original submission + derived submissions for each shared user
   * FIXED: Now creates records in lesson_assignment_submissions
   */
  async createCollaborativeSubmission(
    supabase: SupabaseClient,
    params: CollaborativeSubmissionParams
  ): Promise<SubmissionResult> {
    try {
      const {
        assignmentId,
        submitterId,
        content,
        fileUrl,
        sharedWithUserIds
      } = params;

      console.log('[UserAssignments] Creating collaborative submission:', {
        assignmentId,
        submitterId,
        sharedCount: sharedWithUserIds.length
      });

      // Validation: Check if submitter already has a submission
      const hasSubmission = await this.hasExistingSubmission(
        supabase,
        submitterId,
        assignmentId
      );

      if (hasSubmission) {
        return {
          success: false,
          error: 'Ya has enviado este trabajo anteriormente'
        };
      }

      // Validation: Check all shared users don't have submissions
      for (const userId of sharedWithUserIds) {
        const userHasSubmission = await this.hasExistingSubmission(
          supabase,
          userId,
          assignmentId
        );
        if (userHasSubmission) {
          // Get user name for error message
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, first_name, last_name, email')
            .eq('id', userId)
            .single();

          const userName = profile?.name ||
                          (profile?.first_name && profile?.last_name
                            ? `${profile.first_name} ${profile.last_name}`.trim()
                            : profile?.first_name || profile?.last_name) ||
                          profile?.email ||
                          'Un usuario';

          return {
            success: false,
            error: `${userName} ya ha enviado este trabajo`
          };
        }
      }

      // Create original submission
      const { data: originalSubmission, error: submissionError } = await supabase
        .from('lesson_assignment_submissions')
        .insert({
          assignment_id: assignmentId,
          student_id: submitterId,
          submitted_by: submitterId,
          content: content || null,
          attachment_urls: fileUrl ? [fileUrl] : [],
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          is_original: true,
          source_submission_id: null
        })
        .select()
        .single();

      if (submissionError) {
        console.error('[UserAssignments] Error creating original submission:', submissionError);
        throw submissionError;
      }

      console.log('[UserAssignments] Created original submission:', originalSubmission.id);

      // Create derived submissions for shared users
      let sharedCount = 0;
      for (const userId of sharedWithUserIds) {
        // Create derived submission
        const { error: derivedError } = await supabase
          .from('lesson_assignment_submissions')
          .insert({
            assignment_id: assignmentId,
            student_id: userId,
            submitted_by: submitterId,
            content: content || null,
            attachment_urls: fileUrl ? [fileUrl] : [],
            status: 'submitted',
            submitted_at: new Date().toISOString(),
            is_original: false,
            source_submission_id: originalSubmission.id
          });

        if (derivedError) {
          console.error('[UserAssignments] Error creating derived submission:', derivedError);
          continue;
        }

        // Create share audit record
        const { error: shareError } = await supabase
          .from('assignment_submission_shares')
          .insert({
            source_submission_id: originalSubmission.id,
            shared_with_user_id: userId,
            community_id: params.communityId || null
          });

        if (shareError) {
          console.error('[UserAssignments] Error creating share audit:', shareError);
        }

        sharedCount++;
      }

      console.log('[UserAssignments] Created', sharedCount, 'derived submissions');

      return {
        success: true,
        submissionId: originalSubmission.id,
        sharedCount
      };
    } catch (error) {
      console.error('[UserAssignments] Error creating collaborative submission:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }

  /**
   * Update an existing submission (only original submitter can do this)
   * Updates are cascaded to derived submissions via database trigger
   */
  async updateSubmission(
    supabase: SupabaseClient,
    submissionId: string,
    userId: string,
    content?: string,
    fileUrl?: string
  ): Promise<SubmissionResult> {
    try {
      // Verify user is the original submitter
      const { data: submission, error: checkError } = await supabase
        .from('lesson_assignment_submissions')
        .select('submitted_by, is_original')
        .eq('id', submissionId)
        .single();

      if (checkError) throw checkError;

      if (submission.submitted_by !== userId || !submission.is_original) {
        return {
          success: false,
          error: 'No tienes permiso para editar este trabajo'
        };
      }

      // Update submission (trigger will cascade to derived submissions)
      const { error: updateError } = await supabase
        .from('lesson_assignment_submissions')
        .update({
          content: content || null,
          attachment_urls: fileUrl ? [fileUrl] : []
        })
        .eq('id', submissionId);

      if (updateError) throw updateError;

      return {
        success: true,
        submissionId
      };
    } catch (error) {
      console.error('Error updating submission:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }
}

// Export singleton instance
export const userAssignmentsService = new UserAssignmentsService();
