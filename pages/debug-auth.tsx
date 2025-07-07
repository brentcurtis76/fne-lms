import { useState, useEffect } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';

export default function DebugAuth() {
  const supabase = useSupabaseClient();
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [testEmail, setTestEmail] = useState('brent@perrotuertocm.cl');
  const [testPassword, setTestPassword] = useState('');
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    // Collect all debug information
    const info = {
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY_EXISTS: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        NEXT_PUBLIC_SUPABASE_ANON_KEY_LENGTH: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length,
        NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20) + '...',
      },
      browser: {
        userAgent: navigator.userAgent,
        origin: window.location.origin,
        href: window.location.href,
      },
      supabase: {
        clientExists: !!supabase,
        authExists: !!supabase?.auth,
      }
    };

    setDebugInfo(info);

    // Test basic API connectivity
    testAPIConnectivity();
  }, [supabase]);

  const testAPIConnectivity = async () => {
    try {
      // Test 1: Direct fetch to Supabase
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`
        }
      });

      setDebugInfo(prev => ({
        ...prev,
        apiTest: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        }
      }));
    } catch (error) {
      setDebugInfo(prev => ({
        ...prev,
        apiTest: {
          error: error.message
        }
      }));
    }
  };

  const testLogin = async () => {
    if (!supabase) {
      setTestResult({ success: false, error: { message: 'Supabase client not available' } });
      return;
    }
    setTestResult({ loading: true });
    
    try {
      console.log('[Debug Auth] Testing login with:', {
        email: testEmail,
        url: process.env.NEXT_PUBLIC_SUPABASE_URL
      });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword
      });

      if (error) {
        console.error('[Debug Auth] Login error:', error);
        setTestResult({
          success: false,
          error: {
            message: error.message,
            status: error.status,
            name: error.name,
            details: JSON.stringify(error, null, 2)
          }
        });
      } else {
        setTestResult({
          success: true,
          user: data.user?.email,
          session: !!data.session
        });
      }
    } catch (e) {
      console.error('[Debug Auth] Exception:', e);
      setTestResult({
        success: false,
        exception: e.message
      });
    }
  };

  const copyToClipboard = () => {
    const debugText = JSON.stringify({ debugInfo, testResult }, null, 2);
    navigator.clipboard.writeText(debugText);
    alert('Debug info copied to clipboard!');
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Auth Debug Page</h1>
        
        {/* Test Login Form */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h2 className="text-xl font-semibold mb-4">Test Authentication</h2>
          <div className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="w-full p-2 border rounded"
            />
            <input
              type="password"
              placeholder="Password"
              value={testPassword}
              onChange={(e) => setTestPassword(e.target.value)}
              className="w-full p-2 border rounded"
            />
            <button
              onClick={testLogin}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Test Login
            </button>
          </div>
          
          {testResult && (
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <pre className="text-sm overflow-auto">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Debug Information */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Debug Information</h2>
            <button
              onClick={copyToClipboard}
              className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 text-sm"
            >
              Copy to Clipboard
            </button>
          </div>
          <pre className="bg-gray-50 p-4 rounded overflow-auto text-sm">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}