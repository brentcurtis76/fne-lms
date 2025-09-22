import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

import { metadataHasRole } from '../../utils/roleUtils';

type Lesson = {
  id: string;
  title: string;
  // Other fields can be added here as needed
};

const LessonList = () => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    const checkAdminAndFetchLessons = async () => {
      try {
        const supabase = createClientComponentClient();
        
        // First check if user is authenticated
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setLoading(false);
          return;
        }
        
        // Check if user has admin role in metadata
        const { data: userData, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          console.error('Error fetching user data:', userError);
          setLoading(false);
          return;
        }
        
        // Check for admin role in user metadata
        let adminStatus = metadataHasRole(userData?.user?.user_metadata, 'admin');
        
        // If not found in metadata, check profiles table as fallback
        if (!adminStatus) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();
            
          if (!profileError && profileData?.role === 'admin') {
            adminStatus = true;
          }
        }
        
        setIsAdmin(adminStatus);
        
        // Only fetch lessons if user is an admin
        if (adminStatus) {
          const { data, error } = await supabase
            .from('lessons')
            .select('id, title')
            .order('created_at', { ascending: false });
          
          if (error) {
            throw new Error(error.message);
          }
          
          setLessons(data || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Error in checkAdminAndFetchLessons:', err);
      } finally {
        setLoading(false);
      }
    };
    
    checkAdminAndFetchLessons();
  }, []);
  
  if (loading) {
    return <div>Loading lessons...</div>;
  }
  
  if (!isAdmin) {
    return <div>You do not have access to view lessons.</div>;
  }
  
  if (error) {
    return <div>Error: {error}</div>;
  }
  
  if (lessons.length === 0) {
    return <div>No lessons found.</div>;
  }
  
  return (
    <ul className="lesson-list">
      {lessons.map((lesson) => (
        <li key={lesson.id}>{lesson.title}</li>
      ))}
    </ul>
  );
};

export default LessonList;
