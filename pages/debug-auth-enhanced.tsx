import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function DebugAuthEnhanced() {
  const [results, setResults] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('brent@perrotuertocm.cl');
  const [password, setPassword] = useState('');

  // Check environment on mount
  useEffect(() => {
    const checkEnvironment = async () => {
      const envInfo = {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        anonKeyLength: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length,
        browser: typeof window !== 'undefined' ? navigator.userAgent : 'SSR',
        localStorage: typeof window !== 'undefined' ? !!window.localStorage : false,
        cookies: typeof document !== 'undefined' ? document.cookie : 'N/A'
      };
      
      setResults(prev => ({ ...prev, environment: envInfo }));
    };
    
    checkEnvironment();
  }, []);

  // Test 1: Direct fetch to Supabase
  const testDirectFetch = async () => {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`;
    const headers = {
      'Content-Type': 'application/json',
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      'X-Client-Info': 'debug-test'
    };
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email,
          password,
          gotrue_meta_security: {}
        })
      });
      
      const data = await response.json();
      setResults(prev => ({
        ...prev,
        directFetch: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          data,
          requestHeaders: headers
        }
      }));
    } catch (error: any) {
      setResults(prev => ({
        ...prev,
        directFetch: { error: error.message, stack: error.stack }
      }));
    }
  };

  // Test 2: Supabase client auth
  const testSupabaseClient = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      setResults(prev => ({
        ...prev,
        supabaseClient: {
          success: !error,
          error: error?.message,
          errorDetails: error,
          data: data ? { user: data.user?.email, session: !!data.session } : null
        }
      }));
    } catch (error: any) {
      setResults(prev => ({
        ...prev,
        supabaseClient: { error: error.message, stack: error.stack }
      }));
    }
  };

  // Test 3: Check network interceptors
  const testNetworkInterceptors = async () => {
    const checks = {
      serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker.controller : null,
      fetchIntercepted: window.fetch.toString().includes('[native code]'),
      xmlHttpRequestIntercepted: window.XMLHttpRequest.toString().includes('[native code]'),
      proxySettings: typeof window !== 'undefined' && 'Proxy' in window,
      securityPolicies: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')
    };
    
    setResults(prev => ({ ...prev, networkChecks: checks }));
  };

  // Test 4: Compare request headers
  const testHeaderComparison = async () => {
    // Intercept the next fetch to capture headers
    const originalFetch = window.fetch;
    let capturedRequest: any = null;
    
    window.fetch = function(...args) {
      capturedRequest = {
        url: args[0],
        options: args[1],
        timestamp: new Date().toISOString()
      };
      return originalFetch.apply(this, args);
    };
    
    // Make a request
    try {
      await supabase.auth.signInWithPassword({ email, password });
    } catch (e) {
      // Expected to fail
    }
    
    // Restore original fetch
    window.fetch = originalFetch;
    
    setResults(prev => ({ ...prev, capturedRequest }));
  };

  // Run all tests
  const runAllTests = async () => {
    if (!password) {
      alert('Por favor ingrese una contraseña');
      return;
    }
    
    setLoading(true);
    setResults({});
    
    await testDirectFetch();
    await testSupabaseClient();
    await testNetworkInterceptors();
    await testHeaderComparison();
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Enhanced Auth Debug Page</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Credentials</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Enter password"
              />
            </div>
            <button
              onClick={runAllTests}
              disabled={loading}
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? 'Running Tests...' : 'Run All Tests'}
            </button>
          </div>
        </div>

        {Object.keys(results).length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Test Results</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto text-xs">
              {JSON.stringify(results, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-semibold text-yellow-800 mb-2">Debug Instructions:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-yellow-700">
            <li>Open browser DevTools Network tab before running tests</li>
            <li>Look for requests to: /auth/v1/token</li>
            <li>Compare request headers between working (curl) and failing (browser) requests</li>
            <li>Check for any browser extensions that might intercept requests</li>
            <li>Try in an incognito/private window to rule out extensions</li>
          </ol>
        </div>
      </div>
    </div>
  );
}