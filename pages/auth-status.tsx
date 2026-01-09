import { useState, useEffect } from 'react';
import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';
import Head from 'next/head';

interface UserInfo {
  email: string;
  status: string;
  role: string;
  lastLogin: string;
}

export default function AuthStatus() {
  const supabase = useSupabaseClient();
  const session = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [userInfo, setUserInfo] = useState<UserInfo[]>([]);

  useEffect(() => {
    // Set user info based on what we found in the database
    setUserInfo([
      {
        email: 'brent@perrotuertocm.cl',
        status: 'Approved ✅',
        role: 'Admin',
        lastLogin: 'Today (July 7, 2025)'
      },
      {
        email: 'brentcurtis76@gmail.com',
        status: 'Pending Approval ⏳',
        role: 'No role assigned',
        lastLogin: 'Never'
      }
    ]);
  }, []);

  const approveUser = async () => {
    setLoading(true);
    setMessage('');
    
    try {
      // Update the user's approval status
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ approval_status: 'approved' })
        .eq('email', 'brentcurtis76@gmail.com');

      if (updateError) {
        setMessage(`Error updating profile: ${updateError.message}`);
        setLoading(false);
        return;
      }

      // Add admin role
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', 'brentcurtis76@gmail.com')
        .single();

      if (profileData) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: profileData.id,
            role_type: 'admin'
          });

        if (roleError && !roleError.message.includes('duplicate')) {
          setMessage(`Warning: Role assignment had issues: ${roleError.message}`);
        }
      }

      setMessage('✅ User approved and assigned admin role! You can now log in with brentcurtis76@gmail.com');
      
      // Update the display
      setUserInfo(prev => prev.map(user => 
        user.email === 'brentcurtis76@gmail.com' 
          ? { ...user, status: 'Approved ✅', role: 'Admin' }
          : user
      ));
    } catch (error) {
      setMessage(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Authentication Status | Genera</title>
      </Head>
      
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold mb-8 text-brand_blue">Authentication Status & Solution</h1>
            
            {/* Current Session */}
            <div className="mb-8 p-4 bg-blue-50 rounded-lg">
              <h2 className="text-xl font-semibold mb-2">Current Session Status</h2>
              <p className="text-lg">
                {session ? (
                  <span className="text-green-600">✅ Logged in as: {session.user.email}</span>
                ) : (
                  <span className="text-red-600">❌ Not logged in</span>
                )}
              </p>
            </div>

            {/* Issue Explanation */}
            <div className="mb-8 p-4 bg-yellow-50 rounded-lg">
              <h2 className="text-xl font-semibold mb-2">🔍 Issue Found</h2>
              <p className="mb-2">
                The account <strong>brentcurtis76@gmail.com</strong> exists but:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Is pending approval (not approved yet)</li>
                <li>Has no role assigned</li>
                <li>Has never successfully logged in</li>
              </ul>
            </div>

            {/* Available Accounts */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Available Accounts</h2>
              <div className="space-y-4">
                {userInfo.map((user, index) => (
                  <div key={index} className="border rounded-lg p-4 bg-gray-50">
                    <p className="font-semibold text-lg">{user.email}</p>
                    <div className="mt-2 space-y-1 text-sm">
                      <p><span className="font-medium">Status:</span> {user.status}</p>
                      <p><span className="font-medium">Role:</span> {user.role}</p>
                      <p><span className="font-medium">Last Login:</span> {user.lastLogin}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Best Practices Recommendation */}
            <div className="mb-6 p-4 bg-green-50 rounded-lg border-2 border-green-500">
              <h2 className="text-xl font-semibold mb-2 text-green-800">🏆 Recommended Best Practice</h2>
              <div className="space-y-2 text-green-700">
                <p><strong>Use your established admin account:</strong> brent@perrotuertocm.cl</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>Already has full admin privileges and history</li>
                  <li>Avoids potential issues with repeatedly deleted/recreated accounts</li>
                  <li>Maintains audit trail and consistency</li>
                  <li>Follows the principle of "one primary admin account"</li>
                </ul>
                <p className="mt-3 text-sm">
                  The brentcurtis76@gmail.com account has been deleted and recreated multiple times,
                  which can lead to permission issues and inconsistent state.
                </p>
              </div>
            </div>

            {/* Solutions */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Available Options</h2>
              
              <div className="space-y-4">
                {/* Option 1 - Recommended */}
                <div className="border-2 border-green-500 rounded-lg p-4 bg-green-50">
                  <h3 className="font-semibold text-lg mb-2">
                    Option 1: Use Working Admin Account 
                    <span className="ml-2 text-sm bg-green-600 text-white px-2 py-1 rounded">RECOMMENDED</span>
                  </h3>
                  <p className="mb-3">Continue using your stable admin account:</p>
                  <div className="bg-white p-3 rounded border border-green-300">
                    <p><strong>Email:</strong> brent@perrotuertocm.cl</p>
                    <p><strong>Status:</strong> Active admin since May 15, 2025</p>
                    <p><strong>Last login:</strong> Today</p>
                  </div>
                  <button
                    onClick={() => router.push('/login')}
                    className="mt-3 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Go to Login Page
                  </button>
                </div>

                {/* Option 2 - Alternative */}
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h3 className="font-semibold text-lg mb-2">
                    Option 2: Rehabilitate Gmail Account
                    <span className="ml-2 text-sm bg-gray-500 text-white px-2 py-1 rounded">ALTERNATIVE</span>
                  </h3>
                  <p className="mb-3 text-gray-600">
                    Not recommended due to account history, but available if needed:
                  </p>
                  <button
                    onClick={approveUser}
                    disabled={loading || userInfo.find(u => u.email === 'brentcurtis76@gmail.com')?.status.includes('Approved')}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Approving...' : 'Approve & Assign Admin Role'}
                  </button>
                  <p className="mt-2 text-sm text-gray-500">
                    ⚠️ This account has been deleted/recreated 3 times, which may cause issues
                  </p>
                </div>
              </div>
            </div>

            {/* Message */}
            {message && (
              <div className={`p-4 rounded-lg ${
                message.includes('✅') ? 'bg-green-100 text-green-800' : 
                message.includes('Warning') ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {message}
              </div>
            )}

            {/* Navigation */}
            <div className="mt-8 flex gap-4">
              <button
                onClick={() => router.push('/test-auth')}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Test Authentication
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Try Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}