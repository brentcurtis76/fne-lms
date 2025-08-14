import React, { useState } from 'react';

export default function YouTubeHelper() {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowHelp(!showHelp)}
        className="ml-2 text-blue-600 hover:text-blue-800 text-xs font-medium"
      >
        ¿Cómo agregar videos?
      </button>
      
      {showHelp && (
        <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-sm text-blue-900 mb-2">📹 Agregar Videos de YouTube</h4>
          <ol className="text-xs text-blue-800 space-y-1">
            <li>1. Copia el enlace del video de YouTube</li>
            <li>2. Pégalo en cualquier parte del contenido</li>
            <li>3. El video se mostrará automáticamente con un reproductor elegante</li>
          </ol>
          <div className="mt-3 text-xs text-blue-700">
            <strong>Formatos soportados:</strong>
            <ul className="mt-1 space-y-1 ml-3">
              <li>• youtube.com/watch?v=...</li>
              <li>• youtu.be/...</li>
              <li>• youtube.com/shorts/...</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => setShowHelp(false)}
            className="mt-3 text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Cerrar ayuda
          </button>
        </div>
      )}
    </>
  );
}