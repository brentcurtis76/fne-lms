import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';
import { XIcon, UserAddIcon } from '@heroicons/react/outline';

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: RegistrationFormData) => void;
  isSubmitting: boolean;
  showSuccess?: boolean;
}

export interface RegistrationFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  school: string;
}

interface School {
  id: string;
  name: string;
}

const RegistrationModal: React.FC<RegistrationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  showSuccess = false
}) => {
  const supabase = useSupabaseClient();
  const [formData, setFormData] = useState<RegistrationFormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    school: ''
  });

  const [errors, setErrors] = useState<Partial<RegistrationFormData>>({});
  const [schools, setSchools] = useState<School[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // Fetch schools from database when modal opens
  useEffect(() => {
    if (isOpen && schools.length === 0) {
      fetchSchools();
    }
  }, [isOpen]);

  const fetchSchools = async () => {
    setLoadingSchools(true);
    try {
      const { data: schoolsData, error } = await supabase
        .from('schools')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching schools:', error);
        // Fallback to hardcoded schools if database fails
        setSchools([
          { id: '1', name: 'Colegio San Patricio' },
          { id: '2', name: 'Instituto Nacional' },
          { id: '3', name: 'Liceo de Aplicación' },
          { id: '4', name: 'Colegio Saint George' },
          { id: '5', name: 'Colegio Villa María' }
        ]);
      } else {
        setSchools(schoolsData || []);
      }
    } catch (error) {
      console.error('Unexpected error fetching schools:', error);
      // Fallback to hardcoded schools
      setSchools([
        { id: '1', name: 'Colegio San Patricio' },
        { id: '2', name: 'Instituto Nacional' },
        { id: '3', name: 'Liceo de Aplicación' },
        { id: '4', name: 'Colegio Saint George' },
        { id: '5', name: 'Colegio Villa María' }
      ]);
    } finally {
      setLoadingSchools(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<RegistrationFormData> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'El nombre es obligatorio';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'El apellido es obligatorio';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'El email es obligatorio';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'El email no es válido';
    }

    if (!formData.password) {
      newErrors.password = 'La contraseña es obligatoria';
    } else if (formData.password.length < 6) {
      newErrors.password = 'La contraseña debe tener al menos 6 caracteres';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Debes confirmar la contraseña';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden';
    }

    if (!formData.school) {
      newErrors.school = 'Debes seleccionar una escuela';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const handleInputChange = (field: keyof RegistrationFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <UserAddIcon className="h-6 w-6 text-brand_blue mr-3" />
            <h3 className="text-lg font-semibold text-gray-900">
              Registro de Usuario
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <XIcon className="h-6 w-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            {/* First Name */}
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-brand_blue ${
                  errors.firstName ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Tu nombre"
                disabled={isSubmitting}
              />
              {errors.firstName && (
                <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>
              )}
            </div>

            {/* Last Name */}
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                Apellido <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-brand_blue ${
                  errors.lastName ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Tu apellido"
                disabled={isSubmitting}
              />
              {errors.lastName && (
                <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Correo Electrónico <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                autoComplete="email"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-brand_blue ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="tu@email.com"
                disabled={isSubmitting}
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">{errors.email}</p>
              )}
            </div>

            {/* School */}
            <div>
              <label htmlFor="school" className="block text-sm font-medium text-gray-700 mb-1">
                Escuela <span className="text-red-500">*</span>
              </label>
              <select
                id="school"
                value={formData.school}
                onChange={(e) => handleInputChange('school', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-brand_blue ${
                  errors.school ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting || loadingSchools}
              >
                <option value="">
                  {loadingSchools ? 'Cargando escuelas...' : 'Selecciona tu escuela'}
                </option>
                {schools.map((school) => (
                  <option key={school.id} value={school.name}>
                    {school.name}
                  </option>
                ))}
              </select>
              {errors.school && (
                <p className="text-red-500 text-xs mt-1">{errors.school}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Contraseña <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                id="password"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                autoComplete="new-password"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-brand_blue ${
                  errors.password ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Mínimo 6 caracteres"
                disabled={isSubmitting}
              />
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">{errors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirmar Contraseña <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={formData.confirmPassword}
                onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                autoComplete="new-password"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-brand_blue ${
                  errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Repite la contraseña"
                disabled={isSubmitting}
              />
              {errors.confirmPassword && (
                <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>
              )}
            </div>
          </div>

          {showSuccess && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mt-6">
              <div className="flex">
                <UserAddIcon className="h-5 w-5 text-blue-400 mt-0.5 mr-3 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-blue-800 mb-1">
                    Proceso de Registro
                  </h4>
                  <p className="text-sm text-blue-700">
                    Tu solicitud será revisada por un administrador. Recibirás una notificación por email cuando tu cuenta sea aprobada.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-6 mt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue disabled:opacity-50 transition-colors duration-150"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-brand_blue hover:bg-brand_blue/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue disabled:opacity-50 transition-colors duration-150 flex items-center"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Registrando...
                </>
              ) : (
                'Enviar Solicitud'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegistrationModal;