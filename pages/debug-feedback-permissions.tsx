import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabase';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import Link from 'next/link';

export default function DebugFeedbackPermissions() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [userInfo, setUserInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setUserInfo({
        user,
        profile,
        isAdmin: profile?.role === 'admin'
      });
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Debug: Feedback Permissions Access</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Your User Info:</h2>
          <div className="space-y-2">
            <p><strong>Email:</strong> {userInfo?.profile?.email}</p>
            <p><strong>Role:</strong> {userInfo?.profile?.role}</p>
            <p><strong>Is Admin:</strong> {userInfo?.isAdmin ? 'Yes ✅' : 'No ❌'}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Navigation Links:</h2>
          <div className="space-y-3">
            <Link href="/admin/configuration">
              <div className="block p-3 bg-blue-50 rounded hover:bg-blue-100 transition cursor-pointer">
                🔗 Go to Configuration Page
              </div>
            </Link>
            
            <Link href="/admin/configuration?tab=users">
              <div className="block p-3 bg-green-50 rounded hover:bg-green-100 transition cursor-pointer">
                🔗 Go directly to Users & Permissions Tab
              </div>
            </Link>
          </div>
        </div>

        {userInfo?.isAdmin && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h3 className="font-semibold text-green-800 mb-2">✅ You are an Admin</h3>
            <p className="text-green-700">You should be able to:</p>
            <ul className="list-disc list-inside text-green-700 mt-2">
              <li>See &quot;Configuración&quot; in the sidebar</li>
              <li>Access the configuration page</li>
              <li>Manage feedback permissions in the &quot;Usuarios y Permisos&quot; tab</li>
            </ul>
          </div>
        )}

        {!userInfo?.isAdmin && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 className="font-semibold text-red-800 mb-2">❌ You are not an Admin</h3>
            <p className="text-red-700">You need admin role to manage feedback permissions.</p>
          </div>
        )}
      </div>
    </div>
  );
}