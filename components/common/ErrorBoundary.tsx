/**
 * Error Boundary Component
 * Catches JavaScript errors and displays fallback UI
 *
 * QA Integration: When in a QA testing session, automatically captures
 * error details including screenshots for debugging.
 */

import React, { Component, ReactNode } from 'react';
import { AlertCircle, Camera, RefreshCw } from 'lucide-react';

// QA Session Storage Key
const QA_SESSION_KEY = 'qa_test_run_id';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  capturedScreenshot?: string | null;
  isCapturing: boolean;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: any) => void;
  /** When true, enables QA capture integration regardless of session state */
  forceQACapture?: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, isCapturing: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  async componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by ErrorBoundary:', error, errorInfo);

    this.setState({ errorInfo });

    // Call the onError callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Check if we're in a QA session
    const isQASession = this.isInQASession();

    if (isQASession || this.props.forceQACapture) {
      await this.captureQAErrorData(error, errorInfo);
    }
  }

  /**
   * Check if there's an active QA test run session
   */
  isInQASession(): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const testRunId = sessionStorage.getItem(QA_SESSION_KEY);
      return !!testRunId;
    } catch {
      return false;
    }
  }

  /**
   * Get the current QA test run ID
   */
  getQATestRunId(): string | null {
    if (typeof window === 'undefined') return null;

    try {
      return sessionStorage.getItem(QA_SESSION_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Capture error data for QA debugging
   */
  async captureQAErrorData(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ isCapturing: true });

    try {
      // Capture screenshot using html2canvas
      let screenshotDataUrl: string | null = null;

      if (typeof window !== 'undefined') {
        try {
          const html2canvas = (await import('html2canvas')).default;
          const canvas = await html2canvas(document.body, {
            logging: false,
            useCORS: true,
            allowTaint: true,
            scale: 0.5, // Reduce size for performance
          });
          screenshotDataUrl = canvas.toDataURL('image/png', 0.7);
          this.setState({ capturedScreenshot: screenshotDataUrl });
        } catch (screenshotError) {
          console.error('Failed to capture screenshot:', screenshotError);
        }
      }

      // Build error data for QA system
      const qaErrorData = {
        type: 'react_error',
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        componentStack: errorInfo.componentStack,
        url: typeof window !== 'undefined' ? window.location.href : null,
        timestamp: new Date().toISOString(),
        screenshot: screenshotDataUrl,
      };

      // Store in sessionStorage for the QA test runner to pick up
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('qa_error_capture', JSON.stringify(qaErrorData));
        } catch (storageError) {
          console.error('Failed to store QA error data:', storageError);
        }
      }

      // Also log to console in a format the QA capture hook can pick up
      console.error('[QA_ERROR_CAPTURE]', JSON.stringify(qaErrorData));

      // If we have a test run ID, try to notify the QA system
      const testRunId = this.getQATestRunId();
      if (testRunId) {
        this.notifyQASystem(testRunId, qaErrorData);
      }
    } catch (captureError) {
      console.error('Error during QA capture:', captureError);
    } finally {
      this.setState({ isCapturing: false });
    }
  }

  /**
   * Notify the QA system about the error (best effort)
   */
  async notifyQASystem(testRunId: string, errorData: any) {
    try {
      // This is a best-effort notification - don't block on failure
      await fetch('/api/qa/error-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_run_id: testRunId,
          error_data: errorData,
        }),
      });
    } catch {
      // Silently fail - the error data is still in sessionStorage
    }
  }

  /**
   * Attempt to recover by reloading
   */
  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isQASession = this.isInQASession();

      return (
        <div className="flex items-center justify-center p-6 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-center max-w-md">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <h3 className="text-sm font-medium text-gray-700 mb-1">
              Error al cargar el componente
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              {this.state.error?.message || 'Ha ocurrido un error inesperado'}
            </p>

            {/* QA Session indicator */}
            {isQASession && (
              <div className="mb-4 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                <div className="flex items-center justify-center gap-1 text-yellow-700">
                  {this.state.isCapturing ? (
                    <>
                      <Camera className="w-3 h-3 animate-pulse" />
                      <span>Capturando datos para QA...</span>
                    </>
                  ) : this.state.capturedScreenshot ? (
                    <>
                      <Camera className="w-3 h-3 text-green-600" />
                      <span className="text-green-700">Datos capturados para debugging</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-3 h-3" />
                      <span>Sesión de QA activa</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Error details for debugging */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="text-left text-xs text-gray-500 mb-3">
                <summary className="cursor-pointer hover:text-gray-700">
                  Detalles del error
                </summary>
                <pre className="mt-2 p-2 bg-gray-100 rounded overflow-auto max-h-40 text-[10px]">
                  {this.state.error.stack}
                </pre>
                {this.state.errorInfo?.componentStack && (
                  <pre className="mt-2 p-2 bg-gray-100 rounded overflow-auto max-h-40 text-[10px]">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}

            <div className="flex gap-2 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Reintentar
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 text-xs bg-brand_blue text-white rounded hover:bg-brand_blue/90 transition-colors"
              >
                Recargar página
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
