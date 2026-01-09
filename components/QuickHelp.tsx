import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Keyboard, MousePointer, Lightbulb, Zap } from 'lucide-react';

interface QuickHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const QuickHelp: React.FC<QuickHelpProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { keys: 'Ctrl + S', action: 'Guardar lección' },
    { keys: 'Ctrl + Z', action: 'Deshacer cambio' },
    { keys: 'Ctrl + Y', action: 'Rehacer cambio' },
    { keys: 'Escape', action: 'Cerrar modal activo' },
    { keys: 'Tab', action: 'Navegar entre campos' },
  ];

  const tips = [
    'Usa la línea de tiempo para navegar rápidamente entre bloques',
    'Los bloques se guardan automáticamente cuando cambias el contenido',
    'Puedes arrastrar bloques para reordenarlos',
    'Haz clic en el ícono "?" para ver el tutorial de cada bloque',
    'Los bloques colapsados siguen siendo visibles para los estudiantes',
    'Usa títulos descriptivos para organizar mejor tu contenido'
  ];

  const features = [
    {
      title: 'Línea de Tiempo Visual',
      description: 'Ve todos los bloques de tu lección de un vistazo',
      icon: <MousePointer className="text-[#0a0a0a]" size={20} />
    },
    {
      title: 'Guardado Automático',
      description: 'Tus cambios se guardan automáticamente mientras trabajas',
      icon: <Zap className="text-green-600" size={20} />
    },
    {
      title: 'Drag & Drop',
      description: 'Arrastra bloques para reordenarlos fácilmente',
      icon: <MousePointer className="text-amber-600" size={20} />
    },
    {
      title: 'Vista Previa en Tiempo Real',
      description: 'Ve cómo se verá tu contenido para los estudiantes',
      icon: <Lightbulb className="text-orange-600" size={20} />
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0a0a0a] rounded-lg flex items-center justify-center">
              <Lightbulb className="text-white" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#0a0a0a]">Ayuda Rápida</h2>
              <p className="text-sm text-gray-600">Consejos y atajos para el editor</p>
            </div>
          </div>
          <Button variant="ghost" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Keyboard Shortcuts */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Keyboard size={18} className="text-[#0a0a0a]" />
              Atajos de Teclado
            </h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {shortcuts.map((shortcut, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-white rounded border">
                    <span className="text-sm text-gray-700">{shortcut.action}</span>
                    <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Zap size={18} className="text-[#0a0a0a]" />
              Características Principales
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {features.map((feature, index) => (
                <div key={index} className="p-4 border border-gray-200 rounded-lg hover:border-[#0a0a0a] transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {feature.icon}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-800 mb-1">{feature.title}</h4>
                      <p className="text-sm text-gray-600">{feature.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Lightbulb size={18} className="text-[#0a0a0a]" />
              Consejos Útiles
            </h3>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <ul className="space-y-2">
                {tips.map((tip, index) => (
                  <li key={index} className="flex items-start gap-2 text-yellow-800">
                    <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></span>
                    <span className="text-sm">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            ¿Necesitas más ayuda? Consulta el tutorial completo de bloques.
          </div>
          <Button
            onClick={onClose}
            className="bg-[#0a0a0a] hover:bg-[#fbbf24] hover:text-[#0a0a0a] text-white"
          >
            Entendido
          </Button>
        </div>
      </div>
    </div>
  );
};

export default QuickHelp;