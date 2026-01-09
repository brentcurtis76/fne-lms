import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

import { getPrimaryRoleFromMetadata } from '../../utils/roleUtils';

const CheckUserRole = () => {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const supabase = createClientComponentClient();
        
        // Get the user session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          setError('No authenticated user found');
          setLoading(false);
          return;
        }
        
        // Get user data including metadata
        const { data: userData, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          throw new Error(userError.message);
        }
        
        const user = userData?.user;
        
        if (user) {
          setUserEmail(user.email);
          const primaryRole = getPrimaryRoleFromMetadata(user.user_metadata);
          setUserRole(primaryRole || 'not set');
        } else {
          setError('User data not found');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Error checking user role:', err);
      } finally {
        setLoading(false);
      }
    };
    
    checkUserRole();
  }, []);
  
  if (loading) {
    return <div>Checking user role...</div>;
  }
  
  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }
  
  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">User Information</h2>
      <div className="space-y-2">
        <p><span className="font-semibold">Email:</span> {userEmail || 'Not available'}</p>
        <p><span className="font-semibold">Role:</span> {userRole || 'Not available'}</p>
      </div>
    </div>
  );
};

export default CheckUserRole;
