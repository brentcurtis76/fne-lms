import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Upload, Calendar, Users, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface SimplifiedGroupAssignmentsProps {
  communityId: string;
  userId: string;
}

interface GroupAssignmentData {
  assignment_id: string;
  title: string;
  description: string;
  due_date: string;
  points: number;
  course_title: string;
  lesson_title: string;
  group_data: {
    group_id: string;
    group_name: string;
    members: Array<{
      user_id: string;
      name: string;
      email: string;
    }>;
    submission?: {
      submitted_by: string;
      submitted_at: string;
      file_url: string;
      status: string;
    };
  };
}

const SimplifiedGroupAssignments: React.FC<SimplifiedGroupAssignmentsProps> = ({ communityId, userId }) => {
  const supabase = createClientComponentClient();
  const [assignments, setAssignments] = useState<GroupAssignmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    loadGroupAssignments();
  }, [communityId, userId]);

  const loadGroupAssignments = async () => {
    try {
      setLoading(true);
      
      // Use the database function to get user's group assignments
      const { data, error } = await supabase
        .rpc('get_user_group_assignments', {
          p_user_id: userId,
          p_community_id: communityId
        });

      if (error) throw error;

      // Fetch additional course and lesson data
      const enrichedData = await Promise.all(
        (data || []).map(async (assignment: any) => {
          const { data: courseData } = await supabase
            .from('courses')
            .select('title')
            .eq('id', assignment.course_id)
            .single();

          const { data: lessonData } = await supabase
            .from('lessons')
            .select('title')
            .eq('id', assignment.lesson_id)
            .single();

          return {
            ...assignment,
            course_title: courseData?.title || 'Curso',
            lesson_title: lessonData?.title || 'Lección'
          };
        })
      );

      setAssignments(enrichedData);
    } catch (error) {
      console.error('Error loading group assignments:', error);
      toast.error('Error al cargar las tareas grupales');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (assignmentId: string, groupId: string, file: File) => {
    if (!file) return;

    try {
      setUploading(assignmentId);

      // Upload file to Supabase storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${assignmentId}/${groupId}/${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('assignment-submissions')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('assignment-submissions')
        .getPublicUrl(fileName);

      // Update the assignment's group_assignments JSON with submission data
      const assignment = assignments.find(a => a.assignment_id === assignmentId);
      if (!assignment) return;

      const { data: currentAssignment } = await supabase
        .from('lesson_assignments')
        .select('group_assignments')
        .eq('id', assignmentId)
        .single();

      const updatedGroups = currentAssignment.group_assignments.map((group: any) => {
        if (group.group_id === groupId) {
          return {
            ...group,
            submission: {
              submitted_by: userId,
              submitted_at: new Date().toISOString(),
              file_url: publicUrl,
              status: 'submitted'
            }
          };
        }
        return group;
      });

      const { error: updateError } = await supabase
        .from('lesson_assignments')
        .update({ group_assignments: updatedGroups })
        .eq('id', assignmentId);

      if (updateError) throw updateError;

      toast.success('Trabajo enviado exitosamente');
      await loadGroupAssignments();
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Error al enviar el trabajo');
    } finally {
      setUploading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No tienes tareas grupales
        </h3>
        <p className="text-gray-500">
          Las tareas grupales asignadas aparecerán aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#0a0a0a] mb-2">
          Mis Tareas Grupales
        </h2>
        <p className="text-sm text-gray-600">
          Trabajo colaborativo con tu grupo asignado
        </p>
      </div>

      <div className="space-y-4">
        {assignments.map((assignment) => {
          const isSubmitted = !!assignment.group_data.submission;
          const isOverdue = assignment.due_date && new Date(assignment.due_date) < new Date();
          const otherMembers = assignment.group_data.members.filter(m => m.user_id !== userId);

          return (
            <div key={assignment.assignment_id} className="bg-white rounded-lg shadow-md p-6">
              {/* Assignment Header */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{assignment.title}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {assignment.course_title} - {assignment.lesson_title}
                </p>
              </div>

              {/* Group Info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="flex items-start">
                  <Users className="h-5 w-5 text-brand_blue mt-0.5 mr-2 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{assignment.group_data.group_name}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Tu grupo: Tú
                      {otherMembers.map((member, index) => (
                        <span key={member.user_id}>
                          {index === otherMembers.length - 1 ? ' y ' : ', '}
                          {member.name}
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
              </div>

              {/* Assignment Details */}
              {assignment.description && (
                <p className="text-gray-600 mb-4">{assignment.description}</p>
              )}

              <div className="flex items-center space-x-6 text-sm text-gray-500 mb-4">
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  <span className={isOverdue && !isSubmitted ? 'text-red-600 font-medium' : ''}>
                    Fecha límite: {assignment.due_date 
                      ? new Date(assignment.due_date).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })
                      : 'Sin fecha límite'
                    }
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="font-medium">{assignment.points} puntos</span>
                </div>
              </div>

              {/* Submission Status */}
              {isSubmitted ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <FileText className="h-5 w-5 text-green-600 mr-2" />
                      <div>
                        <p className="font-medium text-green-800">Trabajo enviado</p>
                        <p className="text-sm text-green-600">
                          Enviado el {new Date(assignment.group_data.submission.submitted_at).toLocaleDateString('es-ES')}
                        </p>
                      </div>
                    </div>
                    <a
                      href={assignment.group_data.submission.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-brand_blue hover:underline"
                    >
                      Ver archivo
                    </a>
                  </div>
                </div>
              ) : (
                <div className="border-t pt-4">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700 mb-2 block">
                      Subir trabajo del grupo (PDF)
                    </span>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleFileUpload(assignment.assignment_id, assignment.group_data.group_id, file);
                        }
                      }}
                      disabled={uploading === assignment.assignment_id}
                      className="block w-full text-sm text-gray-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-md file:border-0
                        file:text-sm file:font-semibold
                        file:bg-brand_blue file:text-white
                        hover:file:bg-brand_yellow hover:file:text-brand_blue
                        disabled:opacity-50"
                    />
                  </label>
                  {uploading === assignment.assignment_id && (
                    <p className="text-sm text-gray-500 mt-2">Subiendo archivo...</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SimplifiedGroupAssignments;