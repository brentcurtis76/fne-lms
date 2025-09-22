import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Head from 'next/head';
import Link from 'next/link';
import Header from '../components/layout/Header';
import CheckUserRole from '../src/components/CheckUserRole';

import { metadataHasRole } from '../utils/roleUtils';

export default function Dashboard() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profileName, setProfileName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check if user is authenticated
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }
        
        setUser(session.user);
        
        // Get user metadata and check for admin role
        const { data: userData, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          console.error('Error fetching user data:', userError);
        } else {
          // Check if user has admin role
          const adminRole = metadataHasRole(userData?.user?.user_metadata, 'admin');
          setIsAdmin(adminRole);
          
          // Fallback: If role is not in metadata, check profiles table
          if (userData?.user && !adminRole) {
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('role, first_name, last_name')
              .eq('id', userData.user.id)
              .single();
              
            if (profileData) {
              if (profileData.role === 'admin') {
                setIsAdmin(true);
              }
              
              if (profileData.first_name && profileData.last_name) {
                setProfileName(`${profileData.first_name} ${profileData.last_name}`);
              }
            }
          }
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error in checkSession:', error);
        setLoading(false);
        router.push('/login');
      }
    };
    
    checkSession();
  }, [router, supabase.auth]);
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-brand_beige flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
          <p className="mt-4 text-brand_blue font-medium">Cargando...</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <Head>
        <title>Dashboard - FNE LMS</title>
      </Head>
      
      <div className="min-h-screen bg-brand_beige">
        <Header 
          user={user} 
          isAdmin={isAdmin} 
          onLogout={handleLogout} 
        />
        
        <main className="container mx-auto pt-32 pb-10 px-4">
          <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-8">
            <h1 className="text-2xl font-bold mb-6 text-brand_blue">Bienvenido a tu Dashboard</h1>
            
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Información de Usuario</h2>
              <CheckUserRole />
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
