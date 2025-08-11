import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function TestRBAC() {
  const [envVars, setEnvVars] = useState<any>({});
  const router = useRouter();

  useEffect(() => {
    // Check all RBAC-related environment variables
    const vars = {
      FEATURE_FLAG: process.env.NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC,
      DEV_MOCK: process.env.NEXT_PUBLIC_RBAC_DEV_MOCK,
      NODE_ENV: process.env.NODE_ENV,
    };
    setEnvVars(vars);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold mb-4">RBAC System Test Page</h1>
          
          <div className="space-y-4">
            <div className="border rounded p-4">
              <h2 className="font-semibold mb-2">Environment Variables:</h2>
              <pre className="bg-gray-100 p-2 rounded text-sm">
                {JSON.stringify(envVars, null, 2)}
              </pre>
            </div>

            <div className="border rounded p-4">
              <h2 className="font-semibold mb-2">Expected Values:</h2>
              <ul className="space-y-1 text-sm">
                <li>
                  FEATURE_FLAG should be: <code className="bg-gray-100 px-1">true</code>
                  {envVars.FEATURE_FLAG === 'true' ? ' ✅' : ' ❌'}
                </li>
                <li>
                  Current value: <code className="bg-gray-100 px-1">{String(envVars.FEATURE_FLAG)}</code>
                </li>
              </ul>
            </div>

            <div className="border rounded p-4">
              <h2 className="font-semibold mb-2">Quick Actions:</h2>
              <div className="space-x-2">
                <button
                  onClick={() => router.push('/admin/role-management')}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  Go to Role Management
                </button>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>

            <div className="border rounded p-4 bg-yellow-50">
              <h2 className="font-semibold mb-2">Troubleshooting:</h2>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>If FEATURE_FLAG is undefined, env vars aren't set in Vercel</li>
                <li>If it's "false" (string), change it to true in Vercel</li>
                <li>After changing, you MUST redeploy for changes to take effect</li>
                <li>Try hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (PC)</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}