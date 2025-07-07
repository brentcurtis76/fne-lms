import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';
import { useState } from 'react';

export default function TestLogout() {
  const session = useSession();
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      // Clear local storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error);
      }
      
      // Call logout API to clear server-side session
      await fetch('/api/auth/logout', { method: 'POST' });
      
      // Force reload to clear any cached state
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <h1 className="text-2xl font-bold mb-4">Session Test</h1>
        
        <div className="mb-6">
          <p className="text-sm text-gray-600 mb-2">Session Status:</p>
          <div className={`p-3 rounded ${session ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {session ? 'Logged In' : 'Not Logged In'}
          </div>
        </div>
        
        {session && (
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-2">User Email:</p>
            <div className="p-3 bg-gray-100 rounded">
              {session.user.email}
            </div>
          </div>
        )}
        
        <div className="flex gap-4">
          {session ? (
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex-1 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:bg-gray-400"
            >
              {isLoggingOut ? 'Logging out...' : 'Logout'}
            </button>
          ) : (
            <button
              onClick={() => router.push('/login')}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Go to Login
            </button>
          )}
          
          <button
            onClick={() => router.push('/dashboard')}
            className="flex-1 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}