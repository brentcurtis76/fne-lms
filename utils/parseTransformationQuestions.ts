/**
 * Utility to parse transformation assessment questions from CSV data
 * Converts PROGRESION - PERSONALIZACION.csv into Question[] format
 */

export interface TransformationQuestion {
  id: string;
  text: string;
  category?: string;
  order: number;
  dimension?: string;
}

/**
 * Parses the PROGRESION CSV structure into sequential questions
 *
 * CSV Structure:
 * - Column headers: OBJETIVOS, ACCION, REFERENTE, COBERTURA, FRECUENCIA, PROFUNDIDAD
 * - Each row represents one objetivo with multiple questions across dimensions
 * - ACCION column contains the main question text
 * - COBERTURA, FRECUENCIA, PROFUNDIDAD columns contain dimension-specific questions
 */
export function parseTransformationQuestions(): TransformationQuestion[] {
  const questions: TransformationQuestion[] = [];

  // Manually extracted questions from CSV
  // Each objetivo has up to 3 dimension questions (COBERTURA, FRECUENCIA, PROFUNDIDAD)

  // OBJETIVO 1: Plan Personal
  questions.push({
    id: 'obj1-accion',
    text: '¿Tienen un modelo propio de plan personal implementado? ¿Qué tipo de elementos recoge el plan (metas, evidencias, reflexiones, otros)?',
    category: 'Plan Personal',
    dimension: 'accion',
    order: 1,
  });
  questions.push({
    id: 'obj1-cobertura',
    text: '¿En qué niveles o cursos se está implementando actualmente el plan personal? ¿Se aplica solo en la generación tractor o en todos los niveles? ¿Todos los docentes lo utilizan del mismo modo, o hay diferencias?',
    category: 'Plan Personal',
    dimension: 'cobertura',
    order: 2,
  });
  questions.push({
    id: 'obj1-frecuencia',
    text: '¿Con qué frecuencia revisan el plan personal de los estudiantes? ¿Existen momentos sistemáticos de seguimiento a lo largo del curso?',
    category: 'Plan Personal',
    dimension: 'frecuencia',
    order: 3,
  });
  questions.push({
    id: 'obj1-profundidad',
    text: '¿El plan personal se conecta con proyectos vitales del estudiante e involucra a las familias? ¿El plan personal recoge metas de diferentes ámbitos (más de 3)? ¿Incluye autoevaluación del alumno? ¿Incluye participación de las familias?',
    category: 'Plan Personal',
    dimension: 'profundidad',
    order: 4,
  });

  // OBJETIVO 2: Tutoría Personalizada
  questions.push({
    id: 'obj2-accion',
    text: '¿Existe en la escuela la intención de implementar entrevistas individuales entre tutores y estudiantes? ¿Los tutores realizan entrevistas?',
    category: 'Tutoría Personalizada',
    dimension: 'accion',
    order: 5,
  });
  questions.push({
    id: 'obj2-cobertura',
    text: '¿En qué cursos o niveles se realizan actualmente entrevistas individuales? ¿Todos los tutores lo realizan o depende de cada docente?',
    category: 'Tutoría Personalizada',
    dimension: 'cobertura',
    order: 6,
  });
  questions.push({
    id: 'obj2-frecuencia',
    text: '¿Con qué frecuencia se realizan estas entrevistas individuales? ¿Se hacen solo cuando surge un problema, una vez al año, o tienen momentos planificados (inicio, mitad, cierre de curso)? ¿Existe una planificación clara que asegure la periodicidad para todos los estudiantes? ¿Existe un sistema de control que asegure que todas las entrevistas se realizan?',
    category: 'Tutoría Personalizada',
    dimension: 'frecuencia',
    order: 7,
  });
  questions.push({
    id: 'obj2-profundidad',
    text: '¿Qué temas se abordan en las entrevistas: solo lo académico y conductual, o también aspectos personales y relacionales? ¿Se vinculan estas entrevistas con el plan personal o con un portafolio de evidencias del estudiante? ¿Se registran los acuerdos o reflexiones que surgen en las entrevistas para darles seguimiento? ¿En algunos casos se involucra también a la familia en el proceso de tutoría?',
    category: 'Tutoría Personalizada',
    dimension: 'profundidad',
    order: 8,
  });

  // OBJETIVO 3: Proyectos de Autoconocimiento
  questions.push({
    id: 'obj3-accion',
    text: '¿Existen proyectos de autoconocimiento diseñados por los docentes para los estudiantes?',
    category: 'Proyectos de Autoconocimiento',
    dimension: 'accion',
    order: 9,
  });
  questions.push({
    id: 'obj3-cobertura',
    text: '¿En qué niveles o cursos se realizan actualmente proyectos de autoconocimiento? ¿Se concentran solo en la generación tractor o en todos los niveles? ¿Todos los docentes los aplican de forma similar, o varía según el curso o profesor?',
    category: 'Proyectos de Autoconocimiento',
    dimension: 'cobertura',
    order: 10,
  });
  questions.push({
    id: 'obj3-frecuencia',
    text: '¿Con qué periodicidad se realizan los proyectos de autoconocimiento? ¿En qué momento del año se realizan? ¿Se trata de actividades puntuales, proyectos anuales o instancias con inicio y cierre?',
    category: 'Proyectos de Autoconocimiento',
    dimension: 'frecuencia',
    order: 11,
  });
  questions.push({
    id: 'obj3-profundidad',
    text: '¿Qué tipo de actividades incluyen (gustos, fortalezas, intereses, aprendizajes, metas…)? ¿Existe una progresión pensada a lo largo de los cursos, con distintos objetivos según la edad? ¿Se trabaja únicamente en tutoría o también en distintas asignaturas? ¿Se conecta con el plan personal del estudiante? ¿En algún momento se involucra a las familias en el proceso o en la devolución?',
    category: 'Proyectos de Autoconocimiento',
    dimension: 'profundidad',
    order: 12,
  });

  // OBJETIVO 4: Diseño Universal para el Aprendizaje (DUA)
  questions.push({
    id: 'obj4-accion',
    text: '¿Los docentes planifican sus clases teniendo en cuenta los principios del Diseño Universal para el Aprendizaje (DUA)? ¿Podrían aportar un ejemplo de una experiencia o unidad que haya sido diseñada con DUA?',
    category: 'Diseño Universal (DUA)',
    dimension: 'accion',
    order: 13,
  });
  questions.push({
    id: 'obj4-cobertura',
    text: '¿Qué porcentaje de docentes están utilizando DUA en su planificación? ¿Está concentrado en algunos niveles o asignaturas, o se da en toda la escuela? ¿Existen diferencias significativas entre docentes o equipos en cuanto a cómo lo aplican?',
    category: 'Diseño Universal (DUA)',
    dimension: 'cobertura',
    order: 14,
  });
  questions.push({
    id: 'obj4-frecuencia',
    text: '¿Se diseñan con DUA solo algunas experiencias puntuales o de manera sistemática? ¿Se incluyen principios de DUA en la mayoría de las planificaciones del curso, o en casos específicos? ¿El diseño con DUA forma parte de la planificación anual y se revisa periódicamente?',
    category: 'Diseño Universal (DUA)',
    dimension: 'frecuencia',
    order: 15,
  });
  questions.push({
    id: 'obj4-profundidad',
    text: '¿Las adaptaciones se hacen solo cuando aparece un estudiante con necesidad específica, o se planifican desde el inicio para todos? ¿Se ofrecen alternativas en representación, acción/expresión y motivación en las experiencias de aprendizaje? ¿El DUA permite que los estudiantes tengan opciones para acceder a los contenidos, expresar lo aprendido y mantener la motivación? ¿El enfoque fomenta autonomía, autorregulación y aprendizajes significativos para todos?',
    category: 'Diseño Universal (DUA)',
    dimension: 'profundidad',
    order: 16,
  });

  // OBJETIVO 5: Coordinación Tutor-Equipo Docente
  questions.push({
    id: 'obj5-accion',
    text: '¿El tutor comparte información sobre las singularidades de los alumnos con el resto del equipo docente? ¿Cómo lo hace?',
    category: 'Coordinación Tutor-Equipo',
    dimension: 'accion',
    order: 17,
  });
  questions.push({
    id: 'obj5-cobertura',
    text: '¿En qué medida esta práctica está instalada en la escuela? ¿Todos los tutores lo hacen, o solo algunos? ¿Pasa en todos los niveles/cursos o en casos puntuales?',
    category: 'Coordinación Tutor-Equipo',
    dimension: 'cobertura',
    order: 18,
  });
  questions.push({
    id: 'obj5-frecuencia',
    text: '¿Con qué frecuencia se coordinan los tutores con el resto del equipo docente? ¿Existen reuniones formales para compartir información sobre los alumnos o se da solo de manera informal? ¿Tienen rutinas de revisión periódica de cada curso/grupo?',
    category: 'Coordinación Tutor-Equipo',
    dimension: 'frecuencia',
    order: 19,
  });
  questions.push({
    id: 'obj5-profundidad',
    text: '¿Qué tipo de información se comparte sobre los estudiantes (solo académica, también personal/relacional)? ¿Se conecta esa información con el plan personal o con estrategias de inclusión en el aula? ¿Las decisiones de acompañamiento se toman de forma individual (por el tutor) o en conjunto con el equipo docente?',
    category: 'Coordinación Tutor-Equipo',
    dimension: 'profundidad',
    order: 20,
  });

  // OBJETIVO 6: Equipo de Orientación
  questions.push({
    id: 'obj6-accion',
    text: '¿Cómo se articula el trabajo del equipo de orientación con tutores y docentes? ¿El equipo de orientación participa en la planificación de experiencias inclusivas, o solo interviene en casos puntuales?',
    category: 'Equipo de Orientación',
    dimension: 'accion',
    order: 21,
  });
  questions.push({
    id: 'obj6-cobertura',
    text: '¿En qué niveles/cursos está presente la acción del equipo de orientación? ¿Trabajan de manera transversal con toda la escuela o solo con algunos docentes/tutores? ¿En la práctica, todo el equipo docente se coordina con orientación, o son pocos los que lo hacen?',
    category: 'Equipo de Orientación',
    dimension: 'cobertura',
    order: 22,
  });
  questions.push({
    id: 'obj6-frecuencia',
    text: '¿Con qué frecuencia se reúne el equipo de orientación con tutores y docentes? ¿Las reuniones son reactivas (cuando surge un problema) o sistemáticas (planificadas en el calendario escolar)? ¿Existen rutinas de seguimiento periódico para todos los estudiantes con necesidades específicas?',
    category: 'Equipo de Orientación',
    dimension: 'frecuencia',
    order: 23,
  });
  questions.push({
    id: 'obj6-profundidad',
    text: 'Cuando intervienen, ¿la estrategia principal es que el estudiante salga del aula para recibir apoyo individual, o se prioriza que permanezca dentro del aula con apoyos? ¿El equipo de orientación ofrece acompañamiento dentro del aula, trabajando junto al docente/tutor? ¿Las decisiones de inclusión se toman en conjunto con el tutor, los docentes y, en algunos casos, la familia? ¿Qué peso tiene la mirada del equipo de orientación en las decisiones de la escuela sobre inclusión?',
    category: 'Equipo de Orientación',
    dimension: 'profundidad',
    order: 24,
  });

  // OBJETIVO 7: Exposición de Producciones
  questions.push({
    id: 'obj7-accion',
    text: '¿Se exponen producciones singulares del alumnado y/o comunidad educativa en la escuela de manera visible?',
    category: 'Exposición de Producciones',
    dimension: 'accion',
    order: 25,
  });
  questions.push({
    id: 'obj7-cobertura',
    text: '¿Qué cursos o niveles participan actualmente en las exposiciones? ¿Todos los alumnos tienen la oportunidad de mostrar sus trabajos, o solo algunos? ¿La práctica está extendida a toda la escuela o concentrada en ciertos cursos/asignaturas?',
    category: 'Exposición de Producciones',
    dimension: 'cobertura',
    order: 26,
  });
  questions.push({
    id: 'obj7-frecuencia',
    text: '¿Con qué frecuencia se realizan exposiciones de producciones? ¿Se trata de actividades puntuales, anuales o con una periodicidad más clara (ej. trimestral)? ¿Los espacios de exposición se renuevan durante el año escolar?',
    category: 'Exposición de Producciones',
    dimension: 'frecuencia',
    order: 27,
  });
  questions.push({
    id: 'obj7-profundidad',
    text: '¿Qué tipo de producciones se exponen: solo productos finales, o también procesos y reflexiones de aprendizaje? ¿Se muestran distintos tipos de trabajos (escritos, artísticos, proyectos, investigaciones)? ¿Los alumnos participan en la selección/curaduría de lo que se expone? ¿Las exposiciones buscan un sentido pedagógico y comunitario o son más bien decorativas?',
    category: 'Exposición de Producciones',
    dimension: 'profundidad',
    order: 28,
  });

  // OBJETIVO 8: Espacios de Identidad Grupal
  questions.push({
    id: 'obj8-accion',
    text: '¿Los alumnos tienen algún rol en el diseño de los espacios educativos del centro? ¿Participan en la decisión de cómo organizar su clase, sus baños, los pasillos, cómo señalizar su aula?',
    category: 'Espacios de Identidad',
    dimension: 'accion',
    order: 29,
  });
  questions.push({
    id: 'obj8-cobertura',
    text: '¿Qué cursos o niveles cuentan hoy con un espacio de identidad propio? ¿Esto ocurre en toda la escuela o solo en algunos ciclos/cursos? ¿Es una práctica institucionalizada o depende de la iniciativa de algunos docentes/grupos?',
    category: 'Espacios de Identidad',
    dimension: 'cobertura',
    order: 30,
  });
  questions.push({
    id: 'obj8-frecuencia',
    text: '¿Con qué frecuencia se actualizan estos espacios de identidad? ¿Solo al inicio del curso, al inicio y cierre, o de manera periódica durante el curso? ¿Son espacios vivos que se renuevan constantemente?',
    category: 'Espacios de Identidad',
    dimension: 'frecuencia',
    order: 31,
  });
  questions.push({
    id: 'obj8-profundidad',
    text: '¿Los espacios de identidad son decorativos o expresan verdaderamente la identidad, vínculos y proyectos del grupo? ¿Recogen símbolos, frases y proyectos representativos? ¿Están conectados al sentido institucional de la escuela?',
    category: 'Espacios de Identidad',
    dimension: 'profundidad',
    order: 32,
  });

  // OBJETIVO 9: Elección de Ambientes (Infantil/Básica inicial)
  questions.push({
    id: 'obj9-accion',
    text: '¿Los alumnos tienen la posibilidad de elegir entre distintos ambientes o espacios de aprendizaje? ¿Cómo se organiza esa elección: libre, rotativa, guiada por el docente? ¿Qué tipo de propuestas o materiales hay en cada ambiente?',
    category: 'Elección de Ambientes',
    dimension: 'accion',
    order: 33,
  });
  questions.push({
    id: 'obj9-cobertura',
    text: '¿En qué niveles o cursos se implementa actualmente esta dinámica de elección de ambientes? ¿Está presente en toda la etapa de infantil y primeros años de básica o solo en algunos cursos piloto? ¿Es una práctica sistemática en la escuela o depende del docente que la implemente?',
    category: 'Elección de Ambientes',
    dimension: 'cobertura',
    order: 34,
  });
  questions.push({
    id: 'obj9-frecuencia',
    text: '¿Con qué frecuencia se da la posibilidad de elegir ambientes? ¿Ocurre todos los días, algunas veces por semana, o en momentos puntuales del curso? ¿Forma parte de la rutina habitual de trabajo o es una experiencia ocasional?',
    category: 'Elección de Ambientes',
    dimension: 'frecuencia',
    order: 35,
  });
  questions.push({
    id: 'obj9-profundidad',
    text: '¿Los alumnos eligen según su interés, o también reflexionan sobre por qué eligen un ambiente y qué aprenden allí? ¿El docente acompaña la elección ayudando a conectar intereses con aprendizajes? ¿Se registran o revisan las decisiones de los alumnos (por ejemplo, en el plan personal o portafolio)? ¿Los alumnos muestran capacidad de planificar o revisar sus elecciones con autonomía progresiva?',
    category: 'Elección de Ambientes',
    dimension: 'profundidad',
    order: 36,
  });

  // OBJETIVO 10: Cajas de Aprendizaje (Primaria media)
  questions.push({
    id: 'obj10-accion',
    text: '¿Los alumnos pueden elegir entre diferentes cajas o propuestas de aprendizaje? ¿Qué tipo de tareas o desafíos contienen las cajas (actividades cerradas, proyectos, retos abiertos)? ¿Quién diseña las cajas: cada docente, un equipo de ciclo o la escuela en conjunto?',
    category: 'Cajas de Aprendizaje',
    dimension: 'accion',
    order: 37,
  });
  questions.push({
    id: 'obj10-cobertura',
    text: '¿En qué niveles o cursos se están utilizando las cajas de aprendizaje? ¿Está implementado en toda la primaria media o solo en algunos cursos o áreas? ¿Todos los alumnos tienen acceso a las cajas, o solo algunos grupos piloto?',
    category: 'Cajas de Aprendizaje',
    dimension: 'cobertura',
    order: 38,
  });
  questions.push({
    id: 'obj10-frecuencia',
    text: '¿Con qué frecuencia trabajan los alumnos con cajas de aprendizaje? ¿Es una experiencia puntual (una vez por trimestre), o parte regular del horario semanal? ¿Las cajas se integran en la planificación habitual de las clases o se usan en momentos especiales?',
    category: 'Cajas de Aprendizaje',
    dimension: 'frecuencia',
    order: 39,
  });
  questions.push({
    id: 'obj10-profundidad',
    text: '¿Cuántas cajas están actualmente disponibles para los alumnos en cada nivel o ciclo? ¿Los alumnos tienen varias opciones reales para elegir, o las cajas son pocas y similares? ¿Las cajas permiten diferentes formas de resolver o productos finales, o tienen una única respuesta correcta? ¿Los alumnos pueden decidir no solo qué caja hacer, sino también cómo abordarla y qué producto generar? ¿Las cajas promueven autonomía y reflexión sobre las elecciones que hacen los alumnos?',
    category: 'Cajas de Aprendizaje',
    dimension: 'profundidad',
    order: 40,
  });

  // OBJETIVO 11: Proyectos Personales (Secundaria)
  questions.push({
    id: 'obj11-accion',
    text: '¿Los alumnos desarrollan proyectos personales de aprendizaje en secundaria? ¿Estos proyectos surgen de los intereses de los estudiantes o son propuestos por los docentes? ¿Cómo se organiza el proceso: hay acompañamiento, materiales, espacios y tiempos definidos?',
    category: 'Proyectos Personales',
    dimension: 'accion',
    order: 41,
  });
  questions.push({
    id: 'obj11-cobertura',
    text: '¿En qué niveles o cursos se implementan actualmente los proyectos personales? ¿Es una práctica generalizada o se concentra en un curso o grupo piloto? ¿Todos los estudiantes de secundaria tienen la oportunidad de realizar un proyecto personal cada año?',
    category: 'Proyectos Personales',
    dimension: 'cobertura',
    order: 42,
  });
  questions.push({
    id: 'obj11-frecuencia',
    text: '¿Con qué periodicidad se realizan los proyectos personales: una vez al año, por semestre, o de manera continua? ¿Los tiempos de trabajo en el proyecto están integrados en el horario regular? ¿Hay momentos institucionalizados de presentación o cierre de los proyectos?',
    category: 'Proyectos Personales',
    dimension: 'frecuencia',
    order: 43,
  });
  questions.push({
    id: 'obj11-profundidad',
    text: '¿Los alumnos eligen el tema, el propósito y el producto de su proyecto? ¿Los proyectos incluyen planificación y revisión periódica de metas (por ejemplo, definir objetivos los lunes y revisar avances los viernes)? ¿Se articulan con el plan personal del alumno o con otras herramientas de seguimiento individual? ¿Qué tipo de acompañamiento reciben los estudiantes: tutorías, guías, coevaluación? ¿Las presentaciones finales tienen un sentido comunitario o social (muestras, ferias, exposiciones abiertas)? ¿Los alumnos reflexionan sobre su proceso y aprendizajes (metacognición) como parte del cierre del proyecto?',
    category: 'Proyectos Personales',
    dimension: 'profundidad',
    order: 44,
  });

  return questions;
}

/**
 * Get total number of questions
 */
export function getTotalQuestions(): number {
  return parseTransformationQuestions().length;
}

/**
 * Get questions grouped by category
 */
export function getQuestionsByCategory(): Record<string, TransformationQuestion[]> {
  const questions = parseTransformationQuestions();
  const grouped: Record<string, TransformationQuestion[]> = {};

  questions.forEach(q => {
    const cat = q.category || 'Sin categoría';
    if (!grouped[cat]) {
      grouped[cat] = [];
    }
    grouped[cat].push(q);
  });

  return grouped;
}
