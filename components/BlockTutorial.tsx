import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  X, 
  FileText, 
  Video, 
  Image, 
  HelpCircle, 
  Download, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Play,
  Upload,
  Link,
  Settings,
  Eye,
  Users,
  BookOpen
} from 'lucide-react';

interface TutorialStep {
  title: string;
  content: string;
  tips?: string[];
  image?: string;
  video?: string;
}

interface SettingExplanation {
  setting: string;
  explanation: string;
  whenToUse: string;
  example: string;
}

interface BlockTutorialData {
  type: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  whenToUse: string[];
  steps: TutorialStep[];
  bestPractices: string[];
  examples: string[];
  settings?: SettingExplanation[];
}

const tutorialData: BlockTutorialData[] = [
  {
    type: 'text',
    name: 'Bloque de Texto',
    icon: <FileText className="text-blue-600" />,
    description: 'El bloque de texto te permite crear contenido rico con formato, incluyendo títulos, párrafos, listas y texto con estilo.',
    whenToUse: [
      'Explicar conceptos teóricos',
      'Proporcionar instrucciones detalladas',
      'Crear resúmenes y conclusiones',
      'Agregar notas importantes'
    ],
    steps: [
      {
        title: 'Agregar un Bloque de Texto',
        content: 'Haz clic en el botón "Agregar Texto" en la barra de herramientas principal.',
        tips: ['El bloque aparecerá al final de tu lección', 'Puedes arrastrarlo para reordenarlo']
      },
      {
        title: 'Escribir Contenido',
        content: 'Usa el editor TipTap para escribir tu contenido. Puedes agregar títulos, párrafos, listas y formato de texto.',
        tips: [
          'Usa Ctrl+B para texto en negrita',
          'Usa Ctrl+I para texto en cursiva',
          'Usa Ctrl+Z para deshacer cambios'
        ]
      },
      {
        title: 'Dar Formato al Texto',
        content: 'Utiliza la barra de herramientas del editor para aplicar formato como encabezados, listas con viñetas y texto resaltado.',
        tips: [
          'Los encabezados ayudan a organizar el contenido',
          'Las listas facilitan la lectura',
          'Mantén párrafos cortos para mejor legibilidad'
        ]
      },
      {
        title: 'Configurar el Bloque',
        content: 'Agrega un título descriptivo al bloque para identificarlo fácilmente en la línea de tiempo.',
        tips: ['Usa títulos descriptivos como "Introducción" o "Conceptos Clave"']
      }
    ],
    bestPractices: [
      'Mantén párrafos cortos (máximo 3-4 líneas)',
      'Usa encabezados para estructurar el contenido',
      'Incluye ejemplos para clarificar conceptos',
      'Utiliza listas para información fácil de seguir',
      'Revisa la ortografía y gramática antes de guardar'
    ],
    examples: [
      'Introducción a un tema nuevo',
      'Explicación de conceptos teóricos',
      'Instrucciones paso a paso',
      'Resumen de puntos clave',
      'Conclusiones y reflexiones'
    ],
    settings: [
      {
        setting: 'Título del bloque',
        explanation: 'Nombre que aparece en la línea de tiempo para identificar este bloque de contenido.',
        whenToUse: 'Siempre úsalo para organizar tu lección. Ayuda a navegar y encontrar contenido específico.',
        example: '"Introducción al tema", "Conceptos clave", "Ejercicio práctico", "Resumen"'
      },
      {
        setting: 'Editor de texto enriquecido (TipTap)',
        explanation: 'Editor que permite formato como negritas, cursivas, listas, encabezados y enlaces.',
        whenToUse: 'Usa encabezados para estructura, listas para organizar información, y formato para destacar puntos importantes.',
        example: 'H2 para secciones principales, listas con viñetas para pasos, negrita para conceptos clave.'
      },
      {
        setting: 'Colapsar/expandir bloque',
        explanation: 'Oculta temporalmente el contenido del bloque para facilitar la navegación durante la edición.',
        whenToUse: 'Úsalo cuando tengas muchos bloques y quieras enfocarte en uno específico.',
        example: 'Colapsa bloques completados para enfocarte en el que estás editando actualmente.'
      }
    ]
  },
  {
    type: 'video',
    name: 'Bloque de Video',
    icon: <Video className="text-amber-600" />,
    description: 'Integra videos de YouTube o Vimeo para crear contenido multimedia interactivo y engaging.',
    whenToUse: [
      'Demostrar procesos paso a paso',
      'Mostrar ejemplos prácticos',
      'Explicar conceptos complejos visualmente',
      'Proporcionar contenido complementario'
    ],
    steps: [
      {
        title: 'Agregar un Bloque de Video',
        content: 'Haz clic en "Agregar Video" y se creará un nuevo bloque de video.',
        tips: ['El bloque se puede mover arrastrándolo', 'Inicia colapsado para ahorrar espacio']
      },
      {
        title: 'Configurar la URL del Video',
        content: 'Pega la URL completa de YouTube o Vimeo en el campo correspondiente. El sistema detectará automáticamente el tipo de video.',
        tips: [
          'URLs de YouTube: https://www.youtube.com/watch?v=...',
          'URLs de Vimeo: https://vimeo.com/...',
          'El video se convertirá automáticamente a formato embebido'
        ]
      },
      {
        title: 'Vista Previa del Video',
        content: 'Una vez agregada la URL, verás una vista previa del video directamente en el editor.',
        tips: [
          'La vista previa es completamente funcional',
          'Los estudiantes verán el mismo reproductor',
          'Videos se cargan de forma segura'
        ]
      },
      {
        title: 'Agregar Información Adicional',
        content: 'Completa el título del bloque y agrega una leyenda opcional para proporcionar contexto.',
        tips: [
          'El título ayuda a identificar el video en la línea de tiempo',
          'La leyenda puede incluir instrucciones o puntos clave'
        ]
      }
    ],
    bestPractices: [
      'Usa videos de máximo 10-15 minutos para mantener la atención',
      'Agrega siempre una descripción del contenido del video',
      'Verifica que el video sea accesible públicamente',
      'Considera agregar subtítulos para mejor accesibilidad',
      'Coloca videos estratégicamente entre contenido de texto'
    ],
    examples: [
      'Tutorial paso a paso de un software',
      'Demostración de un experimento',
      'Entrevista con un experto',
      'Presentación de casos de estudio',
      'Explicación visual de conceptos abstractos'
    ],
    settings: [
      {
        setting: 'URL del video',
        explanation: 'Dirección web completa del video en YouTube o Vimeo. Se convierte automáticamente a formato embebido.',
        whenToUse: 'Copia la URL completa desde la barra de direcciones del navegador cuando estés viendo el video.',
        example: 'YouTube: https://www.youtube.com/watch?v=dQw4w9WgXcQ Vimeo: https://vimeo.com/123456789'
      },
      {
        setting: 'Leyenda del video (caption)',
        explanation: 'Texto descriptivo que aparece debajo del video para dar contexto.',
        whenToUse: 'Úsala para explicar qué van a ver, qué deben observar, o cómo se relaciona con la lección.',
        example: '"Este video muestra los pasos 1-5 del proceso. Presta atención a la técnica que usa en el minuto 3:45."'
      },
      {
        setting: 'Título del bloque de video',
        explanation: 'Nombre que identifica este video en la línea de tiempo de la lección.',
        whenToUse: 'Usa un título descriptivo que indique el contenido específico del video.',
        example: '"Demostración práctica", "Entrevista con experto", "Caso de estudio - Empresa X"'
      },
      {
        setting: 'Vista previa automática',
        explanation: 'El sistema muestra automáticamente el reproductor del video una vez que ingresas una URL válida.',
        whenToUse: 'La vista previa te permite verificar que es el video correcto antes de guardar.',
        example: 'Si no aparece la vista previa, verifica que la URL sea correcta y que el video sea público.'
      }
    ]
  },
  {
    type: 'image',
    name: 'Bloque de Imagen',
    /* eslint-disable-next-line jsx-a11y/alt-text */
    icon: <Image className="text-green-600" />,
    description: 'Agrega imágenes, diagramas, infografías y otros elementos visuales para enriquecer tu contenido.',
    whenToUse: [
      'Ilustrar conceptos o ideas',
      'Mostrar diagramas y esquemas',
      'Agregar infografías informativas',
      'Incluir capturas de pantalla de ejemplos'
    ],
    steps: [
      {
        title: 'Crear un Bloque de Imagen',
        content: 'Haz clic en "Agregar Imagen" para crear un nuevo bloque visual.',
        tips: ['Las imágenes ayudan a break el texto y mantener el interés']
      },
      {
        title: 'Subir o Enlazar Imagen',
        content: 'Puedes subir una imagen desde tu computadora o proporcionar una URL de una imagen en línea.',
        tips: [
          'Formatos aceptados: JPG, PNG, GIF, WebP',
          'Tamaño recomendado: máximo 2MB',
          'URLs deben ser públicamente accesibles'
        ]
      },
      {
        title: 'Configurar Texto Alternativo',
        content: 'Agrega texto alternativo para mejorar la accesibilidad y ayudar a lectores de pantalla.',
        tips: [
          'Describe brevemente lo que muestra la imagen',
          'Es importante para estudiantes con discapacidades visuales'
        ]
      },
      {
        title: 'Agregar Pie de Foto',
        content: 'Incluye un pie de foto para proporcionar contexto adicional o explicaciones.',
        tips: [
          'Explica la relevancia de la imagen',
          'Puede incluir fuente o créditos',
          'Ayuda a conectar la imagen con el contenido'
        ]
      }
    ],
    bestPractices: [
      'Usa imágenes de alta calidad y buena resolución',
      'Asegúrate de tener derechos para usar las imágenes',
      'Optimiza el tamaño de archivo para carga rápida',
      'Incluye siempre texto alternativo descriptivo',
      'Usa imágenes que aporten valor educativo'
    ],
    examples: [
      'Diagramas explicativos de procesos',
      'Capturas de pantalla de software',
      'Fotografías de ejemplos reales',
      'Infografías con datos importantes',
      'Mapas conceptuales y esquemas'
    ],
    settings: [
      {
        setting: 'URL de la imagen',
        explanation: 'Dirección web de una imagen online, o puedes subir una imagen desde tu computadora.',
        whenToUse: 'Usa URL para imágenes que ya están en internet. Sube archivos para imágenes propias.',
        example: 'URL: https://ejemplo.com/imagen.jpg Subida: Selecciona archivo desde tu computadora.'
      },
      {
        setting: 'Texto alternativo (alt)',
        explanation: 'Descripción de la imagen para personas con discapacidades visuales y lectores de pantalla.',
        whenToUse: 'Siempre agrégalo. Es requerido para accesibilidad y mejora la experiencia de todos los usuarios.',
        example: '"Diagrama que muestra el ciclo del agua con flechas indicando evaporación, condensación y precipitación"'
      },
      {
        setting: 'Pie de foto (caption)',
        explanation: 'Texto que aparece debajo de la imagen para dar contexto o explicación adicional.',
        whenToUse: 'Úsalo para explicar qué muestra la imagen, dar créditos, o conectarla con el contenido.',
        example: '"Figura 1: Proceso de fotosíntesis en las hojas. Fuente: Biology Today, 2023"'
      },
      {
        setting: 'Formatos de imagen aceptados',
        explanation: 'El sistema acepta JPG, PNG, GIF y WebP. Tamaño máximo recomendado: 2MB.',
        whenToUse: 'JPG para fotos, PNG para gráficos con transparencia, GIF para animaciones simples.',
        example: 'JPG: Fotografías. PNG: Logos con fondo transparente. GIF: Animaciones explicativas.'
      },
      {
        setting: 'Subida vs URL externa',
        explanation: 'Subir archivo almacena la imagen en el servidor. URL externa vincula a imagen en otro sitio.',
        whenToUse: 'Sube archivos para mayor control y velocidad. Usa URL para imágenes temporales o de prueba.',
        example: 'Subida: Imagen importante del curso. URL: Imagen de ejemplo que podrías cambiar después.'
      }
    ]
  },
  {
    type: 'quiz',
    name: 'Bloque de Quiz',
    icon: <HelpCircle className="text-orange-600" />,
    description: 'Crea evaluaciones interactivas con múltiples preguntas, opciones de respuesta y retroalimentación automática.',
    whenToUse: [
      'Evaluar comprensión de conceptos',
      'Reforzar aprendizaje clave',
      'Crear puntos de verificación en la lección',
      'Proporcionar práctica interactiva'
    ],
    steps: [
      {
        title: 'Crear un Quiz',
        content: 'Haz clic en "Agregar Quiz" para crear un nuevo bloque de evaluación.',
        tips: ['Los quizzes son excelentes para verificar comprensión']
      },
      {
        title: 'Configurar Información General',
        content: 'Completa el título, descripción e instrucciones del quiz. Configura opciones como reintentos y visualización de resultados.',
        tips: [
          'Instrucciones claras ayudan a los estudiantes',
          'Considera permitir múltiples intentos para aprendizaje',
          'Los resultados inmediatos mejoran la experiencia'
        ]
      },
      {
        title: 'Agregar Preguntas',
        content: 'Haz clic en "Agregar Pregunta" para crear cada pregunta del quiz. Puedes tener tantas preguntas como necesites.',
        tips: [
          'Comienza con preguntas simples y aumenta la dificultad',
          'Varía el tipo de preguntas para mantener el interés'
        ]
      },
      {
        title: 'Configurar Opciones de Respuesta',
        content: 'Para cada pregunta, agrega las opciones de respuesta (A, B, C, D) y marca cuál es la correcta.',
        tips: [
          'Puedes tener de 2 a 6 opciones por pregunta',
          'Haz que todas las opciones sean plausibles',
          'Solo una puede ser marcada como correcta'
        ]
      },
      {
        title: 'Asignar Puntos y Explicaciones',
        content: 'Configura el valor en puntos de cada pregunta y agrega explicaciones para las respuestas correctas.',
        tips: [
          'Los puntos se suman automáticamente',
          'Las explicaciones ayudan al aprendizaje',
          'Considera dar más puntos a preguntas más difíciles'
        ]
      }
    ],
    bestPractices: [
      'Mantén quizzes cortos (máximo 10 preguntas)',
      'Usa lenguaje claro y directo en las preguntas',
      'Proporciona explicaciones útiles para las respuestas',
      'Varía la dificultad de las preguntas',
      'Permite múltiples intentos para fomentar el aprendizaje'
    ],
    examples: [
      'Quiz de comprensión después de una lección teórica',
      'Evaluación rápida de conceptos clave',
      'Quiz de repaso antes de un examen',
      'Verificación de prerrequisitos',
      'Autoevaluación del progreso del estudiante'
    ],
    settings: [
      {
        setting: 'Permitir reintentos (allowRetries)',
        explanation: 'Permite que los estudiantes vuelvan a tomar el quiz múltiples veces.',
        whenToUse: 'Actívalo para quizzes de práctica o cuando el objetivo sea el aprendizaje. Desactívalo para evaluaciones formales.',
        example: 'Activado: Quiz de práctica de matemáticas. Desactivado: Examen final del curso.'
      },
      {
        setting: 'Mostrar resultados (showResults)',
        explanation: 'Muestra al estudiante las respuestas correctas e incorrectas inmediatamente después de completar el quiz.',
        whenToUse: 'Actívalo para reforzar el aprendizaje. Desactívalo si quieres revisar manualmente antes de dar feedback.',
        example: 'Activado: Quiz de autoevaluación. Desactivado: Examen que será calificado por el instructor.'
      },
      {
        setting: 'Preguntas aleatorias (randomizeQuestions)',
        explanation: 'Cambia el orden de las preguntas cada vez que un estudiante toma el quiz.',
        whenToUse: 'Actívalo para prevenir que los estudiantes memoricen el orden. Útil cuando hay múltiples intentos.',
        example: 'Activado: Quiz de repaso con 20 preguntas. Desactivado: Examen que sigue una secuencia lógica específica.'
      },
      {
        setting: 'Respuestas aleatorias (randomizeAnswers)',
        explanation: 'Cambia el orden de las opciones de respuesta (A, B, C, D) para cada pregunta.',
        whenToUse: 'Actívalo para prevenir que los estudiantes compartan patrones de respuestas (como "A, B, A, C").',
        example: 'Activado: Quiz online donde estudiantes pueden comparar respuestas. Desactivado: Quiz impreso donde el orden debe ser consistente.'
      },
      {
        setting: 'Puntos por pregunta',
        explanation: 'Define cuántos puntos vale cada pregunta individual. Los puntos se suman automáticamente.',
        whenToUse: 'Asigna más puntos a preguntas más difíciles o importantes. Usa puntos iguales para preguntas de igual dificultad.',
        example: 'Pregunta básica: 1 punto. Pregunta de análisis: 3 puntos. Pregunta de aplicación: 5 puntos.'
      },
      {
        setting: 'Tipo de pregunta (multiple-choice vs true-false)',
        explanation: 'Múltiple opción permite 2-6 opciones. Verdadero/Falso solo permite dos opciones.',
        whenToUse: 'Usa múltiple opción para conceptos complejos. Usa verdadero/falso para verificar hechos específicos.',
        example: 'Múltiple opción: "¿Cuál es la capital de Francia?" Verdadero/Falso: "París es la capital de Francia."'
      },
      {
        setting: 'Explicación de respuesta',
        explanation: 'Texto que aparece después de responder, explicando por qué la respuesta es correcta.',
        whenToUse: 'Siempre agrégala para reforzar el aprendizaje. Especialmente importante en quizzes educativos.',
        example: '"Correcto. París es la capital de Francia desde 1789, cuando reemplazó a Versalles durante la Revolución Francesa."'
      }
    ]
  },
  {
    type: 'download',
    name: 'Bloque de Archivos',
    icon: <Download className="text-slate-600" />,
    description: 'Permite a los estudiantes descargar recursos adicionales como PDFs, documentos, plantillas y materiales complementarios.',
    whenToUse: [
      'Proporcionar materiales de referencia',
      'Compartir plantillas y formularios',
      'Distribuir lecturas adicionales',
      'Ofrecer recursos complementarios'
    ],
    steps: [
      {
        title: 'Crear un Bloque de Archivos',
        content: 'Haz clic en "Agregar Archivos" para crear una sección de descargas.',
        tips: ['Agrupa archivos relacionados en un solo bloque']
      },
      {
        title: 'Configurar el Bloque',
        content: 'Agrega un título descriptivo y una descripción opcional para explicar qué contienen los archivos.',
        tips: [
          'Usa títulos como "Materiales de Lectura" o "Plantillas"',
          'La descripción ayuda a los estudiantes a entender el propósito'
        ]
      },
      {
        title: 'Subir Archivos',
        content: 'Arrastra archivos al área de carga o haz clic para seleccionarlos. Puedes subir múltiples archivos a la vez.',
        tips: [
          'Formatos aceptados: PDF, DOC, XLS, PPT, imágenes, videos',
          'Tamaño máximo recomendado: 10MB por archivo',
          'Los archivos se almacenan de forma segura'
        ]
      },
      {
        title: 'Agregar Descripciones',
        content: 'Para cada archivo, agrega una descripción que explique su contenido y propósito.',
        tips: [
          'Describe brevemente el contenido del archivo',
          'Indica si es obligatorio o opcional',
          'Menciona cuándo debe usarse'
        ]
      },
      {
        title: 'Configurar Opciones',
        content: 'Habilita la descarga masiva si quieres que los estudiantes puedan descargar todos los archivos en un ZIP.',
        tips: [
          'La descarga masiva es útil para muchos archivos',
          'Considera los requisitos de autenticación según el contenido'
        ]
      }
    ],
    bestPractices: [
      'Organiza archivos por tema o tipo',
      'Usa nombres de archivo descriptivos',
      'Agrega siempre descripciones útiles',
      'Mantén archivos actualizados y relevantes',
      'Considera el tamaño total para la experiencia del usuario'
    ],
    examples: [
      'PDFs con lecturas complementarias',
      'Plantillas de ejercicios para completar',
      'Documentos de referencia técnica',
      'Formularios y guías de estudio',
      'Software o herramientas necesarias'
    ],
    settings: [
      {
        setting: 'Permitir descarga masiva (allowBulkDownload)',
        explanation: 'Crea un botón que permite descargar todos los archivos en un solo archivo ZIP.',
        whenToUse: 'Actívalo cuando tengas muchos archivos relacionados. Desactívalo si quieres que descarguen archivos específicos.',
        example: 'Activado: 15 PDFs de un curso completo. Desactivado: 3 archivos diferentes que no necesariamente van juntos.'
      },
      {
        setting: 'Requiere autenticación (requireAuth)',
        explanation: 'Los estudiantes deben estar logueados para descargar los archivos.',
        whenToUse: 'Actívalo para contenido exclusivo del curso. Desactívalo para recursos públicos.',
        example: 'Activado: Exámenes o material con derechos de autor. Desactivado: Recursos gratuitos o de dominio público.'
      },
      {
        setting: 'Descripción del archivo',
        explanation: 'Texto que explica qué contiene cada archivo y cuándo usarlo.',
        whenToUse: 'Siempre agrégala para que los estudiantes sepan qué están descargando.',
        example: '"Plantilla de ensayo para la tarea final. Completa las secciones marcadas en amarillo."'
      },
      {
        setting: 'Tipos de archivo aceptados',
        explanation: 'El sistema acepta PDFs, documentos de Word/Excel/PowerPoint, imágenes y videos.',
        whenToUse: 'Usa PDFs para lecturas, Word para plantillas editables, Excel para hojas de cálculo.',
        example: 'PDF: Artículo para leer. DOCX: Plantilla de ensayo. XLSX: Hoja de ejercicios matemáticos.'
      }
    ]
  },
  {
    type: 'external-links',
    name: 'Bloque de Enlaces',
    icon: <ExternalLink className="text-red-600" />,
    description: 'Organiza y comparte enlaces a recursos externos, sitios web, artículos y herramientas online relevantes.',
    whenToUse: [
      'Compartir recursos web adicionales',
      'Enlazar a herramientas online',
      'Referenciar artículos y estudios',
      'Conectar con sitios complementarios'
    ],
    steps: [
      {
        title: 'Crear un Bloque de Enlaces',
        content: 'Haz clic en "Agregar Enlaces" para crear una colección de recursos web.',
        tips: ['Agrupa enlaces relacionados temáticamente']
      },
      {
        title: 'Configurar el Bloque',
        content: 'Agrega un título y descripción para la colección de enlaces. Configura opciones de visualización.',
        tips: [
          'Usa títulos descriptivos como "Recursos Adicionales"',
          'Las opciones de visualización mejoran la presentación'
        ]
      },
      {
        title: 'Agregar Enlaces',
        content: 'Haz clic en "Agregar Enlace" para cada recurso web que quieras incluir.',
        tips: [
          'Puedes agregar tantos enlaces como necesites',
          'Cada enlace se puede configurar individualmente'
        ]
      },
      {
        title: 'Configurar Cada Enlace',
        content: 'Para cada enlace, completa la URL, título, descripción y categoría. Configura si debe abrir en nueva pestaña.',
        tips: [
          'URLs deben incluir http:// o https://',
          'Títulos descriptivos ayudan a la navegación',
          'Las categorías permiten organizar enlaces'
        ]
      },
      {
        title: 'Organizar por Categorías',
        content: 'Usa categorías para agrupar enlaces similares. Habilita "Agrupar por categoría" para mejor organización.',
        tips: [
          'Categorías como "Videos", "Artículos", "Herramientas"',
          'La autocompletación sugiere categorías existentes'
        ]
      },
      {
        title: 'Vista Previa de Enlaces',
        content: 'El sistema genera automáticamente vistas previas cuando ingresas URLs válidas.',
        tips: [
          'Las vistas previas mejoran la experiencia visual',
          'Puedes agregar imágenes personalizadas si es necesario'
        ]
      }
    ],
    bestPractices: [
      'Verifica que todos los enlaces funcionen correctamente',
      'Usa títulos descriptivos y únicos',
      'Organiza enlaces por categorías lógicas',
      'Agrega descripciones que expliquen el valor del recurso',
      'Revisa enlaces periódicamente para mantenerlos actualizados'
    ],
    examples: [
      'Artículos académicos relacionados al tema',
      'Videos complementarios de YouTube',
      'Herramientas online para práctica',
      'Sitios web de referencia profesional',
      'Simuladores y aplicaciones interactivas'
    ],
    settings: [
      {
        setting: 'Agrupar por categoría (groupByCategory)',
        explanation: 'Organiza automáticamente los enlaces en secciones según su categoría.',
        whenToUse: 'Actívalo cuando tengas enlaces de diferentes tipos. Desactívalo para una lista simple.',
        example: 'Activado: Categorías como "Videos", "Artículos", "Herramientas". Desactivado: Lista mixta de todos los enlaces.'
      },
      {
        setting: 'Mostrar miniaturas (showThumbnails)',
        explanation: 'Muestra imágenes pequeñas junto a cada enlace para identificación visual.',
        whenToUse: 'Actívalo para hacer los enlaces más atractivos visualmente. Desactívalo para una vista más compacta.',
        example: 'Activado: Enlaces a videos con sus thumbnails. Desactivado: Lista simple de texto para carga más rápida.'
      },
      {
        setting: 'Mostrar descripciones (showDescriptions)',
        explanation: 'Muestra el texto descriptivo que agregaste para cada enlace.',
        whenToUse: 'Actívalo para dar contexto sobre cada enlace. Desactívalo para una vista más limpia.',
        example: 'Activado: "Artículo que explica los conceptos básicos...". Desactivado: Solo el título del enlace.'
      },
      {
        setting: 'Abrir en nueva pestaña (openInNewTab)',
        explanation: 'El enlace se abre en una nueva ventana, manteniendo el curso abierto.',
        whenToUse: 'Actívalo para enlaces externos. Desactívalo para navegación dentro del mismo sitio.',
        example: 'Activado: Enlaces a YouTube, Wikipedia. Desactivado: Enlaces a otras lecciones del mismo curso.'
      },
      {
        setting: 'Estado del enlace (isActive)',
        explanation: 'Controla si el enlace está visible y clickeable para los estudiantes.',
        whenToUse: 'Desactívalo temporalmente si el enlace está roto o ya no es relevante.',
        example: 'Activado: Enlace funcional a un artículo actual. Desactivado: Enlace a un sitio web que ya no existe.'
      },
      {
        setting: 'Categoría del enlace',
        explanation: 'Etiqueta que agrupa enlaces similares. Se usa para organización.',
        whenToUse: 'Usa categorías descriptivas como "Videos", "Lecturas", "Herramientas", "Ejercicios".',
        example: 'Categoría "Videos": Enlaces a YouTube. Categoría "Lecturas": Enlaces a artículos. Categoría "Herramientas": Enlaces a software.'
      },
      {
        setting: 'URL de miniatura (thumbnail)',
        explanation: 'Imagen personalizada que aparece junto al enlace.',
        whenToUse: 'Agrégala si el sitio no tiene una imagen automática o quieres una imagen específica.',
        example: 'URL a una imagen que represente el contenido del enlace, como el logo de la empresa o una captura de pantalla.'
      }
    ]
  }
];

interface BlockTutorialProps {
  isOpen: boolean;
  onClose: () => void;
  initialBlockType?: string;
}

const BlockTutorial: React.FC<BlockTutorialProps> = ({ isOpen, onClose, initialBlockType }) => {
  const [selectedBlock, setSelectedBlock] = useState<string>(initialBlockType || 'text');
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const currentTutorial = tutorialData.find(t => t.type === selectedBlock);
  if (!currentTutorial) return null;

  const nextStep = () => {
    if (currentStep < currentTutorial.steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const selectBlock = (blockType: string) => {
    setSelectedBlock(blockType);
    setCurrentStep(0);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex">
        {/* Sidebar */}
        <div className="w-1/3 bg-gray-50 border-r border-gray-200 overflow-y-auto">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-[#0a0a0a] flex items-center gap-2">
              <BookOpen size={20} />
              Tutorial de Bloques
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Aprende a usar cada tipo de bloque
            </p>
          </div>
          
          <div className="p-4">
            {tutorialData.map((block) => (
              <button
                key={block.type}
                onClick={() => selectBlock(block.type)}
                className={`w-full text-left p-3 rounded-lg mb-2 transition-colors ${
                  selectedBlock === block.type
                    ? 'bg-[#0a0a0a] text-white'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={selectedBlock === block.type ? 'text-white' : ''}>
                    {block.icon}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{block.name}</div>
                    <div className={`text-xs ${
                      selectedBlock === block.type ? 'text-gray-200' : 'text-gray-500'
                    }`}>
                      {block.steps.length} pasos
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {currentTutorial.icon}
              <div>
                <h1 className="text-xl font-bold text-[#0a0a0a]">{currentTutorial.name}</h1>
                <p className="text-sm text-gray-600">{currentTutorial.description}</p>
              </div>
            </div>
            <Button variant="ghost" onClick={onClose}>
              <X size={20} />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* When to Use */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Users size={18} className="text-[#0a0a0a]" />
                ¿Cuándo usar este bloque?
              </h3>
              <ul className="space-y-1">
                {currentTutorial.whenToUse.map((use, index) => (
                  <li key={index} className="flex items-start gap-2 text-gray-700">
                    <span className="w-1.5 h-1.5 bg-[#fbbf24] rounded-full mt-2 flex-shrink-0"></span>
                    {use}
                  </li>
                ))}
              </ul>
            </div>

            {/* Step-by-Step Guide */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Play size={18} className="text-[#0a0a0a]" />
                Guía Paso a Paso
              </h3>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-600">
                    Paso {currentStep + 1} de {currentTutorial.steps.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={prevStep}
                      disabled={currentStep === 0}
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={nextStep}
                      disabled={currentStep === currentTutorial.steps.length - 1}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                  <div
                    className="bg-[#0a0a0a] h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((currentStep + 1) / currentTutorial.steps.length) * 100}%` }}
                  ></div>
                </div>

                <h4 className="font-semibold text-gray-800 mb-2">
                  {currentTutorial.steps[currentStep].title}
                </h4>
                <p className="text-gray-700 mb-4">
                  {currentTutorial.steps[currentStep].content}
                </p>

                {currentTutorial.steps[currentStep].tips && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <h5 className="font-medium text-blue-800 text-sm mb-2">💡 Consejos:</h5>
                    <ul className="space-y-1">
                      {currentTutorial.steps[currentStep].tips!.map((tip, index) => (
                        <li key={index} className="text-sm text-blue-700 flex items-start gap-2">
                          <span className="w-1 h-1 bg-blue-500 rounded-full mt-2 flex-shrink-0"></span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Best Practices */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Settings size={18} className="text-[#0a0a0a]" />
                Mejores Prácticas
              </h3>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <ul className="space-y-2">
                  {currentTutorial.bestPractices.map((practice, index) => (
                    <li key={index} className="flex items-start gap-2 text-green-800">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 flex-shrink-0"></span>
                      {practice}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Settings Explanations */}
            {currentTutorial.settings && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Settings size={18} className="text-[#0a0a0a]" />
                  Explicación de Configuraciones
                </h3>
                <div className="space-y-4">
                  {currentTutorial.settings.map((setting, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 hover:border-[#0a0a0a] transition-colors">
                      <h4 className="font-semibold text-[#0a0a0a] mb-2">{setting.setting}</h4>
                      <p className="text-gray-700 mb-3">{setting.explanation}</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-blue-50 p-3 rounded-lg">
                          <h5 className="font-medium text-blue-800 text-sm mb-1">🤔 ¿Cuándo usarlo?</h5>
                          <p className="text-blue-700 text-sm">{setting.whenToUse}</p>
                        </div>
                        <div className="bg-green-50 p-3 rounded-lg">
                          <h5 className="font-medium text-green-800 text-sm mb-1">💡 Ejemplo práctico</h5>
                          <p className="text-green-700 text-sm">{setting.example}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Examples */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Eye size={18} className="text-[#0a0a0a]" />
                Ejemplos de Uso
              </h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <ul className="space-y-2">
                  {currentTutorial.examples.map((example, index) => (
                    <li key={index} className="flex items-start gap-2 text-yellow-800">
                      <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></span>
                      {example}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Tutorial interactivo • Genera
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => selectBlock(tutorialData[(tutorialData.findIndex(t => t.type === selectedBlock) - 1 + tutorialData.length) % tutorialData.length].type)}
              >
                Bloque Anterior
              </Button>
              <Button
                onClick={() => selectBlock(tutorialData[(tutorialData.findIndex(t => t.type === selectedBlock) + 1) % tutorialData.length].type)}
                className="bg-[#0a0a0a] hover:bg-[#fbbf24] hover:text-[#0a0a0a] text-white"
              >
                Siguiente Bloque
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockTutorial;