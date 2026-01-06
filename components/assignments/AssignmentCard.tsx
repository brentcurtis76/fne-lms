import React from 'react';
import { Assignment } from '../../types/assignments';
import { assignmentUtils } from '../../lib/services/assignments';
import { Calendar, Clock, FileText, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface AssignmentCardProps {
  assignment: Assignment;
  isStudent?: boolean;
  submission?: any;
}

export const AssignmentCard: React.FC<AssignmentCardProps> = ({ 
  assignment, 
  isStudent = false,
  submission
}) => {
  const daysUntil = assignmentUtils.daysUntilDue(assignment.due_date);
  const isOverdue = assignmentUtils.isOverdue(assignment.due_date);
  
  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col transition-all duration-300 hover:shadow-2xl">
      {/* Type indicator bar */}
      <div className={`h-2 ${
        assignment.assignment_type === 'quiz' ? 'bg-brand_yellow' :
        assignment.assignment_type === 'project' ? 'bg-brand_blue' :
        'bg-gray-400'
      }`} />
      
      {/* Content section */}
      <div className="p-5 md:p-6 flex-grow">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-brand_blue mb-1">
              {assignment.title}
            </h3>
            {assignment.course && (
              <p className="text-sm text-gray-600">
                {assignment.course.title}
                {assignment.lesson && ` - ${assignment.lesson.title}`}
              </p>
            )}
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            assignment.assignment_type === 'quiz' ? 'bg-yellow-100 text-yellow-800' :
            assignment.assignment_type === 'project' ? 'bg-blue-100 text-blue-800' :
            assignment.assignment_type === 'essay' ? 'bg-amber-100 text-amber-800' :
            assignment.assignment_type === 'presentation' ? 'bg-green-100 text-green-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {assignmentUtils.getTypeLabel(assignment.assignment_type)}
          </span>
        </div>

        {assignment.description && (
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">
            {assignment.description}
          </p>
        )}

        <div className="space-y-2">
          {assignment.due_date && (
            <div className="flex items-center text-sm">
              <Calendar size={16} className={`mr-2 ${
                isOverdue ? 'text-red-500' : 'text-gray-400'
              }`} />
              <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}>
                {assignmentUtils.formatDueDate(assignment.due_date)}
              </span>
            </div>
          )}
          
          <div className="flex items-center text-sm text-gray-600">
            <FileText size={16} className="mr-2 text-gray-400" />
            <span>{assignment.points} puntos</span>
          </div>

          {isStudent && submission && (
            <div className="flex items-center text-sm">
              <div className={`w-2 h-2 rounded-full mr-2 ${
                submission.status === 'graded' ? 'bg-green-500' :
                submission.status === 'submitted' ? 'bg-yellow-500' :
                submission.status === 'returned' ? 'bg-orange-500' :
                'bg-gray-300'
              }`} />
              <span className={`font-medium ${
                submission.status === 'graded' ? 'text-green-700' :
                submission.status === 'submitted' ? 'text-yellow-700' :
                submission.status === 'returned' ? 'text-orange-700' :
                'text-gray-600'
              }`}>
                {submission.status === 'draft' && 'Borrador'}
                {submission.status === 'submitted' && 'Enviado'}
                {submission.status === 'graded' && `Calificado: ${submission.score}/${assignment.points}`}
                {submission.status === 'returned' && 'Devuelto para revisión'}
              </span>
            </div>
          )}

          {!isStudent && assignment.submission_count !== undefined && (
            <div className="flex items-center text-sm text-gray-600">
              <Clock size={16} className="mr-2 text-gray-400" />
              <span>
                {assignment.submission_count} entregas
                {assignment.graded_count !== undefined && 
                  ` (${assignment.graded_count} calificadas)`
                }
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons section */}
      <div className="p-4 md:p-5 bg-gray-50 border-t border-gray-200 mt-auto">
        <Link 
          href={isStudent ? `/assignments/${assignment.id}` : `/assignments/${assignment.id}/submissions`}
          className="flex items-center justify-center px-4 py-2 bg-brand_blue text-white rounded-md hover:bg-brand_yellow hover:text-brand_blue transition w-full"
        >
          {isStudent ? 'Ver tarea' : 'Ver entregas'}
          <ChevronRight size={16} className="ml-2" />
        </Link>
      </div>
    </div>
  );
};