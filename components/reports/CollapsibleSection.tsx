import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CollapsibleSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
  showOnMobile?: boolean;
  badge?: string | number;
  icon?: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  isExpanded,
  onToggle,
  children,
  className = '',
  showOnMobile = true,
  badge,
  icon
}) => {
  return (
    <motion.div 
      className={`bg-white rounded-lg shadow border border-gray-200 overflow-hidden ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.button
        onClick={onToggle}
        className="w-full px-4 md:px-6 py-4 flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-[#fdb933] focus:ring-inset hover:bg-gray-50 transition-colors"
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center space-x-3">
          {icon && (
            <div className="text-[#00365b]">
              {icon}
            </div>
          )}
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {badge && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#fdb933] text-white">
              {badge}
            </span>
          )}
        </div>
        <motion.svg 
          className="w-5 h-5 text-gray-500"
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </motion.button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="border-t border-gray-100 overflow-hidden"
          >
            <div className="px-4 md:px-6 py-4 md:py-6">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default CollapsibleSection;