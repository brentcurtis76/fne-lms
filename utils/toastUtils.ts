/**
 * Toast Utility Functions for FNE LMS
 * Wrapper functions for consistent toast notifications
 */

import toast, { ToastOptions } from 'react-hot-toast';
import React from 'react';
import { toastStyles, mobileStyle } from '../constants/toastStyles';
import { SuccessIcon, ErrorIcon, InfoIcon, LoadingIcon } from '../components/toast/ToastIcons';

// Check if the viewport is mobile-sized
const isMobile = () => {
  if (typeof window !== 'undefined') {
    return window.innerWidth < 640;
  }
  return false;
};

// Get responsive styles
const getResponsiveStyle = (baseStyle: any) => {
  if (isMobile()) {
    return {
      ...baseStyle,
      ...mobileStyle,
    };
  }
  return baseStyle;
};

/**
 * Show a success toast notification
 * @param message - The message to display
 * @param options - Additional toast options
 */
export const toastSuccess = (message: string, options?: Partial<ToastOptions>) => {
  return toast.success(message, {
    ...toastStyles.success,
    style: getResponsiveStyle(toastStyles.success.style),
    icon: React.createElement(SuccessIcon),
    ...options,
  });
};

/**
 * Show an error toast notification
 * @param message - The message to display
 * @param options - Additional toast options
 */
export const toastError = (message: string, options?: Partial<ToastOptions>) => {
  return toast.error(message, {
    ...toastStyles.error,
    style: getResponsiveStyle(toastStyles.error.style),
    icon: React.createElement(ErrorIcon),
    ...options,
  });
};

/**
 * Show an info toast notification
 * @param message - The message to display
 * @param options - Additional toast options
 */
export const toastInfo = (message: string, options?: Partial<ToastOptions>) => {
  return toast(message, {
    ...toastStyles.info,
    style: getResponsiveStyle(toastStyles.info.style),
    icon: React.createElement(InfoIcon),
    ...options,
  });
};

/**
 * Show a loading toast notification
 * @param message - The message to display
 * @param options - Additional toast options
 * @returns The toast ID for later dismissal
 */
export const toastLoading = (message: string, options?: Partial<ToastOptions>) => {
  return toast.loading(message, {
    ...toastStyles.loading,
    style: getResponsiveStyle(toastStyles.loading.style),
    icon: React.createElement(LoadingIcon),
    ...options,
  });
};

/**
 * Show a promise-based toast notification
 * @param promise - The promise to track
 * @param messages - Loading, success, and error messages
 * @param options - Additional toast options
 */
export const toastPromise = <T,>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: any) => string);
  },
  options?: Partial<ToastOptions>
) => {
  return toast.promise(
    promise,
    {
      loading: messages.loading,
      success: messages.success,
      error: messages.error,
    },
    {
      style: getResponsiveStyle(toastStyles.info.style),
      success: {
        ...toastStyles.success,
        style: getResponsiveStyle(toastStyles.success.style),
        icon: React.createElement(SuccessIcon),
      },
      error: {
        ...toastStyles.error,
        style: getResponsiveStyle(toastStyles.error.style),
        icon: React.createElement(ErrorIcon),
      },
      loading: {
        ...toastStyles.loading,
        style: getResponsiveStyle(toastStyles.loading.style),
        icon: React.createElement(LoadingIcon),
      },
      ...options,
    }
  );
};

/**
 * Dismiss a specific toast
 * @param toastId - The ID of the toast to dismiss
 */
export const dismissToast = (toastId?: string) => {
  if (toastId) {
    toast.dismiss(toastId);
  } else {
    toast.dismiss();
  }
};

/**
 * Remove all toasts
 */
export const removeAllToasts = () => {
  toast.remove();
};

/**
 * Custom toast with full control over the content
 * @param content - React component or function to render
 * @param options - Additional toast options
 */
export const toastCustom = (
  content: (t: any) => React.ReactElement,
  options?: Partial<ToastOptions>
) => {
  return toast.custom(content as any, {
    style: getResponsiveStyle(toastStyles.info.style),
    ...options,
  });
};

/**
 * Helper function to handle API errors and show appropriate toast
 * @param error - The error object
 * @param fallbackMessage - Fallback message if error message is not available
 */
export const handleApiError = (error: any, fallbackMessage: string = 'Ha ocurrido un error') => {
  let errorMessage = fallbackMessage;
  
  if (error?.response?.data?.message) {
    errorMessage = error.response.data.message;
  } else if (error?.message) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  }
  
  // Check for common error patterns
  if (errorMessage.toLowerCase().includes('network')) {
    errorMessage = 'Error de conexión. Verifica tu conexión a internet';
  } else if (errorMessage.toLowerCase().includes('unauthorized')) {
    errorMessage = 'No tienes permisos para realizar esta acción';
  } else if (errorMessage.toLowerCase().includes('timeout')) {
    errorMessage = 'La operación tardó demasiado. Por favor, intenta nuevamente';
  }
  
  toastError(errorMessage);
};

/**
 * Show a confirmation toast with action buttons
 * WARNING: This should NOT be used for important confirmations like deletions.
 * Use a proper modal component (ConfirmModal) instead.
 * This is only for minor, non-critical confirmations.
 * @param message - The confirmation message
 * @param onConfirm - Callback when confirmed
 * @param onCancel - Callback when cancelled
 * @deprecated Use ConfirmModal component for important confirmations
 */
export const toastConfirm = (
  message: string,
  onConfirm: () => void,
  onCancel?: () => void
) => {
  return toastCustom(
    (t) => React.createElement('div', {},
      React.createElement('p', { className: 'mb-3' }, message),
      React.createElement('div', { className: 'flex gap-2 justify-end' },
        React.createElement('button', {
          onClick: () => {
            toast.dismiss(t.id);
            onCancel?.();
          },
          className: 'px-3 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors'
        }, 'Cancelar'),
        React.createElement('button', {
          onClick: () => {
            toast.dismiss(t.id);
            onConfirm();
          },
          className: 'px-3 py-1 text-sm bg-[#00365b] text-white rounded hover:bg-[#00365b]/90 transition-colors'
        }, 'Confirmar')
      )
    ),
    {
      duration: Infinity,
    }
  );
};

// Export the base toast object for advanced use cases
export { toast };