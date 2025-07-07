import { useState, useEffect } from 'react';
import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabase';

export default function TestAuth() {
  const supabaseClient = useSupabaseClient();
  const session = useSession();
  const [testEmail, setTestEmail] = useState('test@example.com');
  const [testPassword, setTestPassword] = useState('password123');
  const [result, setResult] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check connection on mount
    checkConnection();
    fetchUsers();
  }, []);

  const checkConnection = async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      console.log('Connection test:', { data, error });
      setResult(prev => ({ ...prev, connectionTest: { success: !error, data, error } }));
    } catch (err) {
      console.error('Connection error:', err);
      setResult(prev => ({ ...prev, connectionTest: { success: false, error: err } }));
    }
  };

  const fetchUsers = async () => {
    try {
      // Try to fetch profiles to see if we can connect to the database
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, role')
        .limit(5);
      
      if (error) {
        console.error('Error fetching users:', error);
        setUsers([]);
      } else {
        setUsers(data || []);
      }
    } catch (err) {
      console.error('Database error:', err);
      setUsers([]);
    }
  };

  const testLogin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: testEmail,
        password: testPassword
      });

      setResult(prev => ({
        ...prev,
        loginTest: {
          success: !error,
          data: data?.user ? { id: data.user.id, email: data.user.email } : null,
          error: error ? { message: error.message, status: error.status } : null
        }
      }));
    } catch (err) {
      setResult(prev => ({
        ...prev,
        loginTest: { success: false, error: err }
      }));
    } finally {
      setLoading(false);
    }
  };

  const createTestUser = async () => {
    setLoading(true);
    try {
      // Note: This will only work if you have access to create users
      const { data, error } = await supabaseClient.auth.signUp({
        email: testEmail,
        password: testPassword,
        options: {
          data: {
            first_name: 'Test',
            last_name: 'User'
          }
        }
      });

      setResult(prev => ({
        ...prev,
        createUserTest: {
          success: !error,
          data: data?.user ? { id: data.user.id, email: data.user.email } : null,
          error: error ? { message: error.message, status: error.status } : null
        }
      }));
    } catch (err) {
      setResult(prev => ({
        ...prev,
        createUserTest: { success: false, error: err }
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Supabase Authentication Test</h1>

        {/* Connection Status */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Connection Status</h2>
          <div className="space-y-2">
            <p><strong>Supabase URL:</strong> {process.env.NEXT_PUBLIC_SUPABASE_URL}</p>
            <p><strong>Anon Key Exists:</strong> {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Yes' : 'No'}</p>
            <p><strong>Session Status:</strong> {session ? 'Active' : 'No Session'}</p>
            {session && <p><strong>User Email:</strong> {session.user.email}</p>}
          </div>
        </div>

        {/* Test Credentials */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Credentials</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                value={testPassword}
                onChange={(e) => setTestPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div className="flex gap-4">
              <button
                onClick={testLogin}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                Test Login
              </button>
              <button
                onClick={createTestUser}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
              >
                Create Test User
              </button>
            </div>
          </div>
        </div>

        {/* Existing Users */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Sample Users from Database</h2>
          {users.length > 0 ? (
            <div className="space-y-2">
              {users.map((user, index) => (
                <div key={index} className="p-2 bg-gray-50 rounded">
                  <p><strong>Email:</strong> {user.email || 'No email'}</p>
                  <p><strong>Role:</strong> {user.role || 'No role'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No users found or unable to fetch users</p>
          )}
          <button
            onClick={fetchUsers}
            className="mt-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Refresh Users
          </button>
        </div>

        {/* Test Results */}
        {result && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Test Results</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}