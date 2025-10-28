-- Update Rubric Descriptors with Quantitative Criteria
-- This fixes the "generación tractor" ambiguity and provides clear numerical anchors

-- ========================================
-- COBERTURA (Coverage) - Standardized across all objectives
-- ========================================

UPDATE transformation_rubric
SET
  level_1_descriptor = 'Implementación piloto con menos de 50 estudiantes o 1-2 cursos aislados',
  level_2_descriptor = 'Implementación con 50-200 estudiantes o en 2-4 cursos (generación tractor: 1-2 niveles educativos completos)',
  level_3_descriptor = 'Implementación con más de 200 estudiantes o en la mayoría de niveles educativos, aunque con diferencias entre docentes',
  level_4_descriptor = 'Implementación institucional con toda la matrícula de manera articulada y sistemática'
WHERE dimension = 'cobertura';

-- ========================================
-- FRECUENCIA (Frequency) - Standardized across all objectives
-- ========================================

UPDATE transformation_rubric
SET
  level_1_descriptor = 'Actividad realizada una vez al año o de manera esporádica (inicio de año escolar)',
  level_2_descriptor = 'Actividad realizada 2 veces al año (semestral: inicio y cierre de semestre)',
  level_3_descriptor = 'Actividad realizada de manera regular (trimestral, bimestral o mensual)',
  level_4_descriptor = 'Actividad integrada sistemáticamente en la vida escolar (semanal o continua)'
WHERE dimension = 'frecuencia';

-- ========================================
-- PROFUNDIDAD (Depth) - Context-aware descriptors
-- ========================================

-- For objectives related to student plans/tracking (Objetivos 1-3)
UPDATE transformation_rubric
SET
  level_1_descriptor = 'Registro superficial con información básica o metas genéricas sin seguimiento',
  level_2_descriptor = 'Incluye algunas reflexiones del estudiante y evidencias específicas de aprendizaje',
  level_3_descriptor = 'Fomenta autonomía estudiantil, autorregulación y procesos metacognitivos documentados',
  level_4_descriptor = 'Conecta con el proyecto vital del estudiante, involucra activamente a familia y comunidad'
WHERE dimension = 'profundidad'
  AND objective_number IN (1, 2, 3);

-- For objectives related to teacher practices (Objetivos 4-7)
UPDATE transformation_rubric
SET
  level_1_descriptor = 'Prácticas iniciales sin sistematización, aplicadas ocasionalmente por algunos docentes',
  level_2_descriptor = 'Prácticas documentadas con resultados iniciales visibles, requiere acompañamiento constante',
  level_3_descriptor = 'Prácticas consolidadas con impacto medible en el aprendizaje, replicadas por la mayoría',
  level_4_descriptor = 'Prácticas institucionalizadas con innovación continua, modelo de referencia para otros'
WHERE dimension = 'profundidad'
  AND objective_number BETWEEN 4 AND 7;

-- For objectives related to infrastructure/systems (Objetivos 8-11)
UPDATE transformation_rubric
SET
  level_1_descriptor = 'Infraestructura o sistema básico sin integración, uso limitado o esporádico',
  level_2_descriptor = 'Sistema funcional con algunas integraciones, uso regular por parte de algunos actores',
  level_3_descriptor = 'Sistema robusto e integrado, uso generalizado con impacto medible en la gestión',
  level_4_descriptor = 'Sistema avanzado totalmente integrado, optimizado continuamente, referente institucional'
WHERE dimension = 'profundidad'
  AND objective_number BETWEEN 8 AND 11;

-- ========================================
-- Verification Query
-- ========================================
-- Run this to verify the updates
-- SELECT objective_number, action_number, dimension,
--        level_1_descriptor, level_2_descriptor,
--        level_3_descriptor, level_4_descriptor
-- FROM transformation_rubric
-- WHERE objective_number = 1 AND action_number = 1
-- ORDER BY dimension;
