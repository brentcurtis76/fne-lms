import React, { useState } from 'react';
import Header from '../../components/layout/Header';

const TestSpanishInput = () => {
  const [testInput, setTestInput] = useState('');
  const [charCodes, setCharCodes] = useState<string[]>([]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTestInput(value);
    
    // Log character codes
    const codes = value.split('').map(char => 
      `${char}: ${char.charCodeAt(0)} (U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`
    );
    setCharCodes(codes);
  };

  const testStrings = [
    '¿Qué es el plan personal?',
    '¡Hola! ¿Cómo estás?',
    'Módulo de introducción',
    'Niño, año, señor',
    'áéíóú ÁÉÍÓÚ ñÑ'
  ];

  return (
    <>
      <Header user={null} isAdmin={false} showNavigation={true} />
      <div className="min-h-screen bg-brand_beige px-4 py-8" style={{ marginTop: '120px' }}>
        <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-2xl font-bold text-brand_primary mb-6">Test de Entrada de Caracteres Españoles</h1>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-brand_primary mb-2">
                Campo de prueba - Intenta escribir: módulo, ¿qué?, niño, etc.
              </label>
              <input
                type="text"
                value={testInput}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-brand_primary/50 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_accent"
                placeholder="Escribe aquí caracteres especiales del español..."
                lang="es"
                spellCheck="true"
                autoComplete="off"
              />
            </div>

            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="font-semibold text-brand_primary mb-2">Valor actual:</h3>
              <p className="font-mono text-lg">{testInput || '(vacío)'}</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="font-semibold text-brand_primary mb-2">Códigos de caracteres:</h3>
              <ul className="space-y-1 font-mono text-sm">
                {charCodes.map((code, idx) => (
                  <li key={idx}>{code}</li>
                ))}
              </ul>
            </div>

            <div className="bg-brand_beige p-4 rounded-md">
              <h3 className="font-semibold text-brand_primary mb-2">Prueba copiando y pegando estos textos:</h3>
              <ul className="space-y-2">
                {testStrings.map((str, idx) => (
                  <li key={idx} className="flex items-center justify-between">
                    <span className="font-mono">{str}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(str);
                        alert('Copiado al portapapeles');
                      }}
                      className="ml-4 px-3 py-1 bg-brand_primary text-white text-sm rounded hover:bg-gray-800"
                    >
                      Copiar
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-yellow-50 p-4 rounded-md">
              <h3 className="font-semibold text-brand_primary mb-2">Información del navegador:</h3>
              <p className="text-sm">
                <strong>User Agent:</strong> {typeof window !== 'undefined' ? navigator.userAgent : 'N/A'}
              </p>
              <p className="text-sm">
                <strong>Idioma:</strong> {typeof window !== 'undefined' ? navigator.language : 'N/A'}
              </p>
              <p className="text-sm">
                <strong>Codificación del documento:</strong> {typeof document !== 'undefined' ? document.characterSet : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default TestSpanishInput;