import React, { useState } from 'react';
import { X, Key, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { generatePassword } from '../utils/passwordGenerator';
import {
  PASSWORD_POLICY,
  PASSWORD_RULES,
  firstPasswordPolicyError,
} from '../lib/auth/password-policy';

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    email: string;
    name: string;
  } | null;
  onPasswordReset: (userId: string, temporaryPassword: string) => Promise<void>;
}

export default function PasswordResetModal({ 
  isOpen, 
  onClose, 
  user,
  onPasswordReset 
}: PasswordResetModalProps) {
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (!isOpen || !user) return null;

  // S6: was `Math.random()` over a 68-character set. The generator is now the
  // shared CSPRNG one, and its output satisfies the shared policy by
  // construction — the same policy `handleSubmit` checks below and the server
  // re-checks in /api/admin/reset-password.
  const generateRandomPassword = () => {
    const password = generatePassword();
    setTemporaryPassword(password);
    setConfirmPassword(password);
    setShowPassword(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!temporaryPassword.trim()) {
      toast.error('Por favor ingresa una contraseña temporal');
      return;
    }

    if (temporaryPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    // S5: this form used to accept six characters with no character-class
    // requirement, so an administrator could set a temporary password the
    // platform would then refuse as the user's own replacement.
    const policyError = firstPasswordPolicyError(temporaryPassword);
    if (policyError) {
      toast.error(policyError);
      return;
    }

    try {
      setIsResetting(true);
      await onPasswordReset(user.id, temporaryPassword);
      toast.success('Contraseña restablecida correctamente');
      onClose();
      setTemporaryPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Error resetting password:', error);
      toast.error('Error al restablecer la contraseña');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <div className="bg-[#fbbf24] p-2 rounded-lg">
              <Key className="h-6 w-6 text-[#0a0a0a]" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Restablecer Contraseña
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6">
            {/* User info */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Usuario:</p>
              <p className="font-medium text-gray-900">{user.name}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>

            {/* Warning */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Importante
                  </h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    El usuario deberá cambiar esta contraseña temporal en su próximo inicio de sesión.
                  </p>
                </div>
              </div>
            </div>

            {/* Password fields */}
            <div>
              <label htmlFor="temporaryPassword" className="block text-sm font-medium text-gray-700">
                Contraseña Temporal
              </label>
              <div className="mt-1 relative">
                <input
                  type={showPassword ? "text" : "password"}
                  id="temporaryPassword"
                  value={temporaryPassword}
                  onChange={(e) => setTemporaryPassword(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-[#0a0a0a] focus:ring-[#0a0a0a] sm:text-sm"
                  placeholder="Ingresa una contraseña temporal"
                  required
                  minLength={PASSWORD_POLICY.minLength}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm text-gray-600 hover:text-gray-800"
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              <button
                type="button"
                onClick={generateRandomPassword}
                data-testid="reset-generate-password"
                className="mt-2 text-sm text-[#0a0a0a] hover:text-[#002844] font-medium"
              >
                Generar contraseña segura
              </button>

              <ul className="mt-3 space-y-1 text-xs text-gray-600">
                {PASSWORD_RULES.map((rule) => {
                  const met = rule.test(temporaryPassword);
                  return (
                    <li
                      key={rule.id}
                      className={`flex items-center gap-1 ${met ? 'text-green-600' : ''}`}
                    >
                      <span>{met ? '\u2713' : '\u2022'}</span>
                      {rule.label}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirmar Contraseña
              </label>
              <input
                type={showPassword ? "text" : "password"}
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#0a0a0a] focus:ring-[#0a0a0a] sm:text-sm"
                placeholder="Confirma la contraseña"
                required
                minLength={PASSWORD_POLICY.minLength}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 px-6 py-4 bg-gray-50 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={isResetting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0a0a0a] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isResetting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0a0a0a] border border-transparent rounded-md hover:bg-[#002844] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0a0a0a] disabled:opacity-50"
            >
              {isResetting ? 'Restableciendo...' : 'Restablecer Contraseña'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}