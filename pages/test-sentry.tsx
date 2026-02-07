import { useState } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function TestSentry() {
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleTestError = () => {
    try {
      console.log('Testing Sentry error capture...');
      const error = new Error('Test error from Sentry test page');

      // Capture with Sentry
      Sentry.captureException(error);
      console.log('Error captured by Sentry:', error.message);

      // Throw the error to trigger normal error handling
      throw error;
    } catch (error) {
      console.error('Error caught:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return (
    <div style={{
      maxWidth: '600px',
      margin: '50px auto',
      padding: '20px',
      fontFamily: 'sans-serif'
    }}>
      <h1>Sentry Test Page</h1>
      <p>Click the button below to test Sentry error tracking:</p>

      <button
        onClick={handleTestError}
        style={{
          backgroundColor: '#dc3545',
          color: 'white',
          padding: '12px 24px',
          fontSize: '16px',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          marginTop: '20px'
        }}
      >
        Test Sentry Error
      </button>

      {errorMessage && (
        <div style={{
          marginTop: '20px',
          padding: '12px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '4px'
        }}>
          <strong>Error:</strong> {errorMessage}
        </div>
      )}

      <div style={{
        marginTop: '30px',
        padding: '12px',
        backgroundColor: '#d1ecf1',
        color: '#0c5460',
        border: '1px solid #bee5eb',
        borderRadius: '4px'
      }}>
        <strong>Instructions:</strong>
        <ol style={{ marginTop: '10px', marginBottom: '0' }}>
          <li>Click the &quot;Test Sentry Error&quot; button</li>
          <li>Check the browser console for logs</li>
          <li>Check your Sentry dashboard for the captured error</li>
        </ol>
      </div>
    </div>
  );
}
