import React from 'react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrivacyPolicyModal({ isOpen, onClose }: PrivacyPolicyModalProps) {
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
            <h2 className="text-2xl font-bold text-gray-900">Política de Privacidad</h2>
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
              
              <h3 className="text-lg font-semibold mb-3">1. Información que Recopilamos</h3>
              <p className="mb-4">
                En Fundación Nueva Educación recopilamos información que usted nos proporciona directamente, tales como:
              </p>
              <ul className="list-disc pl-6 mb-4">
                <li>Nombre y apellidos</li>
                <li>Dirección de correo electrónico</li>
                <li>Institución educativa a la que pertenece</li>
                <li>Cargo o rol dentro de la institución</li>
                <li>Información de contacto profesional</li>
                <li>Contenido de mensajes y consultas enviadas a través de nuestros formularios</li>
              </ul>

              <h3 className="text-lg font-semibold mb-3">2. Uso de la Información</h3>
              <p className="mb-4">
                Utilizamos la información recopilada para los siguientes propósitos:
              </p>
              <ul className="list-disc pl-6 mb-4">
                <li>Responder a sus consultas y solicitudes de información</li>
                <li>Proporcionar acceso a nuestra plataforma educativa</li>
                <li>Enviar comunicaciones sobre nuestros programas y servicios educativos</li>
                <li>Mejorar nuestros servicios y desarrollar nuevos programas</li>
                <li>Cumplir con obligaciones legales y regulatorias</li>
                <li>Generar estadísticas agregadas sobre el uso de nuestros servicios</li>
              </ul>

              <h3 className="text-lg font-semibold mb-3">3. Protección de Datos</h3>
              <p className="mb-4">
                Implementamos medidas de seguridad técnicas y organizativas apropiadas para proteger su información personal contra acceso no autorizado, alteración, divulgación o destrucción. Estas medidas incluyen:
              </p>
              <ul className="list-disc pl-6 mb-4">
                <li>Encriptación de datos en tránsito y en reposo</li>
                <li>Acceso restringido a información personal</li>
                <li>Monitoreo regular de nuestros sistemas</li>
                <li>Capacitación del personal en protección de datos</li>
              </ul>

              <h3 className="text-lg font-semibold mb-3">4. Compartir Información</h3>
              <p className="mb-4">
                No vendemos, alquilamos ni compartimos su información personal con terceros, excepto en los siguientes casos:
              </p>
              <ul className="list-disc pl-6 mb-4">
                <li>Con su consentimiento explícito</li>
                <li>Para cumplir con requerimientos legales</li>
                <li>Con proveedores de servicios que nos ayudan a operar nuestra plataforma (bajo acuerdos de confidencialidad)</li>
                <li>Para proteger los derechos y seguridad de FNE, nuestros usuarios o el público</li>
              </ul>

              <h3 className="text-lg font-semibold mb-3">5. Retención de Datos</h3>
              <p className="mb-4">
                Conservamos su información personal durante el tiempo necesario para cumplir con los propósitos descritos en esta política, a menos que la ley requiera o permita un período de retención más largo.
              </p>

              <h3 className="text-lg font-semibold mb-3">6. Sus Derechos</h3>
              <p className="mb-4">
                Usted tiene derecho a:
              </p>
              <ul className="list-disc pl-6 mb-4">
                <li>Acceder a su información personal</li>
                <li>Corregir datos inexactos o incompletos</li>
                <li>Solicitar la eliminación de sus datos</li>
                <li>Oponerse al procesamiento de sus datos</li>
                <li>Solicitar la portabilidad de sus datos</li>
                <li>Retirar su consentimiento en cualquier momento</li>
              </ul>

              <h3 className="text-lg font-semibold mb-3">7. Cookies y Tecnologías Similares</h3>
              <p className="mb-4">
                Utilizamos cookies y tecnologías similares para mejorar su experiencia en nuestro sitio web, analizar el tráfico y personalizar el contenido. Puede configurar su navegador para rechazar cookies, aunque esto podría afectar algunas funcionalidades del sitio.
              </p>

              <h3 className="text-lg font-semibold mb-3">8. Menores de Edad</h3>
              <p className="mb-4">
                Nuestros servicios están dirigidos a profesionales de la educación. No recopilamos intencionalmente información personal de menores de 18 años sin el consentimiento de sus padres o tutores.
              </p>

              <h3 className="text-lg font-semibold mb-3">9. Cambios a esta Política</h3>
              <p className="mb-4">
                Podemos actualizar esta política de privacidad periódicamente. Le notificaremos sobre cambios significativos publicando la nueva política en nuestro sitio web y actualizando la fecha de "última actualización".
              </p>

              <h3 className="text-lg font-semibold mb-3">10. Contacto</h3>
              <p className="mb-4">
                Si tiene preguntas sobre esta política de privacidad o sobre el tratamiento de sus datos personales, puede contactarnos en:
              </p>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-semibold">Fundación Nueva Educación</p>
                <p>Email: <a href="mailto:info@nuevaeducacion.org" className="text-blue-600 hover:underline">info@nuevaeducacion.org</a></p>
                <p>Dirección: Santiago, Chile</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}