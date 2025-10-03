import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import MainLayout from '../components/layout/MainLayout';
import { CheckCircleIcon, XCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

export default function TestGroupAssignments() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<any>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }
    setUser(session.user);
    runTests();
  };

  const runTests = async () => {
    try {
      const response = await fetch('/api/test-group-assignments');
      const data = await response.json();
      setTestResults(data);
    } catch (error) {
      console.error('Error running tests:', error);
    } finally {
      setLoading(false);
    }
  };

  const TestResult = ({ title, result, details }: any) => (
    <div className="bg-white p-4 rounded-lg shadow mb-4">
      <div className="flex items-start">
        {result.passed ? (
          <CheckCircleIcon className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" />
        ) : (
          <XCircleIcon className="h-6 w-6 text-red-500 mr-3 flex-shrink-0" />
        )}
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {details && (
            <pre className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto">
              {JSON.stringify(details, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-8">
            Group Assignments System Test
          </h1>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand_blue mx-auto"></div>
              <p className="mt-4 text-gray-600">Running tests...</p>
            </div>
          ) : testResults ? (
            <div>
              {/* User Info */}
              <div className="bg-blue-50 p-4 rounded-lg mb-6">
                <h2 className="font-semibold text-blue-900 mb-2">Current User</h2>
                <p className="text-sm text-blue-700">Email: {testResults.user.email}</p>
                <p className="text-sm text-blue-700">ID: {testResults.user.id}</p>
              </div>

              {/* Test Results */}
              <div className="space-y-4">
                <TestResult
                  title="User Role Check"
                  result={testResults.results.userRole}
                  details={testResults.results.userRole.data}
                />

                <TestResult
                  title="Group Assignments"
                  result={testResults.results.groupAssignments}
                  details={{
                    count: testResults.results.groupAssignments.count,
                    assignments: testResults.results.groupAssignments.assignments
                  }}
                />

                <TestResult
                  title="Enrolled Courses"
                  result={testResults.results.enrolledCourses}
                  details={{
                    count: testResults.results.enrolledCourses.count,
                    courses: testResults.results.enrolledCourses.courses
                  }}
                />

                {testResults.results.lessonsWithGroupBlocks && (
                  <TestResult
                    title="Lessons with Group Assignment Blocks"
                    result={testResults.results.lessonsWithGroupBlocks}
                    details={testResults.results.lessonsWithGroupBlocks}
                  />
                )}
              </div>

              {/* Summary */}
              <div className="mt-8 bg-gray-100 p-6 rounded-lg">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Role:</span>
                    <span className="ml-2 font-medium">{testResults.results.summary.role}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Can Create Assignments:</span>
                    <span className="ml-2 font-medium">
                      {testResults.results.summary.canCreateAssignments ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Has Group Assignments:</span>
                    <span className="ml-2 font-medium">
                      {testResults.results.summary.hasGroupAssignments ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Enrolled in Courses:</span>
                    <span className="ml-2 font-medium">
                      {testResults.results.summary.enrolledInCourses ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Links */}
              <div className="mt-8 bg-white p-6 rounded-lg shadow">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Links</h2>
                <div className="space-y-2">
                  <a
                    href="/assignments"
                    className="block text-brand_blue hover:underline"
                  >
                    → View Assignments Page
                  </a>
                  <a
                    href="/community/workspace"
                    className="block text-brand_blue hover:underline"
                  >
                    → View Collaborative Space
                  </a>
                  {testResults.results.summary.canCreateAssignments && (
                    <a
                      href="/admin/course-builder"
                      className="block text-brand_blue hover:underline"
                    >
                      → Course Builder (Create Group Assignments)
                    </a>
                  )}
                </div>
              </div>

              {/* Instructions */}
              <div className="mt-8 bg-yellow-50 p-6 rounded-lg">
                <div className="flex">
                  <InformationCircleIcon className="h-6 w-6 text-yellow-600 mr-3 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-yellow-900">Testing Instructions</h3>
                    <ol className="mt-2 text-sm text-yellow-700 list-decimal list-inside space-y-1">
                      <li>Run <code>node scripts/test-group-assignments-complete.js</code> to create test data</li>
                      <li>Login as test.consultor@example.com to create assignments</li>
                      <li>Login as student1@example.com to view/submit assignments</li>
                      <li>Visit this page with different users to see their test results</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <XCircleIcon className="h-12 w-12 text-red-500 mx-auto" />
              <p className="mt-4 text-gray-600">Failed to load test results</p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}