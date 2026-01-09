import React, { useEffect } from 'react';
import { useRouter } from 'next/router';

// Redirect component for old course-manager URL
export default function CourseManagerRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Immediately redirect to the new unified learning page
    router.replace('/mi-aprendizaje');
  }, [router]);

  // Show loading state while redirecting
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#0a0a0a] mx-auto"></div>
        <p className="mt-4 text-[#0a0a0a] font-medium">Redirigiendo a Mi Aprendizaje...</p>
      </div>
    </div>
  );
}