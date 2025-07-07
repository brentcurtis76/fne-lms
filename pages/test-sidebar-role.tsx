import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useEffect, useState } from 'react';

import MainLayout from '../components/layout/MainLayout';
import { useAuth } from '../hooks/useAuth';

export default function TestSidebarRole() {
  const supabase = useSupabaseClient();
  const { user, profile, isAdmin, avatarUrl, logout } = useAuth();
  const [debugInfo, setDebugInfo] = useState<any>({});

  useEffect(() => {
    if (user && profile) {
      setDebugInfo({
        userId: user.id,
        userEmail: user.email,
        profileRole: profile?.role,
        isAdmin: isAdmin,
        hasProfile: !!profile,
        profileData: profile
      });
    }
  }, [user, profile, isAdmin]);

  return (
    <MainLayout 
      user={user}
      currentPage="test"
      pageTitle="Test Sidebar Role"
      isAdmin={isAdmin}
      userRole={profile?.role}
      onLogout={logout}
      avatarUrl={avatarUrl}
    >
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Sidebar Role Test</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Current User Information</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-3">Expected Menu Items</h2>
          <div className="space-y-2">
            <p><strong>For Admin or Consultor roles:</strong></p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>Revisión de Quizzes</li>
              <li>Gestión de Tareas Grupales</li>
            </ul>
            
            <p className="mt-4"><strong>Current Role:</strong> {profile?.role || 'No role found'}</p>
            <p><strong>Is Admin:</strong> {isAdmin ? 'Yes' : 'No'}</p>
            <p><strong>Should See Consultant Menu:</strong> {['admin', 'consultor'].includes(profile?.role || '') ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}