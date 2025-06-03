import React from 'react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  type: 'no-data' | 'no-results' | 'error' | 'offline' | 'permission-denied';
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const EmptyStates = {
  'no-data': {
    icon: (
      <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 48 48">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m-6 4h6m-6 4h6" />
      </svg>
    ),
    title: 'No hay datos disponibles',
    description: 'Los datos aparecerán aquí cuando estén disponibles.',
    color: 'text-gray-400'
  },
  'no-results': {
    icon: (
      <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 48 48">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    title: 'No se encontraron resultados',
    description: 'Intenta ajustar los filtros o términos de búsqueda.',
    color: 'text-blue-400'
  },
  'error': {
    icon: (
      <svg className="mx-auto h-16 w-16 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 48 48">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Error al cargar los datos',
    description: 'Ocurrió un problema al cargar la información. Por favor, inténtalo de nuevo.',
    color: 'text-red-400'
  },
  'offline': {
    icon: (
      <svg className="mx-auto h-16 w-16 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 48 48">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M18.364 5.636l-2.828 2.828m0 0L12.707 5.636m2.829 2.828A9 9 0 1021.899 15M12 21a9.014 9.014 0 008.217-5.109m0 0a9.014 9.014 0 01-.217-.183m0 .183A9.014 9.014 0 0112 21m9.717-4.891a.5.5 0 01-.183-.217m0 .217A9.014 9.014 0 0121.899 15M12 21l-1.414-1.414" />
      </svg>
    ),
    title: 'Sin conexión',
    description: 'Verifica tu conexión a internet e inténtalo de nuevo.',
    color: 'text-orange-400'
  },
  'permission-denied': {
    icon: (
      <svg className="mx-auto h-16 w-16 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 48 48">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v5a3 3 0 006 0v-5m0 0V9a3 3 0 00-6 0v6m6-6a3 3 0 116 0v6m-6-6a3 3 0 00-6 0v6" />
      </svg>
    ),
    title: 'Acceso restringido',
    description: 'No tienes permisos para ver esta información.',
    color: 'text-yellow-400'
  }
};

export default function EmptyState({
  type,
  title,
  description,
  actionLabel,
  onAction,
  className = ""
}: EmptyStateProps) {
  const state = EmptyStates[type];
  const displayTitle = title || state.title;
  const displayDescription = description || state.description;

  return (
    <motion.div
      className={`flex flex-col items-center justify-center p-12 text-center ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        {state.icon}
      </motion.div>
      
      <motion.h3
        className="mt-4 text-lg font-semibold text-gray-900"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        {displayTitle}
      </motion.h3>
      
      <motion.p
        className="mt-2 text-sm text-gray-500 max-w-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        {displayDescription}
      </motion.p>

      {actionLabel && onAction && (
        <motion.button
          onClick={onAction}
          className="mt-6 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-[#00365b] hover:bg-[#00365b]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00365b] transition-colors"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          whileTap={{ scale: 0.95 }}
        >
          {actionLabel}
        </motion.button>
      )}
    </motion.div>
  );
}

// Specific components for common scenarios
export const NoData: React.FC<Omit<EmptyStateProps, 'type'>> = (props) => (
  <EmptyState type="no-data" {...props} />
);

export const NoResults: React.FC<Omit<EmptyStateProps, 'type'>> = (props) => (
  <EmptyState type="no-results" {...props} />
);

export const ErrorState: React.FC<Omit<EmptyStateProps, 'type'>> = (props) => (
  <EmptyState type="error" {...props} />
);

export const OfflineState: React.FC<Omit<EmptyStateProps, 'type'>> = (props) => (
  <EmptyState type="offline" {...props} />
);

export const PermissionDenied: React.FC<Omit<EmptyStateProps, 'type'>> = (props) => (
  <EmptyState type="permission-denied" {...props} />
);