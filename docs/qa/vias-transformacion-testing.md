# Manual de Pruebas QA: Vías de Transformación

**Fecha:** Diciembre 2025
**Tester:** jorge@lospellines.cl
**Organización:** Los Pellines

---

## Objetivo

Verificar que la funcionalidad completa de **Vías de Transformación** funcione correctamente en producción, incluyendo:
- Creación de una evaluación
- Responder preguntas de contexto
- Completar la evaluación con respuestas coherentes
- Verificar que el AI genera un reporte
- Probar la descarga de PDFs
- Verificar colaboradores

---

## Requisitos Previos

1. Tener acceso a la plataforma FNE con el usuario **jorge@lospellines.cl**
2. El usuario debe estar asociado a una escuela (Los Pellines)
3. Conexión a internet estable (la evaluación usa AI)

---

## Parte 1: Acceder a Vías de Transformación

### Pasos:

1. Ingresa a https://www.nuevaeducacion.org
2. Inicia sesión con tu email: **jorge@lospellines.cl**
3. En el menú lateral izquierdo, busca la pestaña **"Vías de Transformación"**
4. Haz clic en ella

### Verificar:
- [ ] La pestaña "Vías de Transformación" aparece en el sidebar
- [ ] Al hacer clic, se carga la página de evaluaciones
- [ ] Puedes ver un botón para crear nueva evaluación

---

## Parte 2: Crear Nueva Evaluación

### Pasos:

1. Haz clic en **"Nueva Evaluación"** o **"Crear Evaluación"**
2. Selecciona el área: **"Personalización del Aprendizaje"**
3. Selecciona los niveles (grados) - puedes seleccionar varios
4. Confirma la creación

### Verificar:
- [ ] Se muestra un selector de área
- [ ] Se pueden seleccionar múltiples niveles/grados
- [ ] La evaluación se crea correctamente
- [ ] Se redirige a la pantalla de preguntas de contexto

---

## Parte 3: Preguntas de Contexto (18 preguntas)

Estas son preguntas sobre el contexto de tu escuela. Usa las respuestas indicadas abajo.

### SECCIÓN A: Contexto Institucional

**Pregunta 1:** ¿Cuántos estudiantes tiene aproximadamente tu colegio?
> **Respuesta:** Selecciona **"600-900"**

**Pregunta 2:** ¿En qué niveles educativos están trabajando actualmente en prácticas de personalización del aprendizaje?
> **Respuesta:** Selecciona: **Pre-Kínder, Kínder, 1º Básico, 2º Básico, 3º Básico, 4º Básico**

**Pregunta 3:** ¿Tienen una Generación Tractor implementada?
> **Respuesta:** Selecciona **"Sí"**
>
> *Luego selecciona los cursos:* **Pre-Kínder, Kínder, 1º Básico, 2º Básico**

**Pregunta 4:** ¿Tienen una Generación Innova implementada?
> **Respuesta:** Selecciona **"No"**

**Pregunta 5:** ¿Cuánto tiempo lleva tu colegio trabajando en personalización del aprendizaje?
> **Respuesta:** Selecciona **"1-2 años"**

**Pregunta 6:** ¿Cuántos docentes trabajan en tu colegio aproximadamente?
> **Respuesta:** Selecciona **"40-60"**

### SECCIÓN B: Estado Actual de Personalización

**Pregunta 7:** ¿Tu colegio cuenta actualmente con algún modelo de plan personal implementado para los estudiantes?
> **Respuesta:** Selecciona **"Sí, en algunos niveles (generación tractor)"**

**Pregunta 8:** ¿Los tutores realizan entrevistas individuales periódicas con estudiantes?
> **Respuesta:** Selecciona **"Sí, 2-3 veces al año de manera planificada"**

**Pregunta 9:** ¿Los estudiantes tienen oportunidades reales de elegir cómo, qué o con quién aprenden?
> **Respuesta:** Selecciona **"En algunos niveles o asignaturas específicas"**

**Pregunta 10:** ¿Qué porcentaje de docentes conoce y aplica principios del Diseño Universal para el Aprendizaje (DUA)?
> **Respuesta:** Selecciona **"25-50% conocen, pocos aplican"**

**Pregunta 11:** ¿Los estudiantes realizan proyectos de autoconocimiento estructurados?
> **Respuesta:** Selecciona **"Sí, en algunos niveles o cursos"**

### SECCIÓN C: Resistencias y Barreras

**Pregunta 12:** Si pudieras fortalecer un aspecto para avanzar más rápido en personalización del aprendizaje, ¿cuál tendría mayor impacto?
> **Respuesta:** Selecciona **"Acceso a formación específica en herramientas de personalización"**

**Pregunta 13:** ¿Dónde encuentran las mayores resistencias a dar mayor autonomía y elección a los estudiantes?
> **Respuesta:** Selecciona: **"Docentes de básica"** y **"Familias (temen 'pérdida de control')"**

**Pregunta 14:** Las familias de tu colegio, ¿cómo perciben el enfoque de personalización del aprendizaje?
> **Respuesta:** Selecciona **"Lo aceptan con dudas (¿mi hijo aprenderá lo necesario?)"**

**Pregunta 15:** ¿El equipo directivo prioriza y apoya activamente la personalización del aprendizaje?
> **Respuesta:** Selecciona **"Sí, hay apoyo y algunos recursos"**

### SECCIÓN D: Capacidad y Percepción

**Pregunta 16:** ¿La escuela cuenta con sistemas o herramientas para hacer seguimiento individual de cada estudiante?
> **Respuesta:** Selecciona **"Tenemos herramientas pero se usan de forma inconsistente"**

**Pregunta 17:** En tu percepción, ¿qué tan preparados están los docentes para acompañar trayectorias personalizadas de aprendizaje?
> **Respuesta:** Selecciona **"Medio - entienden la idea pero les cuesta la práctica"**

**Pregunta 18:** ¿Los estudiantes de tu colegio demuestran capacidad de autorregulación, planificación y reflexión sobre su propio aprendizaje?
> **Respuesta:** Selecciona **"Bajo - algunos estudiantes en ciertos momentos"**

### Verificar:
- [ ] Puedes responder todas las 18 preguntas
- [ ] El progreso se muestra (X de 18)
- [ ] Al completar, aparece el botón "Continuar a la Evaluación"
- [ ] Haz clic en "Continuar a la Evaluación"

---

## Parte 4: Evaluación por Objetivos

Ahora responderás preguntas sobre cada objetivo y acción. La evaluación tiene 6 objetivos con múltiples acciones.

**IMPORTANTE:**
- Después de escribir cada respuesta, haz clic en **"Ingresar respuesta"**
- Luego selecciona el nivel de avance cuando corresponda
- Finalmente haz clic en **"Siguiente"**

---

### OBJETIVO 1: Plan Personal de Crecimiento
#### Acción 1.1 - Preguntas Abiertas

**Pregunta (ACCIÓN):**
> ¿Tienen un modelo propio de plan personal de crecimiento implementado?
> ¿Qué tipo de elementos recoge el plan (metas, evidencias, reflexiones, otros)?

**RESPUESTA PARA COPIAR:**
```
Sí, tenemos un modelo de Plan Personal de Crecimiento implementado en la generación tractor (Pre-Kínder a 2º Básico). El plan incluye: metas de aprendizaje establecidas al inicio del semestre con apoyo del tutor, evidencias de logros a través de fotografías y trabajos seleccionados, y reflexiones simples que los estudiantes completan con dibujos y frases cortas según su nivel. También incluimos una sección de intereses y fortalezas que actualizamos trimestralmente. Las familias tienen acceso al plan y pueden agregar comentarios.
```

**Pregunta (COBERTURA):**
> ¿En qué niveles o cursos se está implementando actualmente el plan personal?
> ¿Se aplica solo en la generación tractor o en todos los niveles?

**RESPUESTA PARA COPIAR:**
```
Actualmente el plan personal se implementa únicamente en la generación tractor, que incluye Pre-Kínder, Kínder, 1º y 2º Básico. En estos niveles todos los estudiantes tienen su plan personal. Los docentes de 3º y 4º Básico conocen el modelo pero aún no lo han implementado formalmente, aunque algunos hacen seguimiento individual de manera informal. La implementación varía entre docentes: mientras algunas educadoras lo usan semanalmente, otros lo revisan de forma mensual.
```

**NIVEL DE AVANCE:** Selecciona **"En desarrollo"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia revisan el plan personal de los estudiantes?
> ¿Existen momentos sistemáticos de seguimiento a lo largo del curso?

**RESPUESTA PARA COPIAR:**
```
La frecuencia de revisión varía según el curso. En Pre-Kínder y Kínder, las educadoras revisan el plan personal semanalmente durante la asamblea de cierre. En 1º y 2º Básico, la revisión es mensual con una reunión individual de 10 minutos entre el tutor y cada estudiante. Además, realizamos una revisión formal al inicio del año, al cierre del primer semestre y al finalizar el año escolar. Las familias participan en la revisión semestral donde se actualizan metas junto con el estudiante.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (PROFUNDIDAD):**
> ¿El plan personal se conecta con proyectos vitales del estudiante e involucra a las familias?
> ¿El plan personal recoge metas de diferentes ámbitos (más de 3)?

**RESPUESTA PARA COPIAR:**
```
El plan personal actualmente recoge metas en tres ámbitos: académico (lectura, matemáticas), socioemocional (relaciones con pares, autorregulación) y personal (intereses y hobbies). Estamos trabajando para incorporar un cuarto ámbito relacionado con proyectos vitales. Las familias participan activamente: reciben el plan digital, pueden agregar observaciones, y asisten a la reunión semestral de revisión. Algunos estudiantes de 2º Básico ya conectan sus metas con sueños o proyectos personales, aunque esto no está sistematizado. La autoevaluación del alumno se realiza mediante caritas y colores en los niveles iniciales.
```

**NIVEL DE AVANCE:** Selecciona **"En desarrollo"**

---

### OBJETIVO 2: Sistema de Tutoría Personalizada
#### Acción 2.1 - Entrevistas Individuales

**Pregunta (ACCIÓN):**
> ¿Existe en la escuela la intención de implementar entrevistas individuales entre tutores y estudiantes?
> ¿Los tutores realizan entrevistas?

**RESPUESTA PARA COPIAR:**
```
Sí, las entrevistas individuales son parte fundamental de nuestro modelo de acompañamiento. Todos los tutores de la generación tractor realizan entrevistas individuales con cada estudiante. Utilizamos una pauta común que fue diseñada por el equipo pedagógico y que incluye preguntas sobre bienestar emocional, metas de aprendizaje, relaciones con compañeros y reflexión sobre logros. Las entrevistas duran aproximadamente 15-20 minutos y se registran en una plataforma compartida donde el equipo puede ver el historial de cada estudiante.
```

**Pregunta (COBERTURA):**
> ¿En qué cursos o niveles se realizan actualmente entrevistas individuales?
> ¿Todos los tutores lo realizan o depende de cada docente?

**RESPUESTA PARA COPIAR:**
```
Las entrevistas individuales se realizan en todos los cursos de la generación tractor (Pre-Kínder a 2º Básico) y también en 3º y 4º Básico aunque con menor frecuencia. En la generación tractor es obligatorio y todos los tutores lo cumplen utilizando la pauta común. En 3º y 4º Básico, los profesores jefe realizan entrevistas pero algunos solo cuando hay situaciones específicas. En los cursos mayores (5º en adelante) las entrevistas ocurren principalmente cuando hay problemas académicos o conductuales.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia se realizan estas entrevistas individuales?
> ¿Existe una planificación clara que asegure la periodicidad para todos los estudiantes?

**RESPUESTA PARA COPIAR:**
```
En la generación tractor, realizamos tres ciclos de entrevistas al año: marzo (conocer al estudiante y establecer metas), julio (evaluar primer semestre y ajustar metas) y noviembre (cierre y proyección). Existe una planificación con fechas específicas y un sistema de control donde cada tutor marca cuando completa sus entrevistas. En promedio, cada tutor tiene 25 estudiantes y logra completar todas las entrevistas en el periodo asignado. Los registros quedan en nuestra plataforma digital y el coordinador pedagógico hace seguimiento del cumplimiento.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (PROFUNDIDAD):**
> ¿Qué temas se abordan en las entrevistas: solo lo académico y conductual, o también aspectos personales y relacionales?
> ¿Se vinculan estas entrevistas con el plan personal?

**RESPUESTA PARA COPIAR:**
```
Las entrevistas abordan cuatro dimensiones: bienestar emocional (cómo se siente el estudiante, situaciones en casa), académico (avances en aprendizajes, dificultades), relacional (amistades, conflictos con compañeros) y metas personales. La pauta incluye preguntas como "¿Qué te hace feliz en el colegio?" y "¿Hay algo que te preocupe?". Los acuerdos se registran y se vinculan directamente con el plan personal del estudiante. Cuando es necesario, invitamos a la familia a una entrevista conjunta, especialmente si detectamos situaciones que requieren apoyo en casa. Las educadoras de párvulos adaptan las preguntas usando materiales visuales.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

---

### OBJETIVO 3: Autoconocimiento
#### Acción 3.1 - Proyectos de Autoconocimiento

**Pregunta (ACCIÓN):**
> ¿Existen proyectos de autoconocimiento diseñados para el crecimiento de los estudiantes?

**RESPUESTA PARA COPIAR:**
```
Sí, contamos con proyectos de autoconocimiento en varios niveles. En Pre-Kínder y Kínder trabajamos con "Mi libro de quién soy" donde los niños exploran sus gustos, familia, emociones y cuerpo. En 1º y 2º Básico tienen el proyecto "Mis fortalezas" donde identifican lo que hacen bien y lo que quieren aprender. En 3º y 4º Básico realizan "Mi historia personal" que incluye línea de tiempo, entrevistas a familiares y reflexión sobre momentos importantes. Estos proyectos se desarrollan principalmente en las horas de orientación y tutoría.
```

**Pregunta (COBERTURA):**
> ¿En qué niveles o cursos se realizan actualmente proyectos de autoconocimiento?
> ¿Todos los docentes los aplican de forma similar?

**RESPUESTA PARA COPIAR:**
```
Los proyectos de autoconocimiento se realizan desde Pre-Kínder hasta 4º Básico, con mayor sistematización en la generación tractor. En Pre-K y Kínder es parte del curriculum y todas las educadoras lo implementan. En 1º a 4º Básico, los proyectos están definidos pero algunos profesores los desarrollan con más profundidad que otros. En 5º y 6º Básico existen actividades puntuales pero no hay un proyecto estructurado. La coordinación pedagógica ha definido los proyectos por nivel, pero la implementación varía según el docente y el tiempo disponible.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué periodicidad se realizan los proyectos de autoconocimiento?
> ¿En qué momento del año se realizan?

**RESPUESTA PARA COPIAR:**
```
Los proyectos de autoconocimiento se desarrollan principalmente durante el primer trimestre del año escolar (marzo-mayo), coincidiendo con el periodo donde establecemos las metas del plan personal. En Pre-Kínder y Kínder es un trabajo continuo que se extiende durante todo el primer semestre. En Básica, los proyectos tienen una duración de 6-8 semanas con una sesión semanal de 45 minutos. Al cierre del año realizamos una actividad de reflexión donde los estudiantes revisan lo aprendido sobre sí mismos y comparten con sus familias. No hay actividades de autoconocimiento estructuradas durante el segundo semestre, aunque algunos docentes las incorporan de forma espontánea.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (PROFUNDIDAD):**
> ¿Qué tipo de actividades incluyen (gustos, fortalezas, intereses, aprendizajes, metas)?
> ¿Existe una progresión pensada a lo largo de los cursos?

**RESPUESTA PARA COPIAR:**
```
Existe una progresión diseñada por nuestro equipo pedagógico. En Pre-Kínder: gustos, familia, emociones básicas y cuerpo. En Kínder: amigos, lo que me hace único, mis miedos y alegrías. En 1º Básico: fortalezas, áreas de mejora, cómo aprendo mejor. En 2º Básico: mis sueños, lo que quiero lograr, personas que admiro. En 3º-4º: historia personal, valores, proyecto de vida inicial. Las actividades incluyen dibujos, collages, entrevistas, escritura reflexiva y presentaciones. El trabajo se concentra en tutoría pero algunos elementos se trabajan también en Lenguaje y Artes. Las familias participan en actividades específicas como entrevistas sobre la historia familiar y en la presentación final del proyecto.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

---

### OBJETIVO 4: Diseño Universal para el Aprendizaje (DUA)
#### Acción 4.1 - Principios DUA

**Pregunta (ACCIÓN):**
> ¿Los docentes planifican sus clases teniendo en cuenta los principios del Diseño Universal para el Aprendizaje (DUA)?
> ¿Podrían aportar un ejemplo?

**RESPUESTA PARA COPIAR:**
```
Algunos docentes están comenzando a incorporar principios de DUA en su planificación, aunque no es una práctica generalizada. El equipo de educación diferencial ha liderado capacitaciones sobre DUA y trabaja colaborativamente con los docentes de la generación tractor. Un ejemplo: en 2º Básico, la profesora de Lenguaje ofrece los textos en formato escrito, audio y con pictogramas. Los estudiantes pueden demostrar comprensión mediante dibujo, escritura o expresión oral. Se usan organizadores gráficos, materiales manipulativos y diferentes espacios del aula. Sin embargo, esto depende mucho de cada docente y no todos lo aplican consistentemente.
```

**Pregunta (COBERTURA):**
> ¿Qué porcentaje de docentes están utilizando DUA en su planificación?
> ¿Está concentrado en algunos niveles o asignaturas?

**RESPUESTA PARA COPIAR:**
```
Estimamos que aproximadamente un 30-40% de los docentes incorporan elementos de DUA en su planificación regular. El uso está más concentrado en la generación tractor donde el equipo de educación diferencial hace acompañamiento en aula. Las educadoras de párvulos naturalmente aplican muchos principios de DUA por la naturaleza de su trabajo con niños pequeños. En básica, los docentes de Lenguaje y Matemáticas son quienes más lo han adoptado porque trabajan con la educadora diferencial. En los cursos mayores y en asignaturas como Historia o Ciencias, el uso de DUA es más limitado y ocasional.
```

**NIVEL DE AVANCE:** Selecciona **"En desarrollo"**

**Pregunta (FRECUENCIA):**
> ¿Se diseñan con DUA solo algunas experiencias puntuales o de manera sistemática?
> ¿El diseño con DUA forma parte de la planificación anual?

**RESPUESTA PARA COPIAR:**
```
El diseño con DUA no forma parte sistemática de la planificación anual todavía. Los docentes que lo aplican, lo hacen en experiencias específicas, especialmente cuando hay estudiantes con necesidades educativas especiales en el curso. La planificación institucional no exige explícitamente el uso de DUA, aunque sí lo recomienda. En las evaluaciones, se ofrecen adecuaciones para estudiantes con PIE (Programa de Integración Escolar), pero no hay un diseño universal desde el inicio. Estamos trabajando para que el próximo año las planificaciones de la generación tractor incluyan DUA como estándar.
```

**NIVEL DE AVANCE:** Selecciona **"En desarrollo"**

**Pregunta (PROFUNDIDAD):**
> ¿Las adaptaciones se hacen solo cuando aparece un estudiante con necesidad específica, o se planifican desde el inicio para todos?
> ¿Se ofrecen alternativas en representación, acción/expresión y motivación?

**RESPUESTA PARA COPIAR:**
```
Actualmente, las adaptaciones se hacen principalmente cuando hay estudiantes con necesidades específicas identificadas. Sin embargo, en los cursos donde la educadora diferencial hace co-docencia, se planifica desde el inicio pensando en la diversidad. En estos casos se ofrecen: múltiples formas de representación (visual, auditiva, kinestésica), opciones para la expresión (escrita, oral, artística) y diferentes formas de motivación (elección de temas, trabajo individual o grupal). El desafío es extender esto a todos los docentes. La mayoría ofrece al menos dos opciones de expresión, pero la representación múltiple y las opciones de motivación son menos comunes.
```

**NIVEL DE AVANCE:** Selecciona **"En desarrollo"**

#### Acción 4.2 - Coordinación Tutor-Docentes

**Pregunta (ACCIÓN):**
> ¿El tutor comparte información sobre las singularidades de los alumnos con el resto del equipo docente?
> ¿Cómo lo hace?

**RESPUESTA PARA COPIAR:**
```
Sí, los tutores comparten información sobre sus estudiantes con el equipo docente. Esto se hace principalmente a través de: reuniones de equipo de curso (mensuales), un documento compartido con información relevante de cada estudiante, y conversaciones informales cuando surge alguna situación. Al inicio del año, el tutor presenta al grupo y destaca características importantes de estudiantes que requieren atención especial. La información incluye estilos de aprendizaje, situaciones familiares relevantes, fortalezas e intereses, y estrategias que funcionan con cada estudiante.
```

**Pregunta (COBERTURA):**
> ¿En qué medida esta práctica está instalada en la escuela?
> ¿Todos los tutores lo hacen, o solo algunos?

**RESPUESTA PARA COPIAR:**
```
La práctica está bastante instalada en la generación tractor donde tenemos reuniones de equipo docente estructuradas y el documento compartido es obligatorio. En estos niveles, todos los tutores comparten información de manera consistente. En 3º a 6º Básico, la práctica existe pero es más informal: depende del tutor y de las relaciones que tenga con los otros docentes del curso. En los cursos mayores, la información se comparte principalmente sobre estudiantes que presentan dificultades. Existe una diferencia notable entre niveles en la sistematización de esta práctica.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia se coordinan los tutores con el resto del equipo docente?
> ¿Existen reuniones formales para compartir información?

**RESPUESTA PARA COPIAR:**
```
En la generación tractor, los equipos de curso se reúnen mensualmente (1 hora) para revisar la situación de los estudiantes y coordinar estrategias. Además hay reuniones breves semanales de 15 minutos para temas urgentes. El documento compartido se actualiza después de cada entrevista individual. En los cursos de 3º a 6º, las reuniones formales de equipo son trimestrales (3 al año), aunque los profesores conversan informalmente con más frecuencia. En secundaria, la coordinación ocurre principalmente en los consejos de profesores que son quincenales, pero no están enfocados específicamente en conocer a los estudiantes.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (PROFUNDIDAD):**
> ¿Qué tipo de información se comparte sobre los estudiantes?
> ¿Se conecta esa información con el plan personal o con estrategias de inclusión?

**RESPUESTA PARA COPIAR:**
```
La información compartida incluye: datos académicos (rendimiento, dificultades específicas), aspectos socioemocionales (estado emocional, situaciones familiares), características personales (intereses, fortalezas, cómo aprende mejor) y estrategias de acompañamiento que han funcionado. En la generación tractor, esta información se conecta directamente con el plan personal: cuando un docente identifica un logro o dificultad, se registra y puede incorporarse en la próxima entrevista individual. Las decisiones de acompañamiento se toman en conjunto en las reuniones de equipo. Sin embargo, el vínculo con estrategias DUA específicas todavía es débil - es un área que queremos fortalecer.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

#### Acción 4.3 - Equipo de Orientación

**Pregunta (ACCIÓN):**
> ¿Cómo se articula el trabajo del equipo de orientación con tutores y docentes?
> ¿El equipo de orientación participa en la planificación de experiencias inclusivas?

**RESPUESTA PARA COPIAR:**
```
El equipo de orientación (psicóloga, educadora diferencial, orientadora) trabaja de manera articulada con tutores y docentes, especialmente en la generación tractor. La educadora diferencial realiza co-docencia en algunos cursos y participa en las reuniones de equipo docente. La psicóloga atiende casos individuales derivados por tutores y entrega orientaciones al equipo. La orientadora lidera los proyectos de autoconocimiento y el trabajo de plan personal. En cuanto a planificación inclusiva, el equipo de orientación asesora a los docentes pero no participa directamente en la planificación de todas las clases - se enfoca en estudiantes con necesidades específicas y en capacitaciones generales.
```

**Pregunta (COBERTURA):**
> ¿En qué niveles/cursos está presente la acción del equipo de orientación?
> ¿Trabajan de manera transversal con toda la escuela?

**RESPUESTA PARA COPIAR:**
```
El equipo de orientación trabaja con toda la escuela pero con diferente intensidad. La educadora diferencial se concentra en los cursos con estudiantes PIE (principalmente 1º a 6º Básico), realizando co-docencia y apoyo en aula. La psicóloga atiende casos de todos los niveles pero su trabajo preventivo se enfoca en la generación tractor. La orientadora trabaja transversalmente liderando el programa de orientación vocacional en secundaria y el trabajo de autoconocimiento en básica. En la práctica, la coordinación más estrecha con tutores ocurre en la generación tractor donde hay reuniones regulares. En los otros niveles, la coordinación es más reactiva.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia se reúne el equipo de orientación con tutores y docentes?
> ¿Las reuniones son reactivas o sistemáticas?

**RESPUESTA PARA COPIAR:**
```
La frecuencia varía según el nivel. En la generación tractor, la educadora diferencial participa en las reuniones mensuales de equipo docente y tiene espacios semanales de coordinación con tutores. La psicóloga tiene reuniones quincenales con tutores de la generación tractor para seguimiento de casos. En otros niveles, las reuniones son principalmente cuando surge una situación específica (reactivas). Existe una reunión mensual del equipo de orientación completo donde revisan casos y coordinan acciones. El seguimiento de estudiantes con necesidades especiales sí es sistemático con fichas de seguimiento que se revisan mensualmente.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (PROFUNDIDAD):**
> ¿La estrategia principal es que el estudiante salga del aula para recibir apoyo individual, o se prioriza que permanezca dentro del aula?
> ¿El equipo de orientación ofrece acompañamiento dentro del aula?

**RESPUESTA PARA COPIAR:**
```
Hemos evolucionado hacia un modelo que prioriza la permanencia en el aula común. La educadora diferencial realiza co-docencia en las clases de Lenguaje y Matemáticas, apoyando a todos los estudiantes, no solo a los del PIE. Los apoyos individuales fuera del aula se reservan para intervenciones específicas de corta duración o evaluaciones. La psicóloga trabaja principalmente fuera del aula en atención individual, pero también realiza talleres grupales dentro del horario de orientación. Las decisiones sobre el tipo de apoyo se toman en conjunto con el tutor, considerando las necesidades del estudiante. El objetivo es que el estudiante participe lo máximo posible con sus compañeros.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

---

### OBJETIVO 5: Espacios Físicos e Identidad
#### Acción 5.1 - Exposición de Producciones

**Pregunta (ACCIÓN):**
> ¿Se exponen producciones singulares del alumnado y/o comunidad educativa en la escuela de manera visible?

**RESPUESTA PARA COPIAR:**
```
Sí, exponemos trabajos de los estudiantes en diferentes espacios del colegio. Los pasillos de cada nivel tienen murales donde se exhiben trabajos de arte, proyectos de ciencias, producciones escritas destacadas y fotografías de actividades. Cada sala tiene un espacio destinado a mostrar los trabajos de los estudiantes del curso. También tenemos una galería en el hall central que se renueva mensualmente con trabajos seleccionados de diferentes niveles. En fechas especiales (fiestas patrias, día del libro, semana de la ciencia) montamos exposiciones temáticas donde participan estudiantes de todos los niveles.
```

**Pregunta (COBERTURA):**
> ¿Qué cursos o niveles participan actualmente en las exposiciones?
> ¿Todos los alumnos tienen la oportunidad de mostrar sus trabajos?

**RESPUESTA PARA COPIAR:**
```
Todos los niveles desde Pre-Kínder hasta 4º Medio participan en las exposiciones, aunque con diferente frecuencia e intensidad. En Pre-Kínder y Kínder, prácticamente todos los trabajos se exhiben y rotan constantemente. En Básica, cada estudiante tiene al menos un trabajo expuesto por semestre. En Media, las exposiciones son más selectivas y generalmente muestran los mejores trabajos o proyectos específicos. La galería central tiene un sistema de rotación donde cada mes se destaca un nivel diferente, asegurando que todos tengan visibilidad durante el año. Los docentes eligen los trabajos a exponer, aunque en algunos cursos los propios estudiantes seleccionan qué mostrar.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia se realizan exposiciones de producciones?
> ¿Los espacios de exposición se renuevan durante el año escolar?

**RESPUESTA PARA COPIAR:**
```
Los espacios de exposición se renuevan regularmente pero con diferente frecuencia según el espacio. Los murales de las salas se actualizan mensualmente o según el proyecto en curso. Los pasillos de nivel se renuevan trimestralmente coincidiendo con el cierre de cada periodo. La galería central cambia mensualmente con una inauguración donde los estudiantes destacados presentan sus trabajos. Realizamos cuatro exposiciones grandes al año: muestra de artes (mayo), feria científica (agosto), exposición de proyectos personales (octubre) y muestra de fin de año (diciembre). El desafío es que a veces los espacios quedan desactualizados por falta de tiempo de los docentes.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (PROFUNDIDAD):**
> ¿Qué tipo de producciones se exponen: solo productos finales, o también procesos y reflexiones?
> ¿Los alumnos participan en la selección de lo que se expone?

**RESPUESTA PARA COPIAR:**
```
Exponemos principalmente productos finales como dibujos, maquetas, ensayos y proyectos terminados. Sin embargo, en algunos casos también mostramos el proceso: en la generación tractor exhibimos borradores junto al trabajo final para mostrar la evolución, y en los proyectos de ciencias incluimos el registro del método científico usado. Las reflexiones escritas de los estudiantes se incluyen especialmente en los proyectos de autoconocimiento y en el cierre de unidades significativas. En cuanto a participación estudiantil, en Pre-K a 2º Básico los docentes seleccionan, pero a partir de 3º Básico algunos cursos permiten que los estudiantes elijan qué trabajo quieren exponer. Esto varía según el docente.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

#### Acción 5.2 - Espacios de Identidad Grupal

**Pregunta (ACCIÓN):**
> ¿Los alumnos tienen algún rol en el diseño de los espacios educativos del centro?
> ¿Participan en la decisión de cómo organizar su clase?

**RESPUESTA PARA COPIAR:**
```
Sí, los estudiantes participan en cierta medida en el diseño de sus espacios. Cada curso tiene un panel de identidad que los propios estudiantes diseñan al inicio del año: eligen el nombre del curso, crean un logo, definen sus valores y decoran su espacio. En las salas, los estudiantes pueden opinar sobre la distribución del mobiliario y hay espacios definidos como "rincones" que ellos personalizan. En Pre-Kínder y Kínder, los niños participan en la creación de materiales para los ambientes de aprendizaje. Sin embargo, las decisiones mayores sobre infraestructura y señalética se toman a nivel institucional sin consulta estudiantil.
```

**Pregunta (COBERTURA):**
> ¿Qué cursos o niveles cuentan hoy con un espacio de identidad propio?
> ¿Es una práctica institucionalizada?

**RESPUESTA PARA COPIAR:**
```
Todos los cursos desde Pre-Kínder hasta 4º Medio tienen un panel de identidad grupal como práctica institucional. Es una actividad que se realiza en la primera semana de clases como parte del proceso de conformación de grupo. Sin embargo, la calidad y profundidad varía mucho entre cursos: algunos tienen espacios muy elaborados con proyectos grupales, fotos, metas colectivas y producciones artísticas, mientras otros tienen solo un panel básico con el nombre del curso. En general, los cursos de la generación tractor y los que tienen profesores más comprometidos tienen espacios más desarrollados y se mantienen actualizados durante el año.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia se actualizan estos espacios de identidad?
> ¿Los espacios se renuevan durante el año escolar?

**RESPUESTA PARA COPIAR:**
```
La frecuencia de actualización es muy variable. Los paneles de identidad se crean al inicio del año y la expectativa es que se actualicen trimestralmente con nuevos elementos (fotos de actividades, logros del curso, producciones grupales). En la generación tractor esto se cumple bastante bien porque está integrado en la planificación de tutoría. En otros niveles, muchos paneles quedan estáticos después de marzo. En algunos cursos de media, los estudiantes toman la iniciativa de actualizar su espacio cuando hay eventos importantes. No existe un sistema de seguimiento que asegure la renovación regular de todos los espacios de identidad.
```

**NIVEL DE AVANCE:** Selecciona **"En desarrollo"**

**Pregunta (PROFUNDIDAD):**
> ¿Qué elementos incluyen estos espacios?
> ¿Las exposiciones buscan un sentido pedagógico y comunitario?

**RESPUESTA PARA COPIAR:**
```
Los espacios de identidad incluyen: nombre y logo del curso, fotos del grupo, lista de estudiantes, valores o acuerdos de convivencia, metas colectivas, y trabajos o proyectos representativos. En algunos cursos también hay una sección de "nuestros logros" que se va actualizando. El sentido pedagógico está más presente en la generación tractor donde se conecta con el trabajo de comunidad de curso y los proyectos de autoconocimiento. En otros niveles, tiende a ser más decorativo. El sentido comunitario varía: algunos espacios reflejan genuinamente la identidad del grupo y sus proyectos, mientras otros son más superficiales y no representan realmente al curso.
```

**NIVEL DE AVANCE:** Selecciona **"En desarrollo"**

---

### OBJETIVO 6: Autonomía y Elección en el Aprendizaje
#### Acción 6.1 - Elección de Ambientes

**Pregunta (ACCIÓN):**
> ¿Los alumnos tienen la posibilidad de elegir entre distintos ambientes o espacios de aprendizaje?
> ¿Cómo se organiza esa elección?

**RESPUESTA PARA COPIAR:**
```
En Pre-Kínder y Kínder trabajamos con un sistema de ambientes de aprendizaje donde los niños eligen libremente. Tenemos 5 ambientes permanentes: construcción, arte, biblioteca, juego simbólico y ciencias/naturaleza. Los niños eligen a qué ambiente ir usando un sistema de collares (máximo 6 niños por ambiente). La elección es libre y pueden cambiar de ambiente durante el periodo. En 1º y 2º Básico hay momentos específicos de trabajo en ambientes (2 veces por semana) donde también eligen, aunque los ambientes son diferentes (lectura, matemáticas manipulativas, escritura, exploración). Desde 3º Básico no hay sistema de ambientes.
```

**Pregunta (COBERTURA):**
> ¿En qué niveles o cursos se implementa actualmente esta dinámica de elección de ambientes?
> ¿Es una práctica sistemática?

**RESPUESTA PARA COPIAR:**
```
La elección de ambientes está implementada de manera sistemática solo en Pre-Kínder, Kínder, 1º y 2º Básico. En párvulos es la metodología central de trabajo: todas las educadoras lo implementan durante todo el día. En 1º y 2º Básico se ha adaptado con ambientes específicos que funcionan dos veces por semana como parte del horario regular. Desde 3º Básico en adelante no existe esta metodología, aunque algunos docentes organizan ocasionalmente estaciones de trabajo donde los estudiantes rotan. La práctica es institucional en los niveles que la aplican, con formación docente y espacios físicos adaptados.
```

**NIVEL DE AVANCE:** Selecciona **"En desarrollo"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia se da la posibilidad de elegir ambientes?
> ¿Forma parte de la rutina habitual de trabajo?

**RESPUESTA PARA COPIAR:**
```
En Pre-Kínder y Kínder, el trabajo en ambientes es diario y ocupa aproximadamente 2 horas de la jornada, divididas en dos periodos. Es parte fundamental de la rutina y los niños lo esperan. En 1º Básico, el trabajo en ambientes ocurre dos veces por semana (martes y jueves) durante 90 minutos. En 2º Básico también es dos veces por semana. En estos niveles está integrado en el horario oficial y todos los docentes lo implementan. La frecuencia es consistente durante todo el año escolar, aunque puede verse afectada por evaluaciones o actividades especiales.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (PROFUNDIDAD):**
> ¿Los alumnos eligen según su interés, o también reflexionan sobre por qué eligen?
> ¿Se registran o revisan las decisiones de los alumnos?

**RESPUESTA PARA COPIAR:**
```
En párvulos, los niños eligen principalmente por interés y afinidad. Las educadoras conversan con ellos sobre sus elecciones pero no hay registro sistemático. En 1º y 2º Básico hemos incorporado mayor reflexión: al inicio los estudiantes escriben qué ambiente eligieron y por qué, al cierre comparten qué aprendieron. Cada estudiante tiene una hoja de registro semanal donde anotan sus elecciones. Los docentes revisan estos registros para identificar patrones (estudiantes que siempre eligen lo mismo, quienes nunca van a ciertos ambientes) y conversan individualmente cuando es necesario. Sin embargo, no se conecta formalmente con el plan personal todavía.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

#### Acción 6.2 - Cajas de Aprendizaje (3º-6º Básico)

**Pregunta (ACCIÓN):**
> ¿Los alumnos pueden elegir entre diferentes cajas o propuestas de aprendizaje?
> ¿Qué tipo de tareas o desafíos contienen las cajas?

**RESPUESTA PARA COPIAR:**
```
Sí, en 3º a 6º Básico trabajamos con un sistema de cajas de aprendizaje, aunque está en etapas iniciales. Las cajas son propuestas de trabajo autónomo que los estudiantes eligen durante periodos específicos. Actualmente tenemos cajas principalmente en Lenguaje y Matemáticas. Las cajas contienen: instrucciones claras del desafío, materiales necesarios, y criterios de evaluación. Los tipos de tareas varían: hay cajas con actividades más cerradas (ejercicios, fichas), otras con proyectos pequeños, y algunas con desafíos abiertos donde el estudiante decide el producto. Cada ciclo tiene entre 8-12 cajas disponibles.
```

**Pregunta (COBERTURA):**
> ¿En qué niveles o cursos se están utilizando las cajas de aprendizaje?
> ¿Todos los alumnos tienen acceso a las cajas?

**RESPUESTA PARA COPIAR:**
```
Las cajas de aprendizaje se utilizan principalmente en 3º y 4º Básico donde están más desarrolladas. En estos niveles, todos los estudiantes tienen acceso y trabajan con cajas una vez por semana en Lenguaje y una vez en Matemáticas. En 5º y 6º Básico algunos docentes las han incorporado pero de manera más esporádica y con menos variedad de cajas disponibles. Las cajas fueron diseñadas por un equipo de docentes el año pasado y estamos trabajando en ampliar el banco de cajas y extender la práctica. En secundaria no utilizamos este sistema de cajas.
```

**NIVEL DE AVANCE:** Selecciona **"En desarrollo"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia trabajan los alumnos con cajas de aprendizaje?
> ¿Las cajas se integran en la planificación habitual?

**RESPUESTA PARA COPIAR:**
```
En 3º y 4º Básico, el trabajo con cajas ocurre dos veces por semana: viernes en Lenguaje (90 minutos) y miércoles en Matemáticas (60 minutos). Este tiempo está reservado en el horario y es parte de la planificación anual de estas asignaturas. En 5º y 6º Básico, el uso es más irregular: aproximadamente una vez cada dos semanas cuando el docente lo considera apropiado. Las cajas no se usan en evaluaciones formales, sino como instancias de aprendizaje y práctica. Durante periodos de pruebas se reduce o suspende el trabajo con cajas.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (PROFUNDIDAD):**
> ¿Cuántas cajas están actualmente disponibles para los alumnos?
> ¿Las cajas permiten diferentes formas de resolver o productos finales?

**RESPUESTA PARA COPIAR:**
```
Actualmente el banco de cajas incluye: 12 cajas de Lenguaje para 3º-4º (6 por nivel), 10 cajas de Matemáticas para 3º-4º, y aproximadamente 8 cajas combinadas para 5º-6º. La mayoría de las cajas son de dificultad media con algunas más desafiantes. En cuanto a flexibilidad: las cajas de Lenguaje permiten mayor elección de producto (pueden escribir un cuento, crear un cómic, hacer una presentación), mientras las de Matemáticas tienden a tener respuestas más definidas. Algunas cajas de proyectos permiten que el estudiante defina su tema dentro de un marco. Estamos trabajando en aumentar la cantidad y diversidad de cajas y en hacer todas más abiertas.
```

**NIVEL DE AVANCE:** Selecciona **"En desarrollo"**

#### Acción 6.3 - Proyectos Personales (Secundaria)

**Pregunta (ACCIÓN):**
> ¿Los alumnos desarrollan proyectos personales de aprendizaje en secundaria?
> ¿Estos proyectos surgen de los intereses de los estudiantes?

**RESPUESTA PARA COPIAR:**
```
Sí, en secundaria implementamos proyectos personales de aprendizaje, aunque está en proceso de consolidación. En IIIº y IVº Medio es donde está más desarrollado como parte de la preparación para la vida post-escolar. Los proyectos surgen de los intereses de los estudiantes: cada uno elige un tema que le apasiona y desarrolla una investigación o producto durante un semestre. Tienen un profesor guía asignado que se reúne con ellos quincenalmente. Los temas han incluido: programación de videojuegos, investigación sobre cambio climático local, creación de un podcast, diseño de moda sustentable, entre otros. En Iº y IIº Medio hay experiencias más acotadas.
```

**Pregunta (COBERTURA):**
> ¿En qué niveles o cursos se implementan actualmente los proyectos personales?
> ¿Todos los estudiantes de secundaria tienen la oportunidad de realizar un proyecto personal?

**RESPUESTA PARA COPIAR:**
```
Los proyectos personales están implementados de manera formal en IIIº y IVº Medio donde todos los estudiantes deben desarrollar uno durante el año. En IIIº Medio es un proyecto semestral y en IVº es anual y más profundo, conectado con su proyecto de vida post-escolar. En Iº y IIº Medio existen proyectos pero son grupales y con temas más acotados, no completamente personales. Los estudiantes de IIIº y IVº eligen libremente su tema, mientras en Iº y IIº los temas están más delimitados por las asignaturas que participan. El próximo año queremos extender los proyectos personales a IIº Medio.
```

**NIVEL DE AVANCE:** Selecciona **"En desarrollo"**

**Pregunta (FRECUENCIA):**
> ¿Con qué periodicidad se realizan los proyectos personales?
> ¿Los tiempos de trabajo están integrados en el horario regular?

**RESPUESTA PARA COPIAR:**
```
Los proyectos personales se realizan una vez al año en IIIº y IVº Medio. El tiempo de trabajo está parcialmente integrado en el horario: hay 2 horas semanales reservadas para "Proyecto Personal" donde los estudiantes trabajan de manera autónoma con supervisión de un profesor. Además, se espera que dediquen tiempo fuera del horario escolar. Las reuniones con el profesor guía son quincenales durante el horario de proyecto. Hay tres momentos formales de presentación: propuesta inicial (abril), avance (agosto) y presentación final (noviembre-diciembre). Los proyectos de IVº Medio tienen exposición abierta a la comunidad.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (PROFUNDIDAD):**
> ¿Los alumnos eligen el tema, el propósito y el producto de su proyecto?
> ¿Los proyectos incluyen planificación y revisión periódica de metas?

**RESPUESTA PARA COPIAR:**
```
Los estudiantes tienen amplia libertad: eligen el tema según sus intereses, definen el propósito (qué quieren aprender o lograr) y deciden el producto final (ensayo, producto tecnológico, obra artística, investigación, emprendimiento). El proceso incluye: una fase de exploración donde definen el tema, una propuesta escrita con objetivos y plan de trabajo, revisiones quincenales con el profesor guía donde ajustan metas, y autoevaluación del proceso. En IVº Medio se conecta explícitamente con el proyecto de vida: los estudiantes reflexionan sobre cómo su proyecto se relaciona con sus planes futuros. La presentación final incluye reflexión metacognitiva sobre el aprendizaje.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

---

## Parte 5: Finalizar y Generar Reporte

Después de responder la última pregunta:

1. Haz clic en **"Finalizar Evaluación"**
2. Espera mientras se genera el reporte (puede tomar 30-60 segundos)
3. Verifica que aparece el resumen con:
   - Nivel de transformación (1-4)
   - Etiqueta (Incipiente/Emergente/Avanzado/Consolidado)
   - Resumen generado por AI
   - Fortalezas identificadas
   - Áreas de crecimiento
   - Recomendaciones

### Verificar:
- [ ] El reporte se genera sin errores
- [ ] Aparece un nivel de transformación coherente (esperado: 2 o 3)
- [ ] El resumen hace referencia a elementos de las respuestas
- [ ] Las fortalezas y áreas de crecimiento son relevantes
- [ ] Hay gráficos visuales (radar chart, bar chart)

---

## Parte 6: Probar PDFs

Una vez generado el reporte:

### PDF Resumen:
1. Haz clic en **"PDF Resumen"**
2. Se abre una ventana de impresión
3. Verifica el contenido

### Verificar PDF Resumen:
- [ ] Aparece el logo de FNE arriba a la izquierda
- [ ] Aparece el nombre de la escuela y fecha
- [ ] Aparece "Elaborado por" con tu nombre
- [ ] El nivel de transformación es visible
- [ ] El resumen es legible
- [ ] El diseño se ve profesional

### PDF Completo:
1. Cierra la ventana anterior
2. Haz clic en **"PDF Completo"**
3. Verifica el contenido adicional

### Verificar PDF Completo:
- [ ] Incluye todo lo del PDF Resumen
- [ ] Muestra los detalles por dimensión
- [ ] Incluye los gráficos
- [ ] Las tablas se ven correctamente
- [ ] No hay texto cortado o fuera de márgenes

---

## Parte 7: Verificar Colaboradores (Opcional)

Si tienes tiempo y hay otros usuarios en tu escuela:

1. En la evaluación creada, busca la sección de **Colaboradores**
2. Intenta agregar un colaborador (si hay otro usuario disponible)
3. Verifica que aparece en la lista

### Verificar:
- [ ] Puedes ver la lista de colaboradores
- [ ] Apareces tú como creador
- [ ] (Opcional) Puedes agregar colaboradores
- [ ] (Opcional) Los colaboradores agregados aparecen en la lista

---

## Reporte de Errores

Si encuentras algún problema, reporta:

1. **Qué estabas haciendo** (paso específico)
2. **Qué esperabas que pasara**
3. **Qué pasó en realidad**
4. **Screenshot** si es posible

Envía el reporte a: bcurtis@nuevaeducacion.org

---

## Checklist Final

- [ ] Pude acceder a Vías de Transformación desde el sidebar
- [ ] Pude crear una nueva evaluación
- [ ] Respondí las 18 preguntas de contexto
- [ ] Completé toda la evaluación (44 secciones)
- [ ] Se generó el reporte con AI
- [ ] El PDF Resumen se ve correcto
- [ ] El PDF Completo se ve correcto
- [ ] No encontré errores críticos

**Tiempo estimado total:** 45-60 minutos

---

*Documento generado para pruebas QA - Diciembre 2025*
