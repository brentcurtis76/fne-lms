import React, { useState } from 'react';
import Head from 'next/head';
import CourseBuilderForm from '../src/components/CourseBuilderForm';
import CourseList from '../src/components/CourseList';
import Header from '../components/layout/Header';

const CourseManagerPage: React.FC = () => {
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  
  // Function to refresh the course list after a new course is added
  const handleCourseAdded = () => {
    // Increment the refresh trigger to force the CourseList to refetch
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <>
      <Head>
        <title>Course Manager - FNE LMS</title>
        <meta name="description" content="Manage courses in the FNE Learning Management System" />
      </Head>

      <div className="min-h-screen bg-brand_beige">
        <Header user={user} isAdmin={isAdmin} />
        
        <main className="container mx-auto pt-32 pb-10 px-4">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold text-brand_blue mb-8">Course Manager</h1>
            
            {/* Course Builder Form Section */}
            <div className="mb-12 bg-white rounded-lg shadow-md">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-brand_blue">Add New Course</h2>
                <p className="text-gray-500 text-sm mt-1">
                  Fill out the form below to create a new course
                </p>
              </div>
              
              <div className="p-6">
                <CourseBuilderForm 
                  onSuccess={handleCourseAdded} 
                />
              </div>
            </div>
            
            {/* Course List Section */}
            <div className="bg-white rounded-lg shadow-md">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-brand_blue">Your Courses</h2>
                <p className="text-gray-500 text-sm mt-1">
                  Manage your existing courses
                </p>
              </div>
              
              <div className="p-6">
                <CourseList 
                  key={refreshTrigger}
                  showInstructor={true}
                  limit={20}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default CourseManagerPage;
