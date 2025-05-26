import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { checkProfileCompletion } from '../utils/profileUtils';

export default function HomePage() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const checkAuthAndProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // If user is logged in, check their profile
      if (session?.user) {
        try {
          const isProfileComplete = await checkProfileCompletion(session.user.id);
          
          if (isProfileComplete) {
            // If profile is complete, redirect to dashboard
            router.push('/dashboard');
          } else {
            // If profile is incomplete, redirect to profile page
            router.push('/profile');
          }
        } catch (error) {
          console.error('Error checking profile completion:', error);
          // On error, default to profile page
          router.push('/profile');
        }
      } else {
        // If not logged in, redirect to login page
        router.push('/login');
      }
    };
    
    checkAuthAndProfile();
  }, [router]);
  
  // Show loading while redirecting
  return (
    <div className="min-h-screen bg-brand_beige flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
        <p className="mt-4 text-brand_blue font-medium">Cargando...</p>
      </div>
    </div>
  );
}