/**
 * Team of Fundación Nueva Educación as shown on /nosotros and /equipo.
 * Names, roles, photos and biographies are carried over unchanged from the
 * previous public site; only the presentation moved.
 */
export interface TeamMember {
  name: string;
  role: string;
  image: string;
  description?: string;
}

export const TEAM_MEMBERS: Record<string, TeamMember> = {
  // Equipo FNE
  'arnoldo-cisternas': {
    name: 'Arnoldo Cisternas',
    role: 'Director del Programa y Asesor Directivo',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Arnoldo%20Cisternas.png',
    description: 'Psicólogo dedicado al diseño y gestión de procesos de evolución cultural. Es asesor directivo para el fortalecimiento de lideres y equipos en organizaciones que necesitan transformar su cultura organizacional. Es fundador del Instituto Relacional IR (Barcelona y Chile) y presidente de la Fundación Nueva Educación. Ha desarrollado el Modelo de Migración Cultural Hacia la Nueva Educación y asesora procesos de cambio cultural en diversas entidades educativas en Chile. Desde el IR en BCN ha desarrollado el Enfoque Relacional, el Modelo de Evolución Relacional, y diversos Programas de Educación Relacional. Es coautor del libro "Educación Relacional: 10 Claves para una Pedagogía del Reconocimiento" (FSM 2018) y de "Relaciones Poderosas: Ver y Ser Vistos" (Kairos 2014). Es profesor de postgrado, relator internacional y consultor en el mundo de la empresa en España y América Latina.'
  },
  'joan-quintana': {
    name: 'Joan Quintana',
    role: 'Psicólogo y Director Instituto Relacional',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Joan%20Quintana.png',
    description: 'Psicólogo especializado en Comportamiento y Desarrollo Organizacional y en Coaching Relacional, aplicándolo en las organizaciones públicas y privadas, en la educación y en los servicios de salud. Co- fundador y director del Instituto Relacional. En el ámbito educativo, ha trabajado en la formación de profesores en competencias relacionales y es director del programa de Dirección Avanzada en RRHH en ESADE Business School de Barcelona. Ha desarrollado el Enfoque Relacional en el cual se fundamenta el modelo de Coaching Relacional y los métodos de desarrollo del Instituto Relacional en sus distintos ámbitos de intervención: organizaciones, educación, salud y sociedad. En el ámbito editorial, es co-autor de "Anticípate", un cuaderno de bitácora para navegar en procesos de cambio en las organizaciones, y de "Relaciones Poderosas", en el cual se exponen las bases del enfoque relacional.'
  },
  'mora-del-fresno': {
    name: 'Mora Del Fresno',
    role: 'Directora de Operaciones',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Mora%20Del%20Fresno.png',
    description: 'Dirige las operaciones de la Fundación en Barcelona y Chile. Es licenciada y profesora en Ciencias de la Educación (Universidad de San Andrés, Argentina), Máster en Neuroeducación (Universitat de Barcelona, España). Es especialista en gestión y liderazgo pedagógico, así como en Educación Relacional, ya que actualmente es responsable de la Unidad de Educación del Instituto Relacional en Barcelona. Ha trabajado como profesora y tutora escolar en nivel secundario. Colabora en diversos proyectos de acompañamiento de escuelas en procesos de transformación pedagógica en Argentina, Chile, España y Portugal.'
  },
  'gabriela-naranjo': {
    name: 'Gabriela Naranjo',
    role: 'Directora de la FNE – IR Chile',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Gabriela%20Naranjo.jpg',
    description: 'Es la directora de la Fundación Nueva Educación, conduce el equipo de trabajo en Chile para alcanzar los objetivos estratégicos de la FNE. Es psicóloga clínica y organizacional, es Máster en Dirección de Personas por la Universidad Ramón Llull en Barcelona, es Psicóloga Clínica con formación de postgrado en enfoque  neoraichiano y biosíntesis. Ha conducido y dado forma a la orgánica de la FNE en Chile, creó la ATE – FNE reconocida por el MINEDUC en Chile y cada día trabaja para la consolidación institucional y la viabilidad en el mediano y largo plazo del proyecto FNE. Su pasión por el mundo interior de las personas le ha llevado a trabajar día a día para que la educación deje de estar de espaldas al mundo interior de las niñas y los niños. Trabaja para que la educación esté centrada en la vida del estudiante en su experiencia y la construcción de su identidad.'
  },
  'brent-curtis': {
    name: 'Brent Curtis',
    role: 'Director de Innovación y Desarrollo',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Brent%20Curtis.png',
    description: 'Brent es Teólogo y está a cargo del diseño y la elaboración de los instrumentos tecnológicos que usamos para implementar nuestros procesos de cambio. Lidera la estrategia de innovación de la FNE, desarrollando plataformas digitales, herramientas de evaluación y sistemas de gestión del aprendizaje que potencian la transformación educativa. Su visión integra tecnología y pedagogía para crear soluciones que faciliten la implementación del aprendizaje centrado en el estudiante. Posee un profundo interés por transformar la educación y favorecer la emergencia de un nicho de escuelas de vanguardia en Chile que pueda movilizar la transformación de todo el sistema educativo.'
  },
  
  // Equipo Internacional
  'coral-regi': {
    name: 'Coral Regí',
    role: 'Ex-directora de Escola Virolai',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Coral%20Regi.png',
    description: 'Ha sido directora de la Escuela Virolai y actualmente es asesora internacional para la impulsar el desarrollo de escuelas de vanguardia en España y América Latina. Es bióloga de formación y, tal y como ella manifiesta, educadora por vocación. Es miembro del comité científico del proyecto Educación Mañana y de la Junta de la Sociedad Catalana de Pedagogía. Forma parte del Consejo Escolar de Cataluña como persona de prestigio desde el año 2014. Colabora con diferentes Fundaciones Educativas como la Fundación Bofill, la Fundación Carulla y es miembro del Comité Internacional de la Fundación Nueva Educación.'
  },
  'anna-comas': {
    name: 'Anna Comas',
    role: 'Ex-directora Escola La Maquinista',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Anna%20Comas.png',
    description: 'Fue la directora de la escuela de La Maquinista un proyecto educativo innovador que se ha transformado en un referente de cambio. Formó parte de los centros impulsores del programa de Escola Nova21 y posteriormente del grupo de los Futuros de la Educación vinculado a CATESCO (UNESCO Catalunya). Licenciada en Filosofía y Ciencias de la Educación. Ha colaborado con instituciones públicas, entre las que destaco la UB, UAB, Diputación y Departamento de Educación de Catalunya, desde la participación en proyectos de investigación-acción al acompañamiento, formación y asesoría de escuelas. Actualmente participa como mentora en el Programa de Mejora y Transformación (PMT) de la Consejería de Educación de las Islas Baleares.'
  },
  'sandra-entrena': {
    name: 'Sandra Entrena',
    role: 'Directora Escola Virolai',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Sandra%20Entrena%202.jpeg',
    description: 'Directora de la Escuela Virolai, una de las escuelas líderes del cambio hacia el nuevo paradigma educativo en Europa. Es una educadora de larga trayectoria como formadora de las nuevas generaciones de profesores en Barcelona. Ha sido uno de los pilares formativos del proyecto Escola Nova 21 y ha participado diseñando y ejecutando programas de formación en metodologías activas para el aprendizaje, evaluación formativa y formadora, innovación y liderazgo de procesos de cambio. El 2017 lideró uno de los proyectos finalistas en los Wise Awards, instancia británica que reconoce a proyectos innovadores que involucran y empoderan a mujeres en el ámbito de las ciencias y la tecnología en el Reino Unido y el resto de Europa.'
  },
  'pepe-menendez': {
    name: 'Pepe Menéndez',
    role: 'Ex-Director Adjunto Jesuitas Educació',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Pepe%20Menendez.jpg',
    description: 'Fue director adjunto de Jesuitas Educació y ha promovido la experiencia del proyecto Horizonte 2020, para la transformación profunda de la educación de las escuelas Jesuitas de Catalunya. El proyecto Horizonte 2020, revolucionó la enseñanza en la red Compañía de Jesús en el mundo. En abril del 2024 ha lanzado su segundo libro editado por Siglo 21, "Educar para la Vida" y en mayo de 2020 lanzó su primer libro llamado "Escuelas que valgan la pena", en el que recoge experiencias para liderar procesos de cambio en las escuelas. En Chile, ha participado en seminarios sobre Nueva Educación, y en los programas de Pasantías a escuelas de España que están implementando programas de aprendizaje centrados en el estudiante.'
  },
  'sergi-del-moral': {
    name: 'Sergi Del Moral',
    role: 'Director Escola-Institut Les Vinyes',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Sergi%20Del%20Moral.jpg',
    description: 'Licenciado en matemáticas y, desde el 2024, director del Institut-Escola Les Vinyes (Castellbisbal), un centro deliberadamente innovador cuya trayectoria ha sido reconocida por el propio Departament d\'Educació, ha recibido los premios educativos catalanes más relevantes (Premi Baldiri i Reixach, Premi Educació del Cercle d\'Economia) y formó parte como centro impulsor de la alianza Escola Nova 21. Ha sido profesor de didáctica en la Facultad de Matemáticas de la Universitat de Barcelona y del máster de profesorado de secundaria en la especialidad de Matemáticas. Formó parte del CREAMAT, un centro de recursos para el profesorado del ámbito matemático, y fuí el responsable de innovación del Servei d\'Innovació i Recerca Educativa. También fui profesor de matemáticas en el Institut Can Mas (Ripollet). Ha participado dando numerosas formaciones y conferencias, la mayoría sobre aprendizaje basado en proyectos, personalización del aprendizaje, liderazgo, gestión del cambio y didáctica de las matemáticas.'
  },
  'betlem-cuesta': {
    name: 'Betlem Cuesta',
    role: 'Jefa de Estudios Institut Les Vinyes',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Betlem%20Cuesta.jpg',
    description: 'Es coordinadora pedagógica del Institut Escola Les Vinyes, un centro deliberadamente innovador reconocido por el Departament d\'Educació, ha recibido los premios educativos catalanes más relevantes y formó parte de la alianza Escola Nova 21, es parte del Forum "Futurs de l\'educació" (CATESCO) que aglutina centros y personas con la intención de contribuir al debate sobre los futuros de la educación (UNESCO). Es profesora de secundaria, Licenciada en Filosofía, es Máster en Estudios Feministas y de las mujeres por la Universidad de Barcelona y Máster en Agentes, políticas y estrategias de Cooperación al Desarrollo y Globalización por la Universidad del País Vasco, Centro Hegoa. Participó en proyectos de cooperación y desarrollo comunitario en Kosovo y en Rwanda.'
  },
  'jordi-mussons': {
    name: 'Jordi Mussons',
    role: 'Director Escola Sadako',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Jordi%20Mussons.png',
    description: 'Jordi es maestro y director de la escuela Sadako de Barcelona, institución referente en innovación educativa a nivel internacional. Su tenacidad, perseverancia y compromiso con una transformación educativa que promueva una escuela de oportunidades para todo el mundo, lo han convertido en una personalidad muy relevante de la educación en nuestro país. Estudió Biología y encontró́ en el escultismo la clave para educar desde la responsabilidad y el compromiso sostenible y social, cualidades que ha intentado trasladar al proyecto educativo que lidera desde 2006. Desde hace unos años forma parte de la junta directiva de la AEC (Agrupació Escolar Catalana).'
  },
  
  // Nuevos miembros
  'marcelo-ruiz': {
    name: 'Marcelo Ruiz',
    role: 'Director Centro Los Pellines',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/marcelo-ruiz.png',
    description: 'Licenciado en Educación con mención en Educación Física y Diplomado en Habilidades Directivas. Fundador y Director de Los Pellines, un centro de educación relacional al aire libre con más de 30 años de trayectoria, especializado en la formación de docentes y estudiantes en entornos naturales. Instructor de montaña con experiencia en seguridad y rescate. Aporta su vasta experiencia en educación al aire libre y metodologías activas, integrando el aprendizaje experiencial con el desarrollo personal y profesional de educadores y estudiantes.'
  },
  'ignacio-pavez': {
    name: 'Ignacio Pavéz',
    role: 'Director de Investigación',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Ignacio%20Pavez.JPG',
    description: 'PhD en Comportamiento Organizacional por Case Western Reserve University (USA) e Ingeniero Civil de la Pontificia Universidad Católica de Chile. Profesor del Departamento de Administración de la Facultad de Economía y Negocios (FEN) de la Universidad de Chile. Su investigación se centra en Desarrollo y Cambio Organizacional, Sostenibilidad Corporativa, Estudios Organizacionales Positivos y Equipos en Organizaciones. Reconocido por su enfoque interdisciplinario y su compromiso con el impacto social y la sostenibilidad empresarial. Experto en desarrollo organizacional dialógico, gestión del cambio y desarrollo de equipos de alto rendimiento. En el ámbito educativo, se especializa en procesos de transformación cultural hacia modelos de aprendizaje centrados en el estudiante, integrando metodologías experienciales y basadas en proyectos. Miembro del Steering Committee del World Positive Education Accelerator (WPEA) y consultor internacional en transformación educativa.'
  },
  'marcela-molina': {
    name: 'Marcela Molina',
    role: 'Investigadora',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Marcela%20Molina.jpeg',
    description: 'Candidata a Doctora y Magíster en Economía de Negocios de la Universidad del Desarrollo. Socióloga de la Pontificia Universidad Católica de Chile. Su investigación doctoral se enfoca en la medición de impactos económicos y sociales de los procesos de transformación educativa en colegios que están en procesos de cambio cultural hacia la Nueva Educación. Combina su formación sociológica con herramientas de análisis económico para evaluar los cambios sistémicos que ocurren en las comunidades educativas durante su transición hacia modelos pedagógicos centrados en el estudiante. Su enfoque interdisciplinario aporta una perspectiva única al análisis costo-beneficio de las intervenciones educativas y al desarrollo de métricas de impacto social. Su investigación contribuye a generar evidencia empírica sobre la efectividad y sostenibilidad de las intervenciones de la FNE, desarrollando instrumentos de evaluación que permiten medir tanto el progreso pedagógico como el retorno social de la inversión en transformación educativa.'
  },
  'andres-bustamante': {
    name: 'Andrés Bustamante',
    role: 'Consultor',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Andres%20Bustamante.png',
    description: 'Psicólogo Social y Coach relacional especializado en habilidades relacionales y gestión de equipos. Fundador de www.cruzadasur.cl, con más de 15 años de experiencia en consultoría organizacional, desarrollo de liderazgo y facilitación de procesos de cambio cultural. Es consultor del Programa Nueva Educación residente en la Región de Aysén desde 2018, colaborador académico del Instituto Relacional (Barcelona-Santiago), y Director Ejecutivo de Corporación Patagonia Viva. Combina su expertise en coaching organizacional con una profunda comprensión de las dinámicas relacionales en contextos educativos, apoyando procesos de transformación desde la identidad personal y el fortalecimiento de equipos. Presidente de la ONG Waka Patagonia, impulsa programas deportivos y sociales como instrumentos de desarrollo de habilidades para niños y jóvenes.'
  },
  'joaquin-aguirre': {
    name: 'Joaquín Aguirre',
    role: 'Consultor',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Joaquin%20Aguirre.jpeg',
    description: 'Doctor en Ciencias de la Educación con 54 años de experiencia en el Ministerio de Educación como Supervisor Técnico Pedagógico. Especializado en Diseño Curricular y Evaluación Educativa, ha asesorado estratégicamente a equipos de gestión en instituciones educativas públicas y privadas, enfocándose en la mejora de procesos y prácticas pedagógicas. Licenciado en Educación con distinción máxima por la Universidad Metropolitana de Ciencias de la Educación, posee formación de postgrado en Investigación Educacional y Folklore en la Educación. Académico de la Universidad de Chile (1971-1981) y evaluador de proyectos culturales para el Consejo Nacional de la Cultura. Líder empático y flexible, aporta su experticia en liderazgo pedagógico, gestión del cambio e innovación educativa, orientando a directivos en la aplicación de políticas educativas y normativas vigentes.'
  },
  
  // Asesores Técnicos que necesitamos mantener
  'abraham-de-la-fuente': {
    name: 'Abraham de la Fuente',
    role: 'Director Adjunto Institut Angeleta Ferrer',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Abraham%20De%20la%20Fuente.jpeg',
    description: 'Doctor en Didáctica de las Matemáticas e investigador sobre la formación del profesorado. Es director adjunto de investigación educativa en el Institut Angeleta Ferrer, donde impulsa líneas de innovación pedagógica y evaluación formativa. Profesor asociado en la UAB desde 2014, forma a futuros docentes en el Grado de Educación Primaria y el Máster de Formación del Profesorado. Con más de 15 años de experiencia como profesor de matemáticas en secundaria y bachillerato, ha trabajado en centros de referencia como Saint Paul\'s School y Oak House School. Es miembro del equipo impulsor de los Betacamps y Edcamps en Catalunya, promoviendo espacios de formación docente colaborativa y horizontal.'
  },
  'ana-vicalvaro': {
    name: 'Ana Vicálvaro',
    role: 'Directora Escola Octavio Paz',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Ana%20Vicalvaro.jpeg',
    description: 'Directora de la Escola Octavio Paz de Barcelona, una escuela pública emblemática del barrio de Navas que lidera procesos de transformación educativa. Graduada en Educación Infantil y Primaria con especialización en Lengua Inglesa por la Universidad de Barcelona y UNIR. Desde 2017 es profesora de inglés en centros públicos de Catalunya, donde ha desarrollado metodologías innovadoras para la enseñanza de lenguas extranjeras. Su liderazgo se caracteriza por promover una educación inclusiva y participativa, trabajando estrechamente con las familias y la comunidad educativa para crear espacios de aprendizaje que fomenten el desarrollo integral del alumnado.'
  },
  'raul-martinez': {
    name: 'Raúl Martínez',
    role: 'Director Escola La Maquinista',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Raul%20Martinez.jpg',
    description: 'Director de la Escola La Maquinista de Barcelona desde 2020, donde lidera procesos de innovación educativa centrados en el aprendizaje del alumnado. Graduado como maestro en Lengua Extranjera por la Universidad de Barcelona, es un firme defensor de la escuela pública de calidad. Especialista en metodologías AICLE (Aprendizaje Integrado de Contenidos y Lenguas Extranjeras) y enfoques globalizados que sitúan al niño en el centro del proceso educativo. Con amplia experiencia en diversos centros públicos de Barcelona como Vila Olímpica y Baró de Viver, combina su pasión por la educación con su faceta artística como músico profesional, aportando una visión creativa e integral al proyecto educativo.'
  },
  'jorge-parra': {
    name: 'Jorge Parra',
    role: 'Formador Centro Los Pellines',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Jorge%20Parra.png',
    description: 'Profesor de Educación Física y Magíster en Educación. Miembro del equipo de formación y gestión en el Centro de Experiencias de Aprendizaje Los Pellines, con más de una década de experiencia en diseño y facilitación de actividades de aprendizaje al aire libre. Ha sido relator en talleres de habilidades relacionales y formación de facilitadores. Se enfoca en la planificación y ejecución de actividades experienciales y colaborativas, utilizando su experiencia en metodologías de aprendizaje relacional y en contextos al aire libre.'
  },
  'juan-jose-flores': {
    name: 'Juan José Flores',
    role: 'Formador Centro Los Pellines',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Juanjo%20Flores.png',
    description: 'Profesor de Educación Física y Salud, Licenciado en Educación, actualmente cursando el Magíster en Ciencias de la Educación en la Universidad Católica de la Santísima Concepción. Apasionado por la educación y, en especial, por la implementación de metodologías relacionales que promuevan el aprendizaje significativo. Miembro del cuerpo docente del Centro de Educación Relacional al Aire Libre Los Pellines, participando en el diseño, dirección y ejecución de programas educativos dirigidos a escuelas y colegios de distintas regiones de Chile. Formado en Educación Relacional, con pasantías en Barcelona bajo la formación de la Fundación Nueva Educación, colaborando posteriormente con esta institución en la capacitación docente y en el desarrollo de experiencias de aprendizaje basadas en el diseño experiencial. Experiencia en contextos educativos diversos, incluyendo la docencia en talleres de Juegos y Habilidades Sociales, así como la implementación de programas y capacitaciones en colegios a lo largo del país.'
  },
  'carlo-de-britos': {
    name: 'Carol de Britos',
    role: 'Jefa de Estudios Primaria Virolai',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Carol%20de%20Britos.png',
    description: 'Es profesora de Primaria en Escola Virolai, donde además he sido coordinadora pedagógica, y actualmente ejerce de Jefa de Estudios de la etapa. Su  ámbito es el de la ciencia, ya que además del Grado de Educación Primaria hizo algunos cursos de la licenciatura de Biología. Ha formado parte de diferentes proyectos conjuntos con universidades nacionales e internacionales, además de ser profesora adjunta de la UAB en el Grado de Ed. Primaria en lengua inglesa. Durante más de 10 años, ha formado a otros profesores en metodología CLIL, haciendo asesoramientos a centros y formaciones acreditadas por la Generalitat de Catalunya. Ha sido conferencista en ITWorldEdu, WebquestCat, STEAMconf... y he participado en la redacción de artículos en revistas como Guix y libros como Diseño y aplicación de la Flipped Classroom (Ed. Graó).'
  },
  'marta-cardenas': {
    name: 'Marta Cárdenas',
    role: 'Coordinadora Educación Infantil Virolai',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Marta%20Cardenas.jpg',
    description: 'Es coordinadora de la etapa de Educación Infantil en Virolai Reina Elisenda. Es educadora especializada en el trabajo con niños y niñas con necesidades educativas especiales, y cuenta con una sólida experiencia en el acompañamiento de la primera infancia. A lo largo de su trayectoria, ha impulsado propuestas pedagógicas inclusivas, trabajando estrechamente con las familias y los equipos docentes para garantizar una atención personalizada y respetuosa con los ritmos de cada niño.'
  },
  'maite-pino': {
    name: 'Maite Pino',
    role: 'Coordinadora Escola Virolai Reina Elisenda',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Maite%20Pino.jpg',
    description: 'Es coordinadora de la Escola Virolai Reina Elisenda y maestra. Se formó como Maestra de Educación Infantil en la UAB y ha trabajado en distintos centros públicos y concertados, asumiendo tutorías en varios cursos y etapas. Ha sido educadora de apoyo en secundaria, coordinadora de comedor y monitora de acogida, y durante seis años fue cap d\'agrupament en los Minyons Escoltes i Guies. Tiene formación en inglés por la EOI Drassanes y en dirección de actividades de ocio por la Fundació Pere Tarrés. Actualmente impulsa el uso pedagógico de herramientas digitales en su centro.'
  },
  'claudia-lopez': {
    name: 'Claudia López de Lamadrid',
    role: 'Coordinadora Virolai Petit',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Claudia%20Lopez%20de%20Lamadrid%20%20.jpg',
    description: 'Es coordinadora y responsable pedagógica de la escuela infantil de Virolai (Virolai Petit), donde trabaja desde 2003. Ha sido maestra de inglés y tutora en Educación Infantil y Primaria, acompañando a diversos grupos a lo largo de su trayectoria. Es licenciada en Psicopedagogía por la Universitat Oberta de Catalunya y está especializada en la primera infancia y en el trabajo en equipo con las familias y educadoras.'
  },
  'enrique-vergara': {
    name: 'Enrique Vergara',
    role: 'Coordinador Pedagógico Escola Virolai',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Enrique%20Vergara%20.jpg',
    description: 'Es educador y coordinador pedagógico en la Escola Virolai, donde forma parte del equipo desde 2018. Licenciado en Ciencias Ambientales por la UAB, ha combinado su trayectoria educativa con experiencia en el ámbito ambiental y de inspección técnica. Actualmente es profesor en el Grado de Educación Infantil y en el Máster de Profesorado de Secundaria (especialidad Biología y Geología) en la Universitat de Barcelona. También ha sido director académico de programas de medio ambiente en IUSC. Su recorrido profesional refleja un fuerte compromiso con la sostenibilidad, la innovación educativa y el acompañamiento a jóvenes y docentes.'
  },
  'laia-garces': {
    name: 'Laia Garcés',
    role: 'Coordinadora Primaria Escuela Sadako',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Laila%20Garces.jpg',
    description: 'Es coordinadora de la etapa de primaria en la Escuela Sadako de Barcelona, donde también ha sido tutora, es especialista de inglés y ha formado parte del equipo psicopedagógico. Forma parte del equipo directivo de Sadako, una escuela Inovadora y Changemaker, comprometida con el mundo que nos rodea, donde los niños y niñas tienen la oportunidad de aprender y ser felices, y de desarrollar una actitud para ser agentes de cambio. Es graduada en Educación Primaria por la Universidad de Barcelona con mención en lengua inglesa, ha trabajado en una escuela en Londres, durante un año, y así conocer más de cerca otro sistema educativo.'
  },
  'marta-ortega': {
    name: 'Marta Ortega',
    role: 'Coordinadora Primaria Escuela Sadako',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Marta%20Ortega.jpg',
    description: 'Es coordinadora de la etapa de primaria en la Escuela Sadako de Barcelona, donde también ha sido tutora, es especialista de inglés y ha formado parte del equipo psicopedagógico. Forma parte del equipo directivo de Sadako, una escuela Inovadora y Changemaker, comprometida con el mundo que nos rodea, donde los niños y niñas tienen la oportunidad de aprender y ser felices, y de desarrollar una actitud para ser agentes de cambio. Es graduada en Educación Primaria por la Universidad de Barcelona con mención en lengua inglesa, ha trabajado en una escuela en Londres, durante un año, y así conocer más de cerca otro sistema educativo.'
  },
  'cristina-montes': {
    name: 'Cristina Montes',
    role: 'Profesora Escuela La Maquinista',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Cristina%20Montes.png',
    description: 'Profesora y tutora de primaria en la Escuela La Maquinista en Barcelona desde el año 2016. Es graduada en Magisterio de Educación Física, en Magisterio de Educación Infantil y Máster en Psicopedagogía. En la escuela, participa como miembro del grupo motor en el proyecto FAIG, impulsado por el CESIRE, un soporte a la innovación del Departamento de Educación de Catalunya. También posee formación por medio de la participación en proyectos y seminarios tales como: Cultura de las Matemáticas en niños/as (Universidad de Blanquerna), biblioteca escolar, Dificultades Específicas de la Lectoescritura, trabajo de la lengua en un entorno de trabajo globalizado, metodologías de enfoque globalizado, así como en la creación de espacios de aprendizaje.'
  },
  'estefania-del-ramon': {
    name: 'Estefanía del Ramón',
    role: 'Profesora Escola Octavio Paz',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Estefania%20Del%20Ramon.jpg',
    description: 'Es profesora de la Escuela Octavio Paz de Barcelona, una de las escuelas públicas más reconocidas y valoradas en Cataluña por su capacidad de innovación y cambio, transformándose en un referente mundial para la educación pública de calidad, ella ha sido parte activa del proceso de transformación metodológica desde hace 5 años. Es master en psicopedagogía, master en resolución de conflictos en el ámbito educativo, maestra de educación musical y licenciada como interprete profesional de piano. Es una persona comprometida con el bienestar y el éxito de sus estudiantes, posee un alto grado de compromiso con una educación de calidad, busca que la escuela los prepare a nivel personal, social y emocional para enfrentar los desafíos de la sociedad del siglo XXI con confianza y resiliencia.'
  },
  'gemma-pariente': {
    name: 'Gemma Pariente',
    role: 'Profesora Escola Octavio Paz',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Gemma%20Pariente.png',
    description: 'Es profesora de la Escuela Octavio Paz de Barcelona, una de las escuelas públicas más reconocidas y valoradas en Cataluña por su capacidad de innovación y cambio, transformándose en un referente mundial para la educación pública de calidad, ella ha sido parte activa del proceso de transformación metodológica desde hace 5 años. Es master en psicopedagogía, master en resolución de conflictos en el ámbito educativo, maestra de educación musical y licenciada como interprete profesional de piano. Es una persona comprometida con el bienestar y el éxito de sus estudiantes, posee un alto grado de compromiso con una educación de calidad, busca que la escuela los prepare a nivel personal, social y emocional para enfrentar los desafíos de la sociedad del siglo XXI con confianza y resiliencia.'
  },
  'maria-latre': {
    name: 'María Latre',
    role: 'Coordinadora Primaria Virolai Reina Elisenda',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Maria%20Latre.png',
    description: 'Coordinadora de la etapa de Primaria en la Escola Virolai Reina Elisenda, donde trabaja desde hace más de una década. Graduada en Educación Primaria por UNIR y en Periodismo por la UAB, aporta una visión única que combina pedagogía y comunicación. Especialista en integración de tecnologías educativas, lidera la implementación de iPads en el aula y forma a docentes en herramientas digitales y metodologías activas. Su experiencia como realizadora audiovisual le permite incorporar narrativas visuales en los procesos de aprendizaje. Desde 2012 es profesora de inglés en todos los niveles educativos y ha coordinado escuelas de verano para más de 200 estudiantes, promoviendo siempre enfoques comunicativos e innovadores.'
  },
  'andreu-basoli': {
    name: 'Andreu Basolí',
    role: 'Profesor Primaria Escola Sadako',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Andreu%20Basoli.png',
    description: 'Maestro de Educación Primaria en la Escola Sadako de Barcelona, donde ejerce como tutor con una pedagogía centrada en el acompañamiento activo y la educación en valores. Graduado en Educación Primaria en inglés, combina su labor docente con una amplia trayectoria en el ocio educativo, habiendo sido director de colonias de verano y monitor durante más de 7 años en Can Colapi. Miembro activo del Moviment de Centres d\'Esplai Cristians Catalans, participa en el Ámbito Pedagógico y en la organización de encuentros juveniles. Ha sido mentor en programas de inclusión, voluntario internacional en Gambia y profesor en diversos proyectos educativos. Defiende una educación coherente, crítica y transformadora, creyendo firmemente en el poder del ocio como motor de desarrollo personal y comunitario.'
  },
  'neus-colomer': {
    name: 'Neus Colomer',
    role: 'Equipo Directivo Escola Sadako',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Neus%20Colomer.jpeg',
    description: 'Miembro del equipo directivo de la Escola Sadako de Barcelona, donde también ejerce como maestra de Educación Primaria. Graduada en Educación Primaria con mención en diversidad por Blanquerna - Universitat Ramon Llull, ha orientado su carrera hacia la atención a la diversidad y la construcción de entornos escolares seguros y equitativos. Formada en prevención de abusos sexuales infantiles y en abordaje de violencias machistas, incorpora estos aprendizajes en la cultura organizativa del centro. Directora certificada de actividades de tiempo libre infantil y juvenil, su trayectoria en el ocio educativo refuerza su visión de una escuela que reconoce el valor del juego, el vínculo y la participación como pilares del aprendizaje. Es una educadora comprometida con el bienestar de la infancia y la transformación profunda de las prácticas escolares.'
  },
  'begonya-folch': {
    name: 'Begonya Folch',
    role: 'Profesora del Institut Angeleta Ferrer',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/begonya%20folch.jpg',
    description: 'Profesora de Educación Secundaria y formadora del Departamento de Educación de Catalunya, comprometida con la transformación del sistema educativo. Experta en innovación pedagógica y la relación entre arte y educación, ha sido profesora asociada en la Universidad de Barcelona y docente en el Institut Angeleta Ferrer. Ha colaborado en la redacción del Currículum catalán y formó parte del equipo responsable del Programa Escuela 2.0 a través del proyecto eduCAT1x1. Como técnica del Consejo Escolar de Cataluña, ha impulsado políticas educativas innovadoras. Colabora activamente con Rosa Sensat, el ICE de la UAB, ICFO y la STEAM Conference Barcelona. En el Institut Quatre Cantons, como profesora de Música y Trabajo Globalizado, comparte sus experiencias didácticas promoviendo metodologías interdisciplinares y creativas.'
  },
  'laura-carmona': {
    name: 'Laura Carmona',
    role: 'Coordinadora Institut Angeleta Ferrer',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Laura%20Carmona.jpg',
    description: 'Coordinadora del equipo docente y profesora de secundaria en el Institut Angeleta Ferrer, centro público de referencia en formación e investigación docente. Licenciada en Ciencias Políticas por la UAB y MSc en Desarrollo Social y Conflicto por la University of Wales. Formadora en el Máster de Profesorado de la UPF y Blanquerna, actualmente colabora con la UAB impartiendo la asignatura sobre desigualdades educativas. Miembro activo del grupo Perspectiva Feminista de Rosa Sensat, coordinó la 56ª Escola d\'Estiu sobre prácticas de educación feminista. Su enfoque pedagógico combina compromiso social, perspectiva de género y una visión crítica de la educación como herramienta de transformación y justicia social, promoviendo siempre la formación continua del profesorado.'
  },
  'cristina-romanos': {
    name: 'Cristina Romanos',
    role: 'Coordinadora Pedagógica Virolai Grimm',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Cristina%20Romanos.jpeg',
    description: 'Coordinadora pedagógica de Virolai Grimm, el centro del ecosistema Virolai dedicado exclusivamente a Educación Infantil. Lidera procesos pedagógicos centrados en el desarrollo integral de los niños en sus primeros años, implementando metodologías activas y relacionales basadas en la curiosidad. Formada en Magisterio de Educación Infantil, Psicopedagogía y Logopedia por la UAB, está especializada en procesos de lectoescritura y comprensión lectora en la primera infancia. Defensora del uso consciente de la tecnología educativa, integra herramientas digitales y gamificación para enriquecer el aprendizaje. Su pedagogía se basa en el respeto, la escucha y la confianza en las capacidades de cada niño, promoviendo una escuela que aprende con y desde la infancia.'
  }
};

export interface TeamGroup {
  id: string;
  title: string;
  members: string[];
}

/** Order within a group is the order on the page; it was set by hand with Brent (rows of six on a wide screen). */
export const TEAM_GROUPS: TeamGroup[] = [
  { id: 'comite', title: 'Comité Internacional', members: ['joan-quintana', 'arnoldo-cisternas', 'coral-regi', 'pepe-menendez', 'jordi-mussons', 'sandra-entrena', 'anna-comas', 'marcelo-ruiz'] },
  { id: 'equipo-fne', title: 'Equipo FNE', members: ['gabriela-naranjo', 'mora-del-fresno', 'ignacio-pavez', 'brent-curtis', 'marcela-molina', 'andres-bustamante', 'joaquin-aguirre'] },
  { id: 'asesores', title: 'Asesores Internacionales', members: ['sergi-del-moral', 'abraham-de-la-fuente', 'ana-vicalvaro', 'raul-martinez', 'maite-pino', 'enrique-vergara', 'betlem-cuesta', 'carlo-de-britos', 'begonya-folch', 'laura-carmona', 'jorge-parra', 'juan-jose-flores', 'marta-cardenas', 'claudia-lopez', 'laia-garces', 'marta-ortega', 'cristina-montes', 'estefania-del-ramon', 'gemma-pariente', 'maria-latre', 'andreu-basoli', 'neus-colomer', 'cristina-romanos'] },
];
