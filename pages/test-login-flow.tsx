import { useState, useEffect } from 'react';
import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';
import { checkProfileCompletion, getUserPrimaryRole } from '../utils/profileUtils';
import Head from 'next/head';

export default function TestLoginFlow() {
  const supabase = useSupabaseClient();
  const session = useSession();
  const router = useRouter();
  const [testResults, setTestResults] = useState<any>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session?.user) {
      runTests();
    }
  }, [session]);

  const runTests = async () => {
    if (!session?.user) return;
    
    setLoading(true);
    const results: any = {};
    
    // Test 1: Profile fetch without non-existent columns
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('must_change_password')
        .eq('id', session.user.id)
        .single();
      
      results.passwordCheckTest = {
        success: !error,
        data: data,
        error: error
      };
    } catch (e) {
      results.passwordCheckTest = { success: false, error: e };
    }
    
    // Test 2: Profile completion check
    try {
      const isComplete = await checkProfileCompletion(session.user.id);
      results.profileCompletionTest = {
        success: true,
        isComplete: isComplete
      };
    } catch (e) {
      results.profileCompletionTest = { success: false, error: e };
    }
    
    // Test 3: Get user role
    try {
      const role = await getUserPrimaryRole(session.user.id);
      results.userRoleTest = {
        success: true,
        role: role
      };
    } catch (e) {
      results.userRoleTest = { success: false, error: e };
    }
    
    // Test 4: Full profile data
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      results.fullProfileTest = {
        success: !error,
        hasAllFields: !!(data?.first_name && data?.last_name && data?.description && data?.school && data?.avatar_url),
        approvalStatus: data?.approval_status,
        data: data ? {
          first_name: data.first_name,
          last_name: data.last_name,
          school: data.school,
          approval_status: data.approval_status,
          has_avatar: !!data.avatar_url,
          has_description: !!data.description
        } : null,
        error: error
      };
    } catch (e) {
      results.fullProfileTest = { success: false, error: e };
    }
    
    setTestResults(results);
    setLoading(false);
  };

  const simulateLogin = () => {
    // Clear any cached data
    localStorage.removeItem('supabase.auth.token');
    sessionStorage.clear();
    
    // Redirect to login
    router.push('/login');
  };

  return (
    <>
      <Head>
        <title>Test Login Flow | FNE LMS</title>
      </Head>
      
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold mb-8 text-brand_blue">Login Flow Test</h1>
            
            {/* Session Status */}
            <div className="mb-8 p-4 bg-blue-50 rounded-lg">
              <h2 className="text-xl font-semibold mb-2">Current Session</h2>
              {session ? (
                <div className="space-y-2">
                  <p><strong>User ID:</strong> {session.user.id}</p>
                  <p><strong>Email:</strong> {session.user.email}</p>
                  <p className="text-green-600 font-semibold">✅ Logged In</p>
                </div>
              ) : (
                <p className="text-red-600 font-semibold">❌ Not Logged In</p>
              )}
            </div>

            {/* Test Results */}
            {session && (
              <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Test Results</h2>
                
                {loading ? (
                  <p>Running tests...</p>
                ) : (
                  <div className="space-y-4">
                    {/* Password Check Test */}
                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold mb-2">1. Password Change Check</h3>
                      {testResults.passwordCheckTest?.success ? (
                        <div>
                          <p className="text-green-600">✅ Query successful</p>
                          <p>Must change password: {testResults.passwordCheckTest.data?.must_change_password ? 'Yes' : 'No'}</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-red-600">❌ Query failed</p>
                          <pre className="text-xs bg-gray-100 p-2 rounded mt-2">
                            {JSON.stringify(testResults.passwordCheckTest?.error, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>

                    {/* Profile Completion Test */}
                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold mb-2">2. Profile Completion Check</h3>
                      {testResults.profileCompletionTest?.success ? (
                        <div>
                          <p className="text-green-600">✅ Check successful</p>
                          <p>Profile complete: {testResults.profileCompletionTest.isComplete ? 'Yes ✅' : 'No ❌'}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {testResults.profileCompletionTest.isComplete 
                              ? 'Should redirect to dashboard' 
                              : 'Should redirect to profile page'}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-red-600">❌ Check failed</p>
                          <pre className="text-xs bg-gray-100 p-2 rounded mt-2">
                            {JSON.stringify(testResults.profileCompletionTest?.error, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>

                    {/* User Role Test */}
                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold mb-2">3. User Role Check</h3>
                      {testResults.userRoleTest?.success ? (
                        <div>
                          <p className="text-green-600">✅ Role retrieved</p>
                          <p>Primary role: <strong>{testResults.userRoleTest.role || 'None'}</strong></p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-red-600">❌ Role check failed</p>
                        </div>
                      )}
                    </div>

                    {/* Full Profile Test */}
                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold mb-2">4. Full Profile Data</h3>
                      {testResults.fullProfileTest?.success ? (
                        <div>
                          <p className="text-green-600">✅ Profile loaded</p>
                          <p>All fields complete: {testResults.fullProfileTest.hasAllFields ? 'Yes ✅' : 'No ❌'}</p>
                          <p>Approval status: <strong>{testResults.fullProfileTest.approvalStatus}</strong></p>
                          <div className="mt-2 text-sm">
                            <p>• Name: {testResults.fullProfileTest.data?.first_name} {testResults.fullProfileTest.data?.last_name}</p>
                            <p>• School: {testResults.fullProfileTest.data?.school}</p>
                            <p>• Has avatar: {testResults.fullProfileTest.data?.has_avatar ? 'Yes' : 'No'}</p>
                            <p>• Has description: {testResults.fullProfileTest.data?.has_description ? 'Yes' : 'No'}</p>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-red-600">❌ Profile load failed</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={simulateLogin}
                className="px-4 py-2 bg-brand_blue text-white rounded hover:bg-brand_yellow"
              >
                Test Login Flow
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Go to Dashboard
              </button>
              {session && (
                <button
                  onClick={runTests}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Re-run Tests
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}