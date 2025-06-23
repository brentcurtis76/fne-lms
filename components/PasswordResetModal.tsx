import React, { useState } from 'react';
import { X, Key, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';

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

  const generateRandomPassword = () => {
    const length = 12;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setTemporaryPassword(password);
    setConfirmPassword(password);
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

    if (temporaryPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
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
            <div className="bg-[#fdb933] p-2 rounded-lg">
              <Key className="h-6 w-6 text-[#00365b]" />
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
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-[#00365b] focus:ring-[#00365b] sm:text-sm"
                  placeholder="Ingresa una contraseña temporal"
                  required
                  minLength={6}
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
                className="mt-2 text-sm text-[#00365b] hover:text-[#002844] font-medium"
              >
                Generar contraseña aleatoria
              </button>
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
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#00365b] focus:ring-[#00365b] sm:text-sm"
                placeholder="Confirma la contraseña"
                required
                minLength={6}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 px-6 py-4 bg-gray-50 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={isResetting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00365b] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isResetting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#00365b] border border-transparent rounded-md hover:bg-[#002844] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00365b] disabled:opacity-50"
            >
              {isResetting ? 'Restableciendo...' : 'Restablecer Contraseña'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}