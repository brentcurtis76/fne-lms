import { useState } from 'react';

export default function TestAuthSimple() {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  
  const testAuth = async () => {
    setLoading(true);
    setResult('Testing...\n\n');
    
    // Log environment variables
    const envInfo = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      keyLength: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length,
      keyFirst20: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20),
      keyLast20: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(-20)
    };
    
    setResult(prev => prev + 'Environment:\n' + JSON.stringify(envInfo, null, 2) + '\n\n');
    
    // Direct API call
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({
          email: 'brent@perrotuertocm.cl',
          password: 'NuevaEdu2025!',
          gotrue_meta_security: {}
        })
      });
      
      const data = await response.json();
      setResult(prev => prev + 'API Response:\n' + JSON.stringify({
        status: response.status,
        data: data
      }, null, 2));
    } catch (error: any) {
      setResult(prev => prev + 'Error:\n' + error.message);
    }
    
    setLoading(false);
  };
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Simple Auth Test</h1>
      <button 
        onClick={testAuth}
        disabled={loading}
        className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        Test Authentication
      </button>
      <pre className="mt-4 bg-gray-100 p-4 rounded text-xs overflow-auto">
        {result || 'Click button to test'}
      </pre>
    </div>
  );
}