import { SequentialQuestions } from '@/components/transformation/SequentialQuestions';

export default function TestSequentialQuestionsPage() {
  const handleComplete = () => {
    console.log('✅ Evaluación completada!');
    alert('¡Todas las preguntas han sido respondidas!');
  };

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Test: Componente de Preguntas Secuenciales
          </h1>
          <p className="text-slate-600">
            Este es un entorno de prueba para el componente SequentialQuestions.
          </p>
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h2 className="font-semibold text-blue-900 mb-2">Funcionalidades a probar:</h2>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>✓ Chat-style UI con burbujas de preguntas y respuestas</li>
              <li>✓ Navegación entre preguntas (Anterior/Siguiente)</li>
              <li>✓ Indicador de progreso (Pregunta X de 3)</li>
              <li>✓ Auto-scroll al fondo cuando aparece nueva pregunta</li>
              <li>✓ Enter para enviar, Shift+Enter para nueva línea</li>
              <li>✓ Botón "Finalizar Evaluación" al responder última pregunta</li>
            </ul>
          </div>
        </div>

        <SequentialQuestions
          assessmentId="test-assessment-id"
          area="aprendizaje"
          onComplete={handleComplete}
        />
      </div>
    </div>
  );
}
