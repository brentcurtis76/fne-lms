import React from 'react';

interface TermsOfUseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TermsOfUseModal({ isOpen, onClose }: TermsOfUseModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden shadow-xl">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Términos de Uso</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Content */}
          <div className="px-6 py-6 overflow-y-auto max-h-[calc(80vh-100px)]">
            <div className="prose prose-gray max-w-none">
              <p className="text-sm text-gray-600 mb-4">Última actualización: {new Date().toLocaleDateString('es-CL')}</p>
              
              <h3 className="text-lg font-semibold mb-3">1. Aceptación de los Términos</h3>
              <p className="mb-4">
                Al acceder y utilizar el sitio web de Fundación Nueva Educación (FNE) y su Plataforma de Crecimiento, usted acepta y se compromete a cumplir con estos Términos de Uso. Si no está de acuerdo con estos términos, no debe utilizar nuestros servicios.
              </p>

              <h3 className="text-lg font-semibold mb-3">2. Descripción del Servicio</h3>
              <p className="mb-4">
                FNE proporciona una plataforma educativa digital y servicios de acompañamiento para la transformación educativa, incluyendo:
              </p>
              <ul className="list-disc pl-6 mb-4">
                <li>Acceso a recursos educativos y materiales de formación</li>
                <li>Herramientas de colaboración para comunidades educativas</li>
                <li>Cursos y rutas de aprendizaje personalizadas</li>
                <li>Espacios de trabajo colaborativo</li>
                <li>Sistemas de evaluación y seguimiento del progreso</li>
              </ul>

              <h3 className="text-lg font-semibold mb-3">3. Registro y Cuenta de Usuario</h3>
              <p className="mb-4">
                Para acceder a ciertas funcionalidades de la plataforma, debe crear una cuenta proporcionando información precisa y completa. Usted es responsable de:
              </p>
              <ul className="list-disc pl-6 mb-4">
                <li>Mantener la confidencialidad de su contraseña</li>
                <li>Todas las actividades que ocurran bajo su cuenta</li>
                <li>Notificar inmediatamente cualquier uso no autorizado</li>
                <li>Actualizar su información cuando sea necesario</li>
              </ul>

              <h3 className="text-lg font-semibold mb-3">4. Uso Apropiado</h3>
              <p className="mb-4">
                Usted se compromete a utilizar nuestros servicios de manera responsable y no deberá:
              </p>
              <ul className="list-disc pl-6 mb-4">
                <li>Violar leyes locales, nacionales o internacionales</li>
                <li>Transmitir contenido ilegal, ofensivo, difamatorio o discriminatorio</li>
                <li>Intentar acceder sin autorización a otros sistemas o cuentas</li>
                <li>Interferir con el funcionamiento normal de la plataforma</li>
                <li>Usar la plataforma para enviar spam o contenido no solicitado</li>
                <li>Compartir credenciales de acceso con terceros no autorizados</li>
                <li>Realizar ingeniería inversa o intentar extraer el código fuente</li>
              </ul>

              <h3 className="text-lg font-semibold mb-3">5. Propiedad Intelectual</h3>
              <p className="mb-4">
                Todo el contenido presente en la plataforma, incluyendo textos, gráficos, logos, imágenes, videos, y software, es propiedad de FNE o de sus licenciantes y está protegido por las leyes de propiedad intelectual.
              </p>
              <p className="mb-4">
                Usted puede descargar y utilizar los materiales educativos proporcionados únicamente para fines educativos no comerciales, respetando siempre la atribución correspondiente.
              </p>

              <h3 className="text-lg font-semibold mb-3">6. Contenido del Usuario</h3>
              <p className="mb-4">
                Al publicar contenido en nuestra plataforma, usted:
              </p>
              <ul className="list-disc pl-6 mb-4">
                <li>Conserva sus derechos de propiedad intelectual</li>
                <li>Otorga a FNE una licencia no exclusiva para usar, reproducir y distribuir dicho contenido dentro de la plataforma</li>
                <li>Garantiza que tiene los derechos necesarios sobre el contenido que comparte</li>
                <li>Acepta que FNE puede moderar o eliminar contenido que viole estos términos</li>
              </ul>

              <h3 className="text-lg font-semibold mb-3">7. Privacidad y Protección de Datos</h3>
              <p className="mb-4">
                El tratamiento de sus datos personales se rige por nuestra Política de Privacidad. Al usar nuestros servicios, acepta las prácticas descritas en dicha política.
              </p>

              <h3 className="text-lg font-semibold mb-3">8. Limitación de Responsabilidad</h3>
              <p className="mb-4">
                FNE proporciona la plataforma "tal como está" y no garantiza que el servicio sea ininterrumpido o libre de errores. En la máxima medida permitida por la ley, FNE no será responsable por:
              </p>
              <ul className="list-disc pl-6 mb-4">
                <li>Daños indirectos, incidentales o consecuentes</li>
                <li>Pérdida de datos o información</li>
                <li>Interrupciones del servicio</li>
                <li>Contenido de terceros accesible a través de la plataforma</li>
              </ul>

              <h3 className="text-lg font-semibold mb-3">9. Indemnización</h3>
              <p className="mb-4">
                Usted acepta indemnizar y mantener indemne a FNE, sus directores, empleados y colaboradores de cualquier reclamo, daño o gasto derivado de su uso de la plataforma o violación de estos términos.
              </p>

              <h3 className="text-lg font-semibold mb-3">10. Modificaciones del Servicio</h3>
              <p className="mb-4">
                FNE se reserva el derecho de modificar, suspender o discontinuar cualquier aspecto del servicio en cualquier momento, con o sin previo aviso.
              </p>

              <h3 className="text-lg font-semibold mb-3">11. Terminación</h3>
              <p className="mb-4">
                FNE puede suspender o terminar su acceso a la plataforma si viola estos términos o por cualquier otra razón a nuestra discreción. Usted puede cancelar su cuenta en cualquier momento contactándonos.
              </p>

              <h3 className="text-lg font-semibold mb-3">12. Ley Aplicable y Jurisdicción</h3>
              <p className="mb-4">
                Estos términos se rigen por las leyes de la República de Chile. Cualquier disputa será resuelta en los tribunales competentes de Santiago, Chile.
              </p>

              <h3 className="text-lg font-semibold mb-3">13. Disposiciones Generales</h3>
              <p className="mb-4">
                Si alguna disposición de estos términos es declarada inválida o inaplicable, las demás disposiciones continuarán en pleno vigor. Estos términos constituyen el acuerdo completo entre usted y FNE respecto al uso de nuestros servicios.
              </p>

              <h3 className="text-lg font-semibold mb-3">14. Contacto</h3>
              <p className="mb-4">
                Para consultas sobre estos Términos de Uso, puede contactarnos en:
              </p>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-semibold">Fundación Nueva Educación</p>
                <p>Email: <a href="mailto:info@nuevaeducacion.org" className="text-blue-600 hover:underline">info@nuevaeducacion.org</a></p>
                <p>Dirección: Santiago, Chile</p>
                <p className="mt-2 text-sm text-gray-600">ATE certificada por RPA Mineduc</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}