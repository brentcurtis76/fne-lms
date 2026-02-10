import { useState, useEffect } from 'react';
import { LockClosedIcon, EyeIcon, EyeOffIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline';
import { CheckCircleIcon } from '@heroicons/react/solid';
import { toastSuccess, toastError } from '../../utils/toastUtils';

const PASSWORD_SUCCESS_KEY = 'fne-password-change-success';

interface PasswordChangeSectionProps {
  userEmail: string;
}

export default function PasswordChangeSection({ userEmail }: PasswordChangeSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);

  // Check for persisted success state on mount (survives auth-triggered reloads)
  useEffect(() => {
    try {
      const savedSuccess = sessionStorage.getItem(PASSWORD_SUCCESS_KEY);
      if (savedSuccess === 'true') {
        setSuccessMessage(true);
        setIsExpanded(true);
        // Clear it after displaying
        sessionStorage.removeItem(PASSWORD_SUCCESS_KEY);
        // Also show toast in case user landed here after redirect
        toastSuccess('Contraseña actualizada exitosamente');
      }
    } catch (e) {
      // Ignore sessionStorage errors
    }
  }, []);

  // Password validation helpers
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const allRequirementsMet = hasMinLength && hasUppercase && hasLowercase && hasNumber && passwordsMatch;

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setSuccessMessage(false);
  };

  const handleCancel = () => {
    resetForm();
    setIsExpanded(false);
  };

  const handleSubmit = async () => {
    if (!allRequirementsMet) {
      toastError('Por favor cumple todos los requisitos de la contraseña');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al cambiar la contraseña');
      }

      // Persist success state to sessionStorage FIRST (survives auth-triggered page reloads)
      try {
        sessionStorage.setItem(PASSWORD_SUCCESS_KEY, 'true');
      } catch (e) {
        console.error('[PasswordChange] Failed to save success flag:', e);
      }

      // Show inline success message immediately
      setSuccessMessage(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      // Also show toast as backup
      toastSuccess('Contraseña actualizada exitosamente');
    } catch (error: any) {
      console.error('Password change error:', error);
      toastError(error.message || 'Error al actualizar la contraseña');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-8 mb-6">
      {/* Collapsible Header */}
      <div
        className={`bg-gray-50 rounded-xl border border-gray-200 transition-all duration-300 ${
          isExpanded ? 'rounded-b-none border-b-0' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-100 rounded-xl transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0a0a0a] rounded-full flex items-center justify-center">
              <LockClosedIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#0a0a0a]">Seguridad</h3>
              <p className="text-sm text-gray-500">Cambiar tu contraseña de acceso</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[#0a0a0a]">
            <span className="text-sm font-medium">
              {isExpanded ? 'Contraer' : 'Expandir'}
            </span>
            {isExpanded ? (
              <ChevronUpIcon className="w-5 h-5" />
            ) : (
              <ChevronDownIcon className="w-5 h-5" />
            )}
          </div>
        </button>
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6 animate-fadeIn">
          {/* Success Message */}
          {successMessage ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-[#fbbf24]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircleIcon className="w-10 h-10 text-[#fbbf24]" />
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">
                ¡Contraseña actualizada!
              </h4>
              <p className="text-gray-600 mb-6">
                Tu contraseña ha sido cambiada exitosamente.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSuccessMessage(false);
                  setIsExpanded(false);
                }}
                className="px-6 py-3 rounded-xl bg-[#0a0a0a] text-white hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition duration-300"
              >
                Cerrar
              </button>
            </div>
          ) : (
          <div className="space-y-5">
            {/* Current Password */}
            <div>
              <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1">
                Contraseña actual <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
                  placeholder="Ingresa tu contraseña actual"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCurrentPassword ? (
                    <EyeOffIcon className="w-5 h-5" />
                  ) : (
                    <EyeIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
                Nueva contraseña <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
                  placeholder="Ingresa tu nueva contraseña"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewPassword ? (
                    <EyeOffIcon className="w-5 h-5" />
                  ) : (
                    <EyeIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                Confirmar nueva contraseña <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
                  placeholder="Confirma tu nueva contraseña"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? (
                    <EyeOffIcon className="w-5 h-5" />
                  ) : (
                    <EyeIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
              {confirmPassword && !passwordsMatch && (
                <p className="mt-1 text-sm text-red-500">Las contraseñas no coinciden</p>
              )}
            </div>

            {/* Password Requirements */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">
                Requisitos de la contraseña:
              </p>
              <ul className="space-y-2">
                <li className={`flex items-center gap-2 text-sm ${hasMinLength ? 'text-[#fbbf24]' : 'text-gray-500'}`}>
                  {hasMinLength ? (
                    <CheckCircleIcon className="w-5 h-5" />
                  ) : (
                    <span className="w-5 h-5 flex items-center justify-center">•</span>
                  )}
                  Al menos 8 caracteres
                </li>
                <li className={`flex items-center gap-2 text-sm ${hasUppercase ? 'text-[#fbbf24]' : 'text-gray-500'}`}>
                  {hasUppercase ? (
                    <CheckCircleIcon className="w-5 h-5" />
                  ) : (
                    <span className="w-5 h-5 flex items-center justify-center">•</span>
                  )}
                  Al menos una letra mayúscula
                </li>
                <li className={`flex items-center gap-2 text-sm ${hasLowercase ? 'text-[#fbbf24]' : 'text-gray-500'}`}>
                  {hasLowercase ? (
                    <CheckCircleIcon className="w-5 h-5" />
                  ) : (
                    <span className="w-5 h-5 flex items-center justify-center">•</span>
                  )}
                  Al menos una letra minúscula
                </li>
                <li className={`flex items-center gap-2 text-sm ${hasNumber ? 'text-[#fbbf24]' : 'text-gray-500'}`}>
                  {hasNumber ? (
                    <CheckCircleIcon className="w-5 h-5" />
                  ) : (
                    <span className="w-5 h-5 flex items-center justify-center">•</span>
                  )}
                  Al menos un número
                </li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSubmitting}
                className="px-6 py-3 rounded-xl border-2 border-gray-300 text-gray-700 hover:bg-gray-100 transition duration-300 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !allRequirementsMet || !currentPassword}
                className="px-6 py-3 rounded-xl bg-[#0a0a0a] text-white hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Actualizando...' : 'Actualizar Contraseña'}
              </button>
            </div>
          </div>
          )}

          <style jsx>{`
            @keyframes fadeIn {
              from {
                opacity: 0;
                transform: translateY(-10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            .animate-fadeIn {
              animation: fadeIn 0.2s ease-out;
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
