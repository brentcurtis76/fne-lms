import React from 'react';
import { GetServerSideProps } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { CoursesService } from '../../lib/services/coursesService';

interface CourseWithInstructor {
  id: string;
  title: string;
  description: string;
  category: string;
  duration_hours: number;
  difficulty_level: string;
  instructor_id: string;
  created_by: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  instructor_name: string;
}

interface CourseDetailPageProps {
  course: CourseWithInstructor | null;
  courseId: string;
}

export default function CourseDetailPage({ course, courseId }: CourseDetailPageProps) {
  if (!course) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-3xl font-bold text-red-600 mb-4">
            Course Not Found
          </h1>
          <p className="text-gray-600">
            The course with ID <span className="font-mono text-blue-600">{courseId}</span> was not found or is not published.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            {course.title}
          </h1>
          
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Instructor</h2>
            <p className="text-gray-600">{course.instructor_name}</p>
          </div>
          
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Description</h2>
            <p className="text-gray-600 leading-relaxed">{course.description}</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-gray-700 mb-1">Category</h3>
              <p className="text-gray-600 capitalize">{course.category}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-gray-700 mb-1">Duration</h3>
              <p className="text-gray-600">{course.duration_hours} hours</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-gray-700 mb-1">Level</h3>
              <p className="text-gray-600 capitalize">{course.difficulty_level}</p>
            </div>
          </div>
          
          <div className="text-sm text-gray-500">
            <p>Course ID: <span className="font-mono">{course.id}</span></p>
            <p>Created: {new Date(course.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { id } = context.params!;
  const courseId = id as string;
  
  try {
    // Create a Supabase client for server-side data fetching
    const supabase = createServerSupabaseClient(context);
    
    // Fetch the course data using our service
    const course = await CoursesService.getCourseById(supabase, courseId);
    
    if (!course) {
      return {
        notFound: true,
      };
    }
    
    return {
      props: {
        course,
        courseId,
      },
    };
  } catch (error) {
    console.error('Error fetching course data:', error);
    
    return {
      notFound: true,
    };
  }
};