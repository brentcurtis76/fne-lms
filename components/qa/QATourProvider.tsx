/**
 * QATourProvider Component
 *
 * Wraps QA page content and provides interactive onboarding tours.
 * Uses driver.js for tour functionality and useOnboarding for state persistence.
 */

import React, { useEffect, useRef, useState, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { driver, Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useOnboarding } from '@/hooks/useOnboarding';
import { getTourById, TourConfig } from '@/lib/tours/qa-tours';
import { RefreshCw } from 'lucide-react';

// Constants for timing (extracted from magic numbers)
const TOUR_INIT_DELAY_MS = 500;
const TOUR_RESTART_DELAY_MS = 100;

// Error boundary for tour-related errors
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

class TourErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[QATourProvider] Tour error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || this.props.children;
    }
    return this.props.children;
  }
}

interface QATourProviderProps {
  tourId: string;
  children: React.ReactNode;
}

// Inner component that handles the tour logic
const QATourProviderInner: React.FC<QATourProviderProps> = ({
  tourId,
  children
}) => {
  const {
    loading: onboardingLoading,
    shouldShowTour,
    hasCompletedTour,
    markTourComplete,
    skipTour,
    resetTour
  } = useOnboarding();

  const [tourStarted, setTourStarted] = useState(false);
  const [showRestartButton, setShowRestartButton] = useState(false);
  const driverRef = useRef<Driver | null>(null);
  const tourConfig = getTourById(tourId);

  // Check if all required tour elements exist in the DOM
  const checkTourElementsExist = useCallback((config: TourConfig): boolean => {
    for (const step of config.steps) {
      if (step.element && typeof step.element === 'string') {
        const element = document.querySelector(step.element);
        if (!element) {
          console.warn(`[QATourProvider] Tour element not found: ${step.element}`);
          return false;
        }
      }
    }
    return true;
  }, []);

  // Cleanup driver instance safely
  const cleanupDriver = useCallback(() => {
    if (driverRef.current) {
      try {
        driverRef.current.destroy();
      } catch (error) {
        console.error('[QATourProvider] Error destroying driver:', error);
      } finally {
        driverRef.current = null;
      }
    }
  }, []);

  // Start the tour with proper error handling
  const startTour = useCallback(() => {
    if (!tourConfig) return;

    // Check if all required elements exist
    if (!checkTourElementsExist(tourConfig)) {
      console.warn('[QATourProvider] Some tour elements are missing, tour will not start');
      setShowRestartButton(true);
      return;
    }

    // Cleanup any existing driver instance
    cleanupDriver();

    setTourStarted(true);

    try {
      // Create driver instance with custom configuration
      const driverInstance = driver({
        showProgress: true,
        animate: true,
        overlayColor: 'rgba(251, 191, 36, 0.1)', // brand_accent at 10%
        stagePadding: 8,
        stageRadius: 8,
        allowClose: true,
        disableActiveInteraction: false,
        popoverClass: 'qa-tour-popover',
        steps: tourConfig.steps.map((step, index) => ({
          ...step,
          popover: {
            ...step.popover,
            // Add Spanish button labels
            nextBtnText: index === tourConfig.steps.length - 1 ? 'Finalizar' : 'Siguiente',
            prevBtnText: 'Anterior',
            doneBtnText: 'Finalizar',
          }
        })),
        onDestroyStarted: () => {
          // Called when user clicks close or the tour ends
          if (driverRef.current) {
            const activeIndex = driverRef.current.getActiveIndex();
            const isLastStep = activeIndex === tourConfig.steps.length - 1;

            if (isLastStep) {
              // Tour completed
              markTourComplete(tourId);
              setShowRestartButton(true);
            } else {
              // Tour was skipped
              skipTour(tourId);
              setShowRestartButton(true);
            }
          }
          cleanupDriver();
        },
        onDestroyed: () => {
          setTourStarted(false);
        }
      });

      driverRef.current = driverInstance;
      driverInstance.drive();
    } catch (error) {
      console.error('[QATourProvider] Error initializing tour:', error);
      setTourStarted(false);
      setShowRestartButton(true);
    }
  }, [tourConfig, tourId, markTourComplete, skipTour, checkTourElementsExist, cleanupDriver]);

  // Initialize and start tour if needed
  useEffect(() => {
    if (onboardingLoading || !tourConfig || tourStarted) return;

    // Wait for DOM elements to be rendered
    const timeout = setTimeout(() => {
      // Show restart button if tour was completed
      if (hasCompletedTour(tourId)) {
        setShowRestartButton(true);
      }

      // Auto-start tour if not completed or skipped
      if (shouldShowTour(tourId)) {
        startTour();
      }
    }, TOUR_INIT_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [onboardingLoading, tourId, tourConfig, tourStarted, shouldShowTour, hasCompletedTour, startTour]);

  // Cleanup driver on unmount
  useEffect(() => {
    return () => {
      cleanupDriver();
    };
  }, [cleanupDriver]);

  const handleRestartTour = async () => {
    // Reset the tour state first
    await resetTour(tourId);
    setShowRestartButton(false);

    // Small delay to ensure state is updated
    setTimeout(() => {
      startTour();
    }, TOUR_RESTART_DELAY_MS);
  };

  return (
    <div className="relative">
      {/* Restart Tour Button */}
      {showRestartButton && !tourStarted && (
        <button
          onClick={handleRestartTour}
          className="fixed top-20 right-4 z-40 inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-md text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
          title="Repetir el tour de esta pagina"
          aria-label="Repetir el tour de introduccion de esta pagina"
        >
          <RefreshCw className="w-4 h-4 text-brand_accent" aria-hidden="true" />
          <span className="hidden sm:inline">Repetir Tour</span>
        </button>
      )}

      {/* Page Content */}
      {children}
    </div>
  );
};

// Main exported component wrapped in error boundary
export const QATourProvider: React.FC<QATourProviderProps> = (props) => {
  return (
    <TourErrorBoundary>
      <QATourProviderInner {...props} />
    </TourErrorBoundary>
  );
};

export default QATourProvider;
