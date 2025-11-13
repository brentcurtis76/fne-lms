import { RubricEvaluator } from '../lib/transformation/evaluator';

async function run() {
  const evaluator = new RubricEvaluator('test-api-key');

  const invalidJson = `{"dimension_evaluations":[{"rubricItemId":"123","dimension":"Cobertura","level":1,"reasoning":"Se menciona el Plan Personal de Crecimiento "Ruta Transformadora" y tutorías 1:1", "evidence_quote":"La coordinadora dijo "Tenemos un PPC"", "next_steps": []}], "overall_stage": 2, "overall_stage_label": "Emergente", "strengths": [], "growth_areas": [], "summary": "Resumen", "recommendations": [] }`;

  (evaluator as any).anthropic = {
    messages: {
      create: async () => ({
        content: [
          {
            type: 'text',
            text: invalidJson,
          },
        ],
        usage: {},
      }),
    },
  };

  try {
    await evaluator.evaluateAssessment({}, []);
  } catch (error: any) {
    console.error('Caught error:', error.message);
  }
}

run();
