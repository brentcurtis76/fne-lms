import { supabase } from '../supabase-wrapper';

export const simplifiedGroupAssignmentService = {
  // Create or update a group assignment from a lesson block
  async saveGroupAssignmentFromBlock(blockData, courseId, lessonId, communityId) {
    try {
      // Check if assignment already exists for this block
      let assignmentId = blockData.assignment_id;
      
      if (assignmentId) {
        // Update existing assignment
        const { data, error } = await supabase
          .from('lesson_assignments')
          .update({
            title: blockData.title,
            description: blockData.instructions,
            due_date: blockData.due_date || null,
            points: blockData.points || 0,
            group_assignments: blockData.groups || [],
            updated_at: new Date().toISOString()
          })
          .eq('id', assignmentId)
          .select()
          .single();
          
        if (error) throw error;
        return data;
      } else {
        // Create new assignment
        const { data, error } = await supabase
          .from('lesson_assignments')
          .insert({
            course_id: courseId,
            lesson_id: lessonId,
            title: blockData.title,
            description: blockData.instructions,
            due_date: blockData.due_date || null,
            points: blockData.points || 0,
            is_published: true,
            assignment_for: 'group',
            assignment_type: 'group',
            assigned_to_community_id: communityId,
            group_assignments: blockData.groups || [],
            created_by: (await supabase.auth.getUser()).data.user?.id
          })
          .select()
          .single();
          
        if (error) throw error;
        return data;
      }
    } catch (error) {
      console.error('Error saving group assignment:', error);
      throw error;
    }
  },

  // Get community ID for a course
  async getCommunityIdForCourse(courseId) {
    try {
      // First check if there's a direct community assignment for this course
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('community_id')
        .eq('id', courseId)
        .single();
        
      if (!courseError && courseData?.community_id) {
        return courseData.community_id;
      }
      
      // If no direct assignment, get the first community that has access to this course
      const { data: communities, error } = await supabase
        .from('community_courses')
        .select('community_id')
        .eq('course_id', courseId)
        .limit(1);
        
      if (error) throw error;
      
      return communities?.[0]?.community_id || null;
    } catch (error) {
      console.error('Error getting community for course:', error);
      return null;
    }
  },

  // Delete a group assignment
  async deleteGroupAssignment(assignmentId) {
    try {
      const { error } = await supabase
        .from('lesson_assignments')
        .delete()
        .eq('id', assignmentId);
        
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting group assignment:', error);
      throw error;
    }
  }
};

export default simplifiedGroupAssignmentService;