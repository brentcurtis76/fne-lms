import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Head from 'next/head';
import Link from 'next/link';
import Header from '../components/layout/Header';
import CheckUserRole from '../src/components/CheckUserRole';

export default function TestUserRole() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check if user is authenticated
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setIsAuthenticated(false);
          setUserData(null);
        } else {
          setIsAuthenticated(true);
          setUserData(session.user);
        }
      } catch (error) {
        console.error('Error checking session:', error);
      } finally {
        setLoading(false);
      }
    };
    
    checkSession();
  }, [supabase.auth]);
  
  const handleLogin = () => {
    router.push('/login');
  };
  
  return (
    <>
      <Head>
        <title>Test User Role - Genera</title>
      </Head>
      
      <div className="min-h-screen bg-brand_beige">
        <Header 
          user={userData} 
        />
        
        <main className="container mx-auto pt-32 pb-10 px-4">
          <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-8">
            <h1 className="text-2xl font-bold mb-6 text-[#0a0a0a]">Test User Role</h1>
            
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#0a0a0a] mx-auto"></div>
                <p className="mt-4 text-[#0a0a0a]">Cargando...</p>
              </div>
            ) : isAuthenticated ? (
              <div className="space-y-6">
                <p className="text-lg">You are currently logged in. Here is your role information:</p>
                <CheckUserRole />
                
                <div className="mt-8 pt-4 border-t border-gray-200">
                  <p className="mb-4">This component shows your current user role from Supabase user_metadata.</p>
                  <p>If your role is not set, you can update it in your profile settings or ask an administrator to update it for you.</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-lg mb-6">You need to be logged in to view your role information.</p>
                <button 
                  onClick={handleLogin}
                  className="px-6 py-3 bg-[#0a0a0a] text-white rounded-lg hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition"
                >
                  Log In
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
