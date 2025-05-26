import React from 'react';
import CourseBuilderTimeline from '../components/CourseList';

const TestTimelinePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <h1 className="text-3xl font-bold text-center text-brand_blue mb-8">Test Timeline Page</h1>
      <CourseBuilderTimeline />
    </div>
  );
};

export default TestTimelinePage;
