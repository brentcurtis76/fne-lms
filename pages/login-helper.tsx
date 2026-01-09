import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function LoginHelper() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to login page after 3 seconds
    const timer = setTimeout(() => {
      router.push('/login');
    }, 3000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <>
      <Head>
        <title>Login Helper | Genera</title>
      </Head>
      
      <div className="min-h-screen bg-brand_beige flex items-center justify-center p-8">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full">
          <div className="text-center mb-8">
            <div className="inline-block p-4 bg-green-100 rounded-full mb-4">
              <svg className="w-16 h-16 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-brand_blue mb-2">Ready to Login!</h1>
            <p className="text-gray-600">Use your working admin credentials</p>
          </div>

          <div className="bg-green-50 border-2 border-green-500 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-green-800">Your Admin Credentials:</h2>
            <div className="space-y-3">
              <div className="flex items-center">
                <span className="font-medium text-gray-700 w-24">Email:</span>
                <code className="bg-white px-3 py-1 rounded border border-green-300 font-mono">
                  brent@perrotuertocm.cl
                </code>
              </div>
              <div className="flex items-center">
                <span className="font-medium text-gray-700 w-24">Password:</span>
                <span className="text-gray-600">[Use your known password]</span>
              </div>
              <div className="flex items-center">
                <span className="font-medium text-gray-700 w-24">Status:</span>
                <span className="text-green-600 font-medium">✅ Active Admin Account</span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> This is your primary admin account that has been working reliably since May 2025. 
              It has full administrative privileges and no known issues.
            </p>
          </div>

          <div className="text-center">
            <p className="text-gray-600 mb-4">Redirecting to login page in a moment...</p>
            <button
              onClick={() => router.push('/login')}
              className="px-6 py-3 bg-brand_blue text-white font-semibold rounded-lg hover:bg-brand_yellow transition-colors"
            >
              Go to Login Now →
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="font-semibold mb-2 text-gray-700">After logging in:</h3>
            <ol className="list-decimal list-inside space-y-1 text-gray-600">
              <li>You'll be redirected to the dashboard</li>
              <li>Full admin menu will be available in the sidebar</li>
              <li>All features and permissions will be active</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}