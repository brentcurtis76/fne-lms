# Manual de Pruebas QA: Vías de Transformación - Evaluación

**Fecha:** Diciembre 2025
**Tester:** docente.test5@fne-lms.test
**Contraseña:** Prueba2025!
**Organización:** Escuela de Pruebas QA

---

## Objetivo

Verificar que la funcionalidad completa de **Vías de Transformación** funcione correctamente para el área de **Evaluación**, incluyendo:
- Creación de una evaluación
- Responder preguntas de contexto
- Completar la evaluación con respuestas coherentes
- Verificar que el AI genera un reporte
- Probar la descarga de PDFs

---

## Requisitos Previos

1. Tener acceso a la plataforma FNE con el usuario **docente.test5@fne-lms.test**
2. Contraseña: **Prueba2025!**
3. Conexión a internet estable (la evaluación usa AI)

---

## Parte 1: Acceder a Vías de Transformación

### Pasos:

1. Ingresa a https://www.nuevaeducacion.org
2. Inicia sesión con:
   - Email: **docente.test5@fne-lms.test**
   - Contraseña: **Prueba2025!**
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
2. Selecciona el área: **"Evaluación"** (NO personalización ni aprendizaje)
3. Selecciona los niveles (grados) - puedes seleccionar: **3º Básico, 4º Básico, 5º Básico, 6º Básico**
4. Confirma la creación

### Verificar:
- [ ] Se muestra un selector de área con opción "Evaluación"
- [ ] Se pueden seleccionar múltiples niveles/grados
- [ ] La evaluación se crea correctamente
- [ ] Se redirige a la pantalla de preguntas de contexto

---

## Parte 3: Preguntas de Contexto (18 preguntas)

Estas son preguntas sobre el contexto de tu escuela. Usa las respuestas indicadas abajo.

### SECCIÓN A: Contexto Institucional

**Pregunta 1:** ¿Cuántos estudiantes tiene aproximadamente tu colegio?
> **Respuesta:** Selecciona **"900-1200"**

**Pregunta 2:** ¿En qué niveles educativos están trabajando actualmente en prácticas de personalización del aprendizaje?
> **Respuesta:** Selecciona: **3º Básico, 4º Básico, 5º Básico, 6º Básico, 7º Básico, 8º Básico**

**Pregunta 3:** ¿Tienen una Generación Tractor implementada?
> **Respuesta:** Selecciona **"No"**

**Pregunta 4:** ¿Tienen una Generación Innova implementada?
> **Respuesta:** Selecciona **"Sí"**
>
> *Luego selecciona los cursos:* **3º Básico, 4º Básico, 5º Básico, 6º Básico**

**Pregunta 5:** ¿Cuánto tiempo lleva tu colegio trabajando en personalización del aprendizaje?
> **Respuesta:** Selecciona **"3-5 años"**

**Pregunta 6:** ¿Cuántos docentes trabajan en tu colegio aproximadamente?
> **Respuesta:** Selecciona **"60-80"**

### SECCIÓN B: Estado Actual de Personalización

**Pregunta 7:** ¿Tu colegio cuenta actualmente con algún modelo de plan personal implementado para los estudiantes?
> **Respuesta:** Selecciona **"Sí, en algunos niveles (generación innova)"**

**Pregunta 8:** ¿Los tutores realizan entrevistas individuales periódicas con estudiantes?
> **Respuesta:** Selecciona **"Sí, con periodicidad sistemática a lo largo del curso"**

**Pregunta 9:** ¿Los estudiantes tienen oportunidades reales de elegir cómo, qué o con quién aprenden?
> **Respuesta:** Selecciona **"En la mayoría de los niveles con cierta regularidad"**

**Pregunta 10:** ¿Qué porcentaje de docentes conoce y aplica principios del Diseño Universal para el Aprendizaje (DUA)?
> **Respuesta:** Selecciona **"50-75% conocen y algunos aplican"**

**Pregunta 11:** ¿Los estudiantes realizan proyectos de autoconocimiento estructurados?
> **Respuesta:** Selecciona **"Sí, con progresión diseñada entre cursos"**

### SECCIÓN C: Resistencias y Barreras

**Pregunta 12:** Si pudieras fortalecer un aspecto para avanzar más rápido en personalización del aprendizaje, ¿cuál tendría mayor impacto?
> **Respuesta:** Selecciona **"Fortalecer la cultura de innovación y experimentación en la escuela"**

**Pregunta 13:** ¿Dónde encuentran las mayores resistencias a dar mayor autonomía y elección a los estudiantes?
> **Respuesta:** Selecciona: **"Docentes de media"** y **"Los propios estudiantes (no están acostumbrados a elegir)"**

**Pregunta 14:** Las familias de tu colegio, ¿cómo perciben el enfoque de personalización del aprendizaje?
> **Respuesta:** Selecciona **"Lo entienden y valoran"**

**Pregunta 15:** ¿El equipo directivo prioriza y apoya activamente la personalización del aprendizaje?
> **Respuesta:** Selecciona **"Sí, es un pilar estratégico con liderazgo claro"**

### SECCIÓN D: Capacidad y Percepción

**Pregunta 16:** ¿La escuela cuenta con sistemas o herramientas para hacer seguimiento individual de cada estudiante?
> **Respuesta:** Selecciona **"Sí, hay un sistema institucional implementado"**

**Pregunta 17:** En tu percepción, ¿qué tan preparados están los docentes para acompañar trayectorias personalizadas de aprendizaje?
> **Respuesta:** Selecciona **"Alto - están implementando gradualmente con buenos resultados"**

**Pregunta 18:** ¿Los estudiantes de tu colegio demuestran capacidad de autorregulación, planificación y reflexión sobre su propio aprendizaje?
> **Respuesta:** Selecciona **"Medio - está en desarrollo pero aún inconsistente"**

### Verificar:
- [ ] Puedes responder todas las 18 preguntas
- [ ] El progreso se muestra (X de 18)
- [ ] Al completar, aparece el botón "Continuar a la Evaluación"
- [ ] Haz clic en "Continuar a la Evaluación"

---

## Parte 4: Evaluación por Objetivos

Ahora responderás preguntas sobre cada objetivo y acción del área de Evaluación. Esta área tiene 2 objetivos con 9 acciones en total (36 secciones).

**IMPORTANTE:**
- Después de escribir cada respuesta, haz clic en **"Ingresar respuesta"**
- Luego selecciona el nivel de avance cuando corresponda
- Finalmente haz clic en **"Siguiente"**

---

### OBJETIVO 1: Cultura de Evaluación Formativa
*La escuela desarrolla una cultura de evaluación formativa y formadora, orientada a acompañar el aprendizaje, promover la metacognición y fortalecer la autonomía del estudiante.*

---

#### Acción 1.1 - Estrategias e Instrumentos de Evaluación

**Pregunta (ACCIÓN):**
> ¿Qué tipo de instrumentos de evaluación utilizan los docentes (pruebas, rúbricas, portafolios, informes descriptivos, observaciones…)?
> ¿Se privilegia la calificación numérica o la retroalimentación cualitativa?

**RESPUESTA PARA COPIAR:**
```
En nuestra escuela utilizamos una variedad de instrumentos de evaluación que han evolucionado en los últimos años. Los docentes trabajan con: rúbricas analíticas para proyectos y trabajos escritos, portafolios digitales en la generación innova (3º a 6º Básico), registros de observación para habilidades socioemocionales, e informes descriptivos trimestrales que complementan las calificaciones. Todavía mantenemos pruebas escritas en algunas asignaturas (especialmente en Media), pero hemos reducido su peso. La retroalimentación cualitativa ha ganado espacio: los docentes entregan comentarios escritos en los trabajos y realizamos "semanas de devolución" donde no hay pruebas sino conversaciones sobre el aprendizaje. La política institucional establece que al menos el 40% de la evaluación debe ser formativa.
```

**Pregunta (COBERTURA):**
> ¿Cuántos niveles o cursos de la escuela trabajan con estrategias de evaluación formativa?
> ¿Es algo que todos los docentes aplican o depende de cada uno?

**RESPUESTA PARA COPIAR:**
```
Las estrategias de evaluación formativa están más desarrolladas en la generación innova (3º a 6º Básico), donde prácticamente todos los docentes las aplican consistentemente. En estos niveles tenemos portafolios, rúbricas compartidas con los estudiantes, y devoluciones cualitativas sistemáticas. En 7º y 8º Básico, aproximadamente el 70% de los docentes utiliza evaluación formativa regularmente, mientras que el 30% restante todavía privilegia pruebas tradicionales. En Educación Media, la adopción es más irregular: algunos departamentos (como Lenguaje y Artes) han avanzado mucho, mientras que Matemáticas y Ciencias mantienen más peso en evaluaciones sumativas. La coexistencia de enfoques genera cierta inconsistencia en la experiencia del estudiante.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia se evalúa el progreso de los estudiantes?
> ¿Las evaluaciones se concentran al final de cada trimestre o se distribuyen a lo largo del curso?

**RESPUESTA PARA COPIAR:**
```
Hemos trabajado para distribuir la evaluación a lo largo del curso. En la generación innova, la evaluación es continua: cada semana hay instancias de revisión del portafolio, retroalimentación de trabajos en proceso, y observaciones registradas. Los estudiantes reciben feedback al menos dos veces por semana en diferentes asignaturas. En los cursos mayores, la distribución es trimestral con al menos 4-5 instancias evaluativas por trimestre (no solo al final). Realizamos "cortes formativos" a mitad de cada trimestre donde los tutores revisan el progreso general con cada estudiante. Las pruebas acumulativas, cuando existen, representan solo el 30% de la calificación final y siempre van acompañadas de retroalimentación.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (PROFUNDIDAD):**
> ¿Qué peso tienen las calificaciones numéricas frente a los comentarios o devoluciones cualitativas?
> ¿Los docentes entregan feedback que los alumnos realmente revisan y usan para mejorar?

**RESPUESTA PARA COPIAR:**
```
En nuestra escuela hemos logrado equilibrar las calificaciones numéricas con la retroalimentación cualitativa. En la generación innova, la información cualitativa tiene mayor peso: los informes trimestrales incluyen 3 páginas de descripción narrativa del progreso y solo una sección con calificaciones (que mantenemos por requisito ministerial). Los estudiantes revisan activamente el feedback porque tienen espacios dedicados: los "tiempos de mejora" donde pueden rehacer trabajos incorporando las sugerencias. Las rúbricas se comparten antes de cada tarea para que los estudiantes sepan los criterios. En Media, las calificaciones todavía tienen protagonismo, pero los docentes incluyen comentarios específicos en cada evaluación. El desafío es asegurar que todos los estudiantes realmente utilicen el feedback - algunos lo hacen sistemáticamente, otros necesitan más acompañamiento.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

---

#### Acción 1.2 - Retroalimentación Constante

**Pregunta (ACCIÓN):**
> ¿Cómo entregan los docentes la retroalimentación a los alumnos: de forma oral, escrita, grupal o individual?
> ¿La retroalimentación se da acompañando el proceso de aprendizaje o solo al final de una evaluación finalista?

**RESPUESTA PARA COPIAR:**
```
Los docentes utilizan múltiples formas de retroalimentación. La retroalimentación escrita es la más común: comentarios en trabajos físicos y digitales, usando rúbricas con descriptores específicos. La retroalimentación oral ocurre durante las clases mediante "conferencias de escritura" (mini-reuniones de 5 minutos con cada estudiante), círculos de feedback grupal, y las entrevistas individuales de tutoría. También usamos retroalimentación entre pares estructurada con protocolos específicos. La retroalimentación se da principalmente durante el proceso: antes de entregar un trabajo final, los estudiantes reciben al menos una ronda de comentarios para mejorar. Tenemos la política de "no calificar borradores" para que los estudiantes se enfoquen en el feedback sin preocuparse por la nota. La retroalimentación final existe pero siempre incluye orientaciones para futuras tareas.
```

**Pregunta (COBERTURA):**
> ¿En qué niveles o ciclos se implementan prácticas de retroalimentación formativa?
> ¿Todos los docentes ofrecen devoluciones cualitativas o depende de cada profesor?

**RESPUESTA PARA COPIAR:**
```
Las prácticas de retroalimentación formativa están implementadas en toda la escuela, aunque con diferente intensidad. En la generación innova (3º a 6º Básico), todos los docentes entregan devoluciones cualitativas como parte de su práctica regular - es un requisito institucional con seguimiento desde coordinación. En 7º y 8º Básico, la mayoría de los docentes (aproximadamente 80%) entrega feedback cualitativo, aunque la frecuencia varía. En Media, la práctica depende más del departamento: Lenguaje, Artes e Historia tienen culturas fuertes de retroalimentación; Matemáticas y Ciencias están en transición. El equipo directivo ha definido que todos los docentes deben incluir comentarios cualitativos en al menos el 50% de las evaluaciones, pero el cumplimiento en algunos casos es más formal que sustantivo.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia los alumnos reciben retroalimentación?
> ¿El feedback ocurre solo en momentos de evaluación o es parte del trabajo cotidiano en clase?

**RESPUESTA PARA COPIAR:**
```
En la generación innova, los estudiantes reciben retroalimentación constantemente como parte del trabajo cotidiano. Cada día hay momentos de feedback oral durante las actividades, y semanalmente reciben comentarios escritos en sus trabajos del portafolio. Las "conferencias de escritura" se realizan al menos una vez por semana en Lenguaje. En 7º y 8º Básico, la retroalimentación es semanal en la mayoría de las asignaturas, combinando comentarios en tareas y devoluciones orales en clase. En Media, la frecuencia baja a quincenal o mensual en algunas asignaturas, concentrándose más en momentos evaluativos formales. Los tutores realizan una revisión quincenal del progreso general con cada estudiante en todos los niveles. Hemos institucionalizado los "viernes de feedback" donde no hay contenido nuevo sino revisión y mejora de trabajos.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (PROFUNDIDAD):**
> ¿El feedback se centra en corregir errores o también orienta sobre cómo mejorar?
> ¿Existen espacios de diálogo donde docente y alumno conversan sobre avances y próximos pasos?

**RESPUESTA PARA COPIAR:**
```
Hemos trabajado mucho para que el feedback sea orientador y no solo correctivo. Los docentes utilizan el modelo "qué hiciste bien, qué puedes mejorar, cómo hacerlo" en sus devoluciones. Las rúbricas incluyen descriptores de "siguiente nivel" para que los estudiantes vean el camino de mejora. Existen múltiples espacios de diálogo: las conferencias individuales en clase, las entrevistas de tutoría (3 por año), y los "momentos de metacognición" al cierre de proyectos donde estudiantes y docentes conversan sobre el proceso. En la generación innova, los estudiantes tienen una "libreta de aprendizaje" donde registran el feedback recibido y sus reflexiones. El feedback reconoce explícitamente los progresos y el esfuerzo, no solo el resultado. El desafío pendiente es que algunos docentes todavía se centran demasiado en el error.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

---

#### Acción 1.3 - Autoevaluación y Coevaluación

**Pregunta (ACCIÓN):**
> ¿Los alumnos participan activamente en los procesos de evaluación o la evaluación sigue siendo responsabilidad exclusiva del docente?
> ¿Existen instancias formales de autoevaluación o coevaluación?

**RESPUESTA PARA COPIAR:**
```
Los estudiantes participan activamente en la evaluación en nuestra escuela. Tenemos instancias formales de autoevaluación al inicio, desarrollo y cierre de cada proyecto o unidad. Los estudiantes completan rúbricas de autoevaluación usando los mismos criterios que el docente, lo que les permite comparar su percepción con la evaluación del profesor. La coevaluación se realiza mediante protocolos estructurados: "dos estrellas y un deseo" (dos aspectos positivos y una sugerencia), "protocolo del semáforo" (verde, amarillo, rojo según criterios), y "gallery walk" donde los estudiantes dejan comentarios escritos en los trabajos de sus compañeros. En algunos cursos los estudiantes proponen criterios de evaluación para proyectos, negociando con el docente. La responsabilidad de la evaluación es compartida, aunque la calificación final sigue siendo del docente.
```

**Pregunta (COBERTURA):**
> ¿En qué niveles o cursos se realizan prácticas de autoevaluación o coevaluación?
> ¿Todos los docentes las implementan o solo algunos?

**RESPUESTA PARA COPIAR:**
```
Las prácticas de autoevaluación y coevaluación están presentes en todos los niveles desde 3º Básico hasta 4º Medio, aunque con diferente profundidad. En la generación innova, todos los docentes las implementan de manera sistemática como parte del modelo pedagógico. En 7º y 8º Básico, aproximadamente el 75% de los docentes incluyen estas prácticas regularmente. En Media, la implementación es más desigual: algunos departamentos las han integrado completamente (Lenguaje, Artes, Tecnología) mientras otros las usan ocasionalmente (Matemáticas, Ciencias). La autoevaluación está más extendida que la coevaluación, ya que algunos docentes sienten que la coevaluación entre pares puede generar conflictos si no está bien estructurada. Estamos trabajando en protocolos comunes para toda la escuela.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia los alumnos realizan ejercicios de autoevaluación o coevaluación?
> ¿Se realizan solo al final de un trimestre o también durante los proyectos?

**RESPUESTA PARA COPIAR:**
```
La frecuencia varía según el nivel y el tipo de actividad. En la generación innova, la autoevaluación es semanal: cada viernes los estudiantes reflexionan sobre su semana de aprendizaje y completan una mini-rúbrica. La coevaluación ocurre en cada proyecto grupal (aproximadamente una vez al mes) y en las sesiones de "revisión entre pares" de escritura. En 7º y 8º Básico, la autoevaluación se realiza al cierre de cada unidad (aproximadamente mensual) y la coevaluación en proyectos trimestrales. En Media, estas prácticas se concentran más al final de trimestre, aunque algunos docentes las integran con mayor frecuencia. En todos los niveles, realizamos una autoevaluación profunda al cierre de cada semestre como parte del proceso de entrevista con familias.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (PROFUNDIDAD):**
> ¿Las autoevaluaciones se centran en percepciones generales o se apoyan en criterios de aprendizaje?
> ¿Los alumnos identifican fortalezas, dificultades y estrategias para mejorar?

**RESPUESTA PARA COPIAR:**
```
Las autoevaluaciones en nuestra escuela se basan en criterios de aprendizaje específicos, no en percepciones generales. Utilizamos rúbricas adaptadas para autoevaluación donde los estudiantes deben justificar su nivel con evidencias de su trabajo. El formato incluye: identificar fortalezas con ejemplos concretos, reconocer dificultades específicas, y proponer estrategias de mejora para el próximo proyecto. Los estudiantes de la generación innova registran sus autoevaluaciones en su portafolio digital, creando un historial que pueden revisar para ver su progreso. La coevaluación se estructura con protocolos que aseguran que los comentarios sean constructivos y específicos. El desafío es que algunos estudiantes todavía responden superficialmente; estamos trabajando en modelar mejor la reflexión profunda. Los docentes revisan las autoevaluaciones y conversan con estudiantes cuando hay grandes diferencias entre la autopercepción y el desempeño real.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

---

#### Acción 1.4 - Metacognición Sistemática

**Pregunta (ACCIÓN):**
> ¿Existen instancias planificadas para que los alumnos reflexionen sobre su propio aprendizaje?
> ¿Los docentes promueven que los estudiantes identifiquen qué estrategias les ayudan a aprender mejor?

**RESPUESTA PARA COPIAR:**
```
Sí, la metacognición es parte central de nuestro modelo pedagógico. Tenemos instancias planificadas en diferentes momentos: al inicio de cada proyecto los estudiantes planifican su proceso y anticipan dificultades, durante el desarrollo reflexionan sobre qué está funcionando, y al cierre analizan qué estrategias fueron efectivas. Los docentes utilizan preguntas metacognitivas como "¿qué hiciste cuando te trabaste?", "¿qué harías diferente la próxima vez?", "¿cómo supiste que estabas aprendiendo?". En la generación innova, los estudiantes tienen un "diario de aprendizaje" donde registran reflexiones semanales sobre sus estrategias. Los tutores trabajan explícitamente en identificar estilos de aprendizaje y estrategias personales efectivas. También realizamos "círculos de estrategias" donde los estudiantes comparten qué les funciona con sus compañeros.
```

**Pregunta (COBERTURA):**
> ¿En qué niveles o cursos se realizan ejercicios de metacognición?
> ¿Es una práctica presente en toda la escuela o solo en algunos ciclos?

**RESPUESTA PARA COPIAR:**
```
Los ejercicios de metacognición están presentes en toda la escuela, aunque con diferentes formatos según la edad. En 3º y 4º Básico, usamos preguntas simples y visuales: caritas, semáforos, y "mi estrategia de hoy fue...". En 5º y 6º Básico, los estudiantes completan fichas de reflexión más elaboradas y mantienen su diario de aprendizaje. En 7º y 8º Básico, la metacognición se integra en proyectos y en las sesiones de tutoría. En Media, algunos departamentos la han incorporado más que otros: es fuerte en Lenguaje, Filosofía e Historia, pero más débil en Ciencias y Matemáticas. La práctica está extendida en tutoría a todos los niveles. El desafío es asegurar que la metacognición no se limite a tutoría sino que esté presente en todas las asignaturas de manera consistente.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia los alumnos realizan reflexiones metacognitivas?
> ¿La metacognición está integrada en la planificación regular de aula?

**RESPUESTA PARA COPIAR:**
```
En la generación innova, la metacognición es semanal y está integrada en la planificación: cada viernes hay un espacio de 30 minutos para reflexión sobre la semana de aprendizaje. Además, cada proyecto incluye momentos metacognitivos al inicio (planificación), durante (monitoreo) y al cierre (evaluación de estrategias). En 7º y 8º Básico, la reflexión metacognitiva ocurre al cierre de cada unidad (aproximadamente cada 3-4 semanas) y de forma más breve al final de clases significativas. En Media, la frecuencia depende más del docente y la asignatura. Las sesiones de tutoría (quincenales) incluyen siempre un componente metacognitivo en todos los niveles. La metacognición está en la planificación institucional, pero la implementación real varía según el docente.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (PROFUNDIDAD):**
> ¿Las reflexiones de los alumnos se centran solo en resultados o analizan causas y estrategias?
> ¿Los estudiantes reconocen qué estrategias les resultan más eficaces?

**RESPUESTA PARA COPIAR:**
```
Las reflexiones metacognitivas en nuestra escuela van más allá de los resultados. Los estudiantes aprenden a analizar: qué estrategias utilizaron, por qué funcionaron o no, qué harían diferente, y cómo aplicar lo aprendido en otras situaciones. Usamos fichas estructuradas con preguntas como "¿Qué obstáculo encontraste y cómo lo superaste?", "¿Qué estrategia te ayudó más?", "¿A qué otra situación podrías aplicar esta estrategia?". Los estudiantes de la generación innova tienen un "inventario de estrategias personal" donde registran qué les funciona para estudiar, concentrarse, organizarse, etc. Los tutores revisan estas reflexiones y las conectan con las metas del plan personal. El desafío es que algunos estudiantes responden de forma superficial; estamos formando a los docentes en cómo facilitar reflexión más profunda mediante preguntas de seguimiento.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

---

### OBJETIVO 2: Evaluación Participativa y Corresponsable
*La escuela promueve una evaluación participativa que involucra a docentes, estudiantes y familias en el seguimiento del aprendizaje.*

---

#### Acción 2.1 - Involucramiento de Familias

**Pregunta (ACCIÓN):**
> ¿De qué manera se involucra a las familias en el proceso de aprendizaje de los alumnos?
> ¿Existen entrevistas o reuniones formativas donde se converse sobre avances y desafíos?

**RESPUESTA PARA COPIAR:**
```
Las familias son aliadas fundamentales en el proceso de aprendizaje. Realizamos tres tipos de encuentros: (1) Reuniones de apoderados trimestrales donde presentamos el enfoque pedagógico y compartimos estrategias para apoyar en casa; (2) Entrevistas individuales tutor-familia dos veces al año (mayo y octubre) donde conversamos sobre el desarrollo integral del estudiante usando informes descriptivos; (3) Las "presentaciones de aprendizaje" trimestrales donde los propios estudiantes muestran su portafolio a sus familias. Compartimos informes descriptivos que van más allá de las notas: incluyen narrativas sobre el desarrollo personal, social y académico. Las familias pueden acceder al portafolio digital de sus hijos y ver el progreso continuo. También realizamos talleres formativos para familias sobre cómo acompañar el aprendizaje en casa sin presionar por notas.
```

**Pregunta (COBERTURA):**
> ¿Estas entrevistas o reuniones se realizan en todos los niveles del colegio?
> ¿Participan todas las familias o solo aquellas que lo solicitan?

**RESPUESTA PARA COPIAR:**
```
Las reuniones y entrevistas se realizan en todos los niveles desde 3º Básico hasta 4º Medio. En la generación innova, la participación de familias es muy alta (sobre el 90%) porque las presentaciones de aprendizaje trimestrales son muy valoradas. En 7º y 8º Básico, la participación en entrevistas individuales ronda el 80%. En Media, baja al 65-70% porque algunas familias delegan más en el estudiante. Las reuniones de apoderados son obligatorias y tienen asistencia del 85% promedio. Los tutores tienen un protocolo para contactar especialmente a las familias que no asisten, ofreciendo horarios alternativos o videollamadas. Todos los docentes participan en las reuniones de su curso, no solo el tutor. El equipo de orientación participa en casos que requieren mayor acompañamiento.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia se realizan las entrevistas o reuniones con familias?
> ¿Hay seguimiento después de estas entrevistas?

**RESPUESTA PARA COPIAR:**
```
Las reuniones con familias están calendarizadas de forma clara: reuniones de apoderados al inicio de cada trimestre (3 al año), entrevistas individuales en mayo y octubre (2 al año), y presentaciones de aprendizaje al cierre de cada trimestre (3 al año). Esto significa que las familias tienen al menos 8 instancias formales de contacto con la escuela por año, más las comunicaciones informales. Después de las entrevistas individuales, los tutores envían un resumen con los acuerdos alcanzados y realizan un seguimiento a las 4-6 semanas para ver avances. Si se identifican situaciones que requieren mayor atención, se programan encuentros adicionales. Las familias también pueden solicitar reuniones extraordinarias cuando lo necesiten. Usamos una plataforma donde las familias pueden ver el calendario y agendar citas.
```

**NIVEL DE AVANCE:** Selecciona **"Consolidado"**

**Pregunta (PROFUNDIDAD):**
> ¿Las reuniones se centran en notas y rendimiento, o en una visión integral del alumno?
> ¿Los alumnos participan en estas reuniones explicando sus aprendizajes?

**RESPUESTA PARA COPIAR:**
```
Nuestras reuniones se centran en una visión integral del estudiante. Los informes descriptivos incluyen: desarrollo personal (autoconocimiento, autonomía, responsabilidad), desarrollo social (trabajo colaborativo, resolución de conflictos, liderazgo), y desarrollo académico (por áreas, con énfasis en procesos y no solo resultados). Las entrevistas individuales siguen una pauta que comienza preguntando cómo está el estudiante en casa, qué le gusta, qué le preocupa, antes de hablar de lo académico. Las familias participan activamente en la conversación, no solo escuchan. En las presentaciones de aprendizaje trimestrales, los propios estudiantes lideran: presentan su portafolio, explican qué aprendieron, qué les costó, y qué metas tienen. Las familias hacen preguntas y ofrecen reconocimiento. Esta práctica ha transformado la relación escuela-familia porque las familias ven el aprendizaje real, no solo números.
```

**NIVEL DE AVANCE:** Selecciona **"Consolidado"**

---

#### Acción 2.2 - Participación del Estudiante en Reuniones

**Pregunta (ACCIÓN):**
> ¿En qué tipo de reuniones o instancias participa el alumno junto a su familia?
> ¿Qué rol tiene el alumno en esas reuniones?

**RESPUESTA PARA COPIAR:**
```
Los estudiantes participan en dos tipos principales de reuniones: las presentaciones de aprendizaje trimestrales y una de las dos entrevistas anuales (la de octubre). En las presentaciones de aprendizaje, el estudiante es el protagonista absoluto: lidera la reunión de 30-40 minutos mostrando su portafolio, explicando sus aprendizajes, reflexionando sobre sus desafíos, y planteando sus metas. Los padres y el tutor escuchan y hacen preguntas, pero el estudiante conduce. En la entrevista de octubre, el estudiante participa en los primeros 20 minutos presentando su autoevaluación del año y luego se retira para que tutor y familia conversen aspectos de acompañamiento. En la entrevista de mayo, participan solo familia y tutor para establecer líneas de trabajo conjunto. Esta diferenciación permite espacios para ambos tipos de conversación.
```

**Pregunta (COBERTURA):**
> ¿En qué niveles o ciclos se realiza la participación del alumno en reuniones formativas?
> ¿Todos los alumnos tienen la oportunidad de participar?

**RESPUESTA PARA COPIAR:**
```
La participación del alumno en reuniones formativas está implementada en todos los niveles desde 3º Básico hasta 4º Medio, adaptada a cada etapa. En 3º y 4º Básico, las presentaciones son más breves (20 minutos) y estructuradas con apoyo visual. En 5º y 6º Básico, los estudiantes tienen más autonomía en la conducción. En 7º, 8º Básico y Media, las presentaciones son más elaboradas e incluyen reflexión metacognitiva profunda. Todos los estudiantes participan sin excepción - es parte del modelo y está calendarizado. La preparación para las presentaciones ocurre durante las semanas previas en horario de tutoría. Los estudiantes con necesidades especiales reciben apoyo adicional del equipo de orientación para preparar su presentación. Algunas familias inicialmente se sorprenden de ver a sus hijos liderar, pero el feedback ha sido muy positivo.
```

**NIVEL DE AVANCE:** Selecciona **"Consolidado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia se planifican estas reuniones con participación del alumno?
> ¿La escuela combina reuniones solo con familias y otras con participación del alumno?

**RESPUESTA PARA COPIAR:**
```
La frecuencia está claramente establecida en el calendario institucional. Las presentaciones de aprendizaje con participación del estudiante ocurren tres veces al año (cierre de cada trimestre). La entrevista con participación del estudiante es una vez al año (octubre). Esto significa que los estudiantes participan en cuatro instancias formativas con sus familias por año. Adicionalmente, hay reuniones solo entre familia y tutor: la entrevista de mayo y las reuniones de apoderados generales (3 al año). Esta combinación es intencional: algunas conversaciones requieren que el estudiante participe y lidere, otras requieren que los adultos coordinen estrategias de acompañamiento. Los estudiantes saben cuándo participarán y se preparan con anticipación.
```

**NIVEL DE AVANCE:** Selecciona **"Consolidado"**

**Pregunta (PROFUNDIDAD):**
> ¿Los alumnos se preparan previamente para participar?
> ¿Al cierre de la reunión se establecen compromisos compartidos?

**RESPUESTA PARA COPIAR:**
```
La preparación es fundamental para el éxito de las presentaciones. Durante las 2-3 semanas previas, en tutoría los estudiantes: revisan su portafolio y seleccionan evidencias representativas, completan una guía de reflexión sobre sus aprendizajes, practican presentar (algunos cursos hacen ensayos generales), y preparan sus metas para el próximo periodo. El tutor revisa y retroalimenta la preparación. Durante la presentación, los estudiantes muestran evidencias concretas y explican su proceso, no solo resultados. Al cierre, se establece un "contrato trimestral" con 2-3 compromisos: uno del estudiante, uno de la familia, y uno del tutor. Estos compromisos se revisan al inicio de la siguiente presentación. Los estudiantes más grandes incluyen reflexión metacognitiva sobre qué estrategias les ayudaron y cuáles quieren desarrollar. Las familias valoran enormemente ver a sus hijos como protagonistas de su aprendizaje.
```

**NIVEL DE AVANCE:** Selecciona **"Consolidado"**

---

#### Acción 2.3 - Uso de Resultados para Mejorar Prácticas

**Pregunta (ACCIÓN):**
> ¿Cómo se utilizan los resultados de la evaluación formativa más allá del seguimiento individual?
> ¿Los equipos directivos revisan y analizan la información cualitativa?

**RESPUESTA PARA COPIAR:**
```
Los resultados de la evaluación formativa alimentan múltiples procesos institucionales. A nivel de aula, los docentes ajustan su planificación basándose en las evidencias de aprendizaje. A nivel de ciclo, los equipos docentes se reúnen mensualmente para analizar tendencias: qué habilidades están más logradas, dónde hay dificultades comunes, qué estrategias están funcionando. El equipo directivo recibe informes trimestrales con información cualitativa sistematizada: fortalezas y desafíos por nivel, análisis de los portafolios, tendencias en autoevaluaciones, y feedback de las presentaciones de aprendizaje. Usamos esta información para: diseñar jornadas de formación docente focalizadas, ajustar el modelo de tutoría, identificar estudiantes que necesitan mayor acompañamiento, y evaluar la efectividad de innovaciones pedagógicas. La información se comparte con docentes para que vean el panorama completo.
```

**Pregunta (COBERTURA):**
> ¿Qué equipos participan de este análisis?
> ¿Esta práctica está extendida en toda la escuela?

**RESPUESTA PARA COPIAR:**
```
El análisis de la información evaluativa involucra a múltiples equipos. Los equipos de ciclo (docentes por nivel) se reúnen mensualmente para revisar evidencias y tendencias de sus estudiantes. Los coordinadores de ciclo compilan y presentan síntesis al equipo directivo. El equipo de orientación analiza la información socioemocional y de desarrollo personal. El equipo directivo (director, subdirectora pedagógica, coordinadores) hace análisis estratégico trimestral para identificar focos de mejora. Esta práctica está más consolidada en la generación innova donde tenemos más instrumentos sistematizados. En 7º, 8º y Media, los análisis son menos frecuentes (trimestrales) pero existen. El desafío es que algunos departamentos trabajan más aislados y su información no siempre se integra con la visión institucional.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia se analizan los resultados y evidencias de la evaluación formativa?
> ¿El análisis se realiza durante el curso para ajustar prácticas?

**RESPUESTA PARA COPIAR:**
```
El análisis tiene múltiples frecuencias según el nivel y propósito. A nivel de aula, los docentes revisan evidencias continuamente y ajustan semanalmente. Los equipos de ciclo se reúnen mensualmente (90 minutos) para análisis colaborativo de casos y tendencias. Los coordinadores se reúnen quincenalmente con el equipo directivo para revisión de avances. Trimestralmente realizamos un análisis profundo institucional que incluye: revisión de portafolios muestra, análisis de autoevaluaciones agregadas, síntesis de las entrevistas con familias, y evaluación del progreso en las metas institucionales. Este análisis alimenta las jornadas de planificación de inicio de cada trimestre. El análisis en tiempo real permite ajustes durante el curso, no solo al final del año.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

**Pregunta (PROFUNDIDAD):**
> ¿Qué tipo de decisiones se derivan del análisis de la información evaluativa?
> ¿Existen herramientas comunes para sistematizar la información?

**RESPUESTA PARA COPIAR:**
```
Del análisis de información evaluativa derivamos múltiples decisiones. A nivel pedagógico: ajustes en la planificación de unidades, cambios en estrategias de enseñanza, diseño de apoyos diferenciados para grupos específicos. A nivel de formación docente: identificamos necesidades (por ejemplo, cómo dar mejor feedback) y diseñamos talleres internos. A nivel de gestión: asignación de recursos, modificaciones al horario para dar más tiempo a ciertas áreas. A nivel de acompañamiento: derivaciones a orientación, planes de apoyo individual. Usamos varias herramientas comunes: una matriz de seguimiento por estudiante en cada ciclo, un formato de análisis de portafolios, una plantilla de síntesis de entrevistas, y un dashboard digital con indicadores clave. El equipo directivo usa esta información para la planificación estratégica anual y para rendir cuenta a la comunidad. Compartimos hallazgos con los docentes para fortalecer la práctica.
```

**NIVEL DE AVANCE:** Selecciona **"Avanzado"**

---

#### Acción 2.4 - Visibilización de Aprendizajes

**Pregunta (ACCIÓN):**
> ¿La escuela organiza espacios donde los alumnos puedan compartir sus aprendizajes con la comunidad?
> ¿Qué tipo de actividades realizan: muestras, ferias, exposiciones?

**RESPUESTA PARA COPIAR:**
```
La visibilización de aprendizajes es parte central de nuestra cultura escolar. Realizamos: (1) Presentaciones de aprendizaje trimestrales donde cada estudiante muestra su portafolio a su familia; (2) La "Feria del Aprendizaje" anual (noviembre) donde todos los cursos exponen proyectos en stands abiertos a toda la comunidad; (3) Exposiciones rotativas en pasillos y hall central que se renuevan mensualmente; (4) "Noches de museo" donde cursos específicos montan exposiciones temáticas invitando a familias; (5) Presentaciones de proyectos personales de IIIº y IVº Medio abiertas a la comunidad. El propósito va más allá de "mostrar": buscamos que los estudiantes reflexionen sobre su proceso, reciban reconocimiento, y desarrollen habilidades de comunicación. Las familias y docentes participan como audiencia activa, haciendo preguntas y ofreciendo feedback.
```

**Pregunta (COBERTURA):**
> ¿En qué niveles o ciclos se llevan a cabo estas instancias de visibilización?
> ¿Participan todos los cursos?

**RESPUESTA PARA COPIAR:**
```
Las instancias de visibilización están presentes en todos los niveles. Las presentaciones de aprendizaje trimestrales son universales desde 3º Básico hasta 4º Medio. La Feria del Aprendizaje anual incluye stands de todos los cursos, cada uno mostrando un proyecto destacado del año. Las exposiciones en pasillos rotan entre niveles: cada mes se destaca un ciclo diferente. Las "Noches de museo" son más frecuentes en la generación innova (2-3 por año) pero también se realizan ocasionalmente en Media. Los proyectos personales de IIIº y IVº Medio tienen presentación pública obligatoria. Todos los estudiantes participan en al menos 4-5 instancias de visibilización por año. Las familias son invitadas a todas estas actividades y la asistencia es alta (75-90% dependiendo del evento).
```

**NIVEL DE AVANCE:** Selecciona **"Consolidado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia se organizan estas actividades?
> ¿Están planificadas dentro del calendario institucional?

**RESPUESTA PARA COPIAR:**
```
Las actividades de visibilización están integradas en el calendario institucional con fechas fijas. Las presentaciones de aprendizaje ocurren en las últimas dos semanas de cada trimestre (9 instancias posibles por familia al año, 3 por cada hijo). Las exposiciones de pasillo se renuevan al inicio de cada mes. La Feria del Aprendizaje es siempre el segundo sábado de noviembre. Las "Noches de museo" se programan trimestralmente para diferentes ciclos. Las presentaciones de proyectos personales de Media son en la primera semana de diciembre. El calendario se comparte con las familias al inicio del año para que puedan organizarse. Las fechas se respetan rigurosamente porque entendemos que las familias planifican para asistir. Esta regularidad ha creado expectativa positiva en la comunidad.
```

**NIVEL DE AVANCE:** Selecciona **"Consolidado"**

**Pregunta (PROFUNDIDAD):**
> ¿Qué muestran los alumnos: solo productos finales o también reflexiones sobre el proceso?
> ¿Las familias y docentes ofrecen feedback durante estas instancias?

**RESPUESTA PARA COPIAR:**
```
Los estudiantes muestran tanto productos como procesos y reflexiones. En las presentaciones de aprendizaje, el énfasis está en el proceso: muestran borradores junto al trabajo final, explican dificultades que enfrentaron, describen qué estrategias usaron, y reflexionan sobre qué aprendieron más allá del contenido. En la Feria del Aprendizaje, cada stand incluye una sección de "nuestro proceso" con fotos, bocetos y testimonios. Los estudiantes se preparan para responder "¿qué aprendiste?" y "¿qué fue lo más difícil?". Las familias participan activamente: hacen preguntas, escriben comentarios en "libros de visitas" de cada stand, y completan breves encuestas de feedback. Los docentes circulan ofreciendo reconocimiento y tomando notas para después conversar con los estudiantes. Estas instancias se conciben como celebración del aprendizaje, no competencia.
```

**NIVEL DE AVANCE:** Selecciona **"Consolidado"**

---

#### Acción 2.5 - Presentaciones de Aprendizaje Trimestrales

**Pregunta (ACCIÓN):**
> ¿La escuela realiza presentaciones de aprendizaje donde los alumnos comparten sus procesos ante sus familias?
> ¿Qué acompañamiento reciben los alumnos para prepararlas?

**RESPUESTA PARA COPIAR:**
```
Las presentaciones de aprendizaje son la piedra angular de nuestro sistema de evaluación y comunicación con familias. Cada trimestre, todos los estudiantes desde 3º Básico hasta 4º Medio presentan su portafolio y reflexiones a sus familias en una reunión de 30-40 minutos. El acompañamiento para preparar incluye: 4-6 sesiones de tutoría dedicadas a revisar el portafolio y seleccionar evidencias, una guía estructurada de reflexión que completan, práctica de presentación oral (algunos cursos hacen ensayos generales), y retroalimentación del tutor sobre la preparación. Los estudiantes aprenden a hablar de su aprendizaje con propiedad. El tutor está presente durante la presentación como facilitador, pero el estudiante conduce. Es impresionante ver estudiantes de 3º Básico explicar su proceso de aprendizaje con claridad.
```

**Pregunta (COBERTURA):**
> ¿En qué niveles o ciclos se implementan las presentaciones de aprendizaje?
> ¿Todos los alumnos participan?

**RESPUESTA PARA COPIAR:**
```
Las presentaciones de aprendizaje se implementan en todos los niveles desde 3º Básico hasta 4º Medio, sin excepción. Participan el 100% de los estudiantes porque es parte del modelo institucional, no una actividad opcional. En cada ciclo se adapta el formato: en 3º-4º Básico duran 20-25 minutos y son más estructuradas; en 5º-6º Básico duran 30 minutos con mayor autonomía; en 7º-8º Básico y Media duran 35-40 minutos e incluyen reflexión metacognitiva profunda. Los estudiantes con necesidades especiales reciben apoyo adicional para preparar y presentar, adaptando el formato si es necesario pero manteniendo la esencia de que ellos lideren. La asistencia de familias es muy alta (sobre 90% en promedio) porque valoran enormemente esta instancia.
```

**NIVEL DE AVANCE:** Selecciona **"Consolidado"**

**Pregunta (FRECUENCIA):**
> ¿Con qué frecuencia se realizan estas presentaciones?
> ¿Están planificadas dentro del calendario institucional?

**RESPUESTA PARA COPIAR:**
```
Las presentaciones de aprendizaje se realizan tres veces al año, al cierre de cada trimestre. Las fechas están fijadas en el calendario institucional desde inicio de año: última semana de mayo, última semana de septiembre, y segunda semana de diciembre. Cada familia tiene una cita agendada de antemano (horario acordado con el tutor). El período de presentaciones dura dos semanas para dar flexibilidad. Esta regularidad permite que las familias se organicen con anticipación. Los estudiantes también internalizan el ritmo: saben que cada trimestre cerrarán presentando su aprendizaje, lo que les motiva a ir construyendo su portafolio durante todo el período. Nunca hemos tenido que cancelar o postergar las presentaciones, incluso durante períodos difíciles.
```

**NIVEL DE AVANCE:** Selecciona **"Consolidado"**

**Pregunta (PROFUNDIDAD):**
> ¿Qué aspectos incluyen las presentaciones: aprendizajes académicos, sociales, personales?
> ¿Se incorporan elementos de metacognición?

**RESPUESTA PARA COPIAR:**
```
Las presentaciones son integrales y abarcan múltiples dimensiones. La estructura incluye: (1) Mi bienestar y desarrollo personal: cómo me he sentido, qué he aprendido sobre mí mismo, cómo he manejado desafíos emocionales; (2) Mis relaciones y trabajo con otros: colaboración, amistades, resolución de conflictos; (3) Mis aprendizajes académicos: por área, con evidencias concretas; (4) Mi reflexión metacognitiva: qué estrategias me funcionaron, qué dificultades enfrenté, cómo las superé; (5) Mis metas: qué quiero lograr el próximo trimestre. Los estudiantes de cursos mayores incluyen reflexión sobre su proyecto de vida y cómo sus aprendizajes se conectan con sus intereses futuros. Las familias quedan impresionadas por la profundidad de la reflexión. Al cierre se establecen compromisos compartidos entre estudiante, familia y tutor.
```

**NIVEL DE AVANCE:** Selecciona **"Consolidado"**

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
- [ ] Aparece un nivel de transformación coherente (esperado: 3 o 4 - Avanzado o Consolidado)
- [ ] El resumen hace referencia a elementos de las respuestas sobre evaluación
- [ ] Las fortalezas mencionan aspectos como presentaciones de aprendizaje, feedback, familias
- [ ] Las áreas de crecimiento son relevantes (posiblemente Media o sistematización)
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
- [ ] Pude crear una nueva evaluación seleccionando área "Evaluación"
- [ ] Respondí las 18 preguntas de contexto
- [ ] Completé toda la evaluación (36 secciones - 2 objetivos, 9 acciones)
- [ ] Se generó el reporte con AI
- [ ] El PDF Resumen se ve correcto
- [ ] El PDF Completo se ve correcto
- [ ] No encontré errores críticos

**Tiempo estimado total:** 35-50 minutos

---

## Notas sobre las Respuestas

Las respuestas proporcionadas describen una escuela con:
- **Evaluación formativa muy desarrollada** en la generación innova (3º-6º Básico)
- **Prácticas de retroalimentación** sistemáticas y profundas
- **Presentaciones de aprendizaje** como práctica central y consolidada
- **Involucramiento de familias** muy alto
- **Desafíos en Media** donde las prácticas son más variables

Esto debería producir una evaluación de nivel **3 (Avanzado)** o **4 (Consolidado)** con fortalezas claras en participación de familias y presentaciones de aprendizaje, y áreas de crecimiento en la extensión a todos los niveles.

---

*Documento generado para pruebas QA - Diciembre 2025*
