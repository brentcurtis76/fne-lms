import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Script from 'next/script';
import TeamMemberImage from '../components/TeamMemberImage';

// Lazy load heavy components
const Footer = dynamic(() => import('../components/Footer'), { 
  loading: () => <div className="h-96 bg-gray-50 animate-pulse" />
});

export default function NosotrosPage() {
  const [selectedMember, setSelectedMember] = useState(null);
  const [activeTab, setActiveTab] = useState('mision');
  
  useEffect(() => {
    // Mobile menu functionality
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const closeMenuBtn = document.getElementById('close-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    
    const openMenu = () => {
      if (mobileMenu) mobileMenu.classList.remove('translate-x-full');
    };
    
    const closeMenu = () => {
      if (mobileMenu) mobileMenu.classList.add('translate-x-full');
    };
    
    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openMenu);
    if (closeMenuBtn) closeMenuBtn.addEventListener('click', closeMenu);
    
    // Close mobile menu on link click
    const mobileLinks = mobileMenu?.querySelectorAll('a');
    mobileLinks?.forEach(link => {
      link.addEventListener('click', closeMenu);
    });
    
    // Cleanup function
    return () => {
      if (mobileMenuBtn) mobileMenuBtn.removeEventListener('click', openMenu);
      if (closeMenuBtn) closeMenuBtn.removeEventListener('click', closeMenu);
      mobileLinks?.forEach(link => {
        link.removeEventListener('click', closeMenu);
      });
    };
  }, []);

  const handleShowMore = (memberKey) => {
    setSelectedMember(memberKey);
  };

  const teamMembers = {
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
      description: 'Es la directora de la Fundación Nueva Educación, conduce el equipo de trabajo en Chile para alcanzar los objetivos estratégicos de la FNE. Es psicóloga clínica y organizacional, es Máster en Dirección de Personas por la Universidad Ramón Llull en Barcelona, es Psicóloga Clínica con formación de postgrado en enfoque  neoraichiano y biosíntesis. Ha conducido y dado forma a la orgánica de la FNE en Chile, creo la ATE – FNE reconocida por el MINEDUC en Chile y cada día trabaja para la consolidación institucional y la viabilidad en el mediano y largo plazo del proyecto FNE. Su pasión por el mundo interior de las personas le ha llevado a trabajar día a día para que la educación deje de estar de espaldas al mundo interior de las niñas y los niños. Trabaja para que la educación esté centrada en la vida del estudiante en su experiencia y la construcción de su identidad.'
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
    'boris-mir': {
      name: 'Boris Mir',
      role: 'Director Adjunto Institut Angeleta Ferrer',
      image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Boris%20Mir.jpg',
      description: 'Profesor de educación secundaria experto en aprendizaje y en transformación educativa. Fundador y director del Instituto Angelta Ferrer, colegio para la formación del profesorado de vanguardia en Cataluña. Promotor del Instituto-Escuela Les Vinyes de Castellbisbal, un centro de la red de institutos innovadores de la Universidad Autónoma de Barcelona. Fue director adjunto del Programa Escola Nova 21, una alianza de centros educativos y entidades para un sistema educativo avanzado, que responde a la llamada de la UNESCO para la participación de todos los sectores en un proceso inclusivo de mejora de la educación. Se creó en enero de 2016 mediante un convenio entre el Centro UNESCO de Catalunya, la Fundació Jaume Bofill y la Universitat Oberta de Catalunya, al que se sumaron la Fundació La Caixa y la Diputació de Barcelona. Ha impulsado proyectos de innovación educativa en torno a la evaluación formativa, las estrategias de aprendizaje y la creatividad en el aula. Es formador en diferentes universidades y consultor en organizaciones educativas sobre gestión del cambio y liderazgo.'
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
      description: 'PhD en Comportamiento Organizacional por Case Western Reserve University (USA) e Ingeniero Civil de la Pontificia Universidad Católica de Chile. Consultor internacional, conferencista y profesor de postgrado en las principales universidades de Chile. Experto en liderazgo educativo, desarrollo de equipos de gestión, aprendizaje experiencial y gestión del cambio. Especializado en implementar procesos de cambio organizacional para avanzar hacia el paradigma del "aprendizaje centrado en el estudiante", con énfasis en la integración curricular mediante metodologías de vanguardia como el aprendizaje basado en proyectos y experiencias. Director de Relaciona Consultores, Co-creador del Instituto Diálogos e Indagación Apreciativa (IDeIA) y miembro del Steering Committee del "World Positive Education Accelerator".'
    },
    'marcela-molina': {
      name: 'Marcela Molina',
      role: 'Investigadora',
      image: '',
      description: 'Candidata a Doctora en Educación por la Universidad del Desarrollo, donde desarrolla su investigación doctoral sobre la medición de impactos de los procesos de transformación educativa en colegios que implementan metodologías de Nueva Educación. Su trabajo se centra en identificar y evaluar los cambios sistémicos que ocurren en las comunidades educativas durante su transición hacia modelos pedagógicos centrados en el estudiante. Con formación en psicología educacional y metodologías de investigación cualitativa y cuantitativa, aporta una mirada rigurosa y científica al análisis de los procesos de cambio educativo. Su investigación contribuye a generar evidencia empírica sobre la efectividad de las intervenciones de la FNE y a desarrollar instrumentos de evaluación que permitan medir el progreso de las escuelas en su camino hacia la transformación educativa.'
    },
    'andrea-lagos': {
      name: 'Andrea Lagos',
      role: 'Encargada de Comunicaciones & Relaciones Institucionales',
      image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Andrea%20Lagos.png',
      description: 'Periodista parte del equipo fundador del The Clinic en 1998. Durante diez años escribió las entrevistas principales del periódico y fue editora del Suplemento de Cultura, "Caldo de Cultivo". Luego escribió artículos y entrevistas para la Revista Paula, la mítica Revista Fibra y recientemente para América Futura del Diario El País. Durante la última década fue editora del Suplemento de cultura www.suplementoku.cl de los Medios Regionales de El Mercurio. Actualmente desarrolla contenido audiovisual y comunicacional para Fundación Nueva Educación y Los Pellines.'
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
      role: 'Formadora Departamento de Educación',
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

  return (
    <>
      <Head>
        <title>Nosotros - Fundación Nueva Educación</title>
        <meta name="description" content="Conoce a la Fundación Nueva Educación, nuestra misión de transformar la educación y el equipo de expertos comprometidos con el cambio educativo." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <style>{`
          .team-photo {
            filter: grayscale(100%);
          }
          
          .team-photo[alt="Neus Colomer"] {
            transform: scale(1.5);
            object-position: center 20%;
          }
          
          .line-clamp-3 {
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          
          html {
            scroll-behavior: smooth;
          }
        `}</style>
      </Head>

      <div className="bg-white text-black min-h-screen">
        {/* Header */}
        <header id="header" className="fixed top-8 left-0 right-0 z-50 transition-all duration-300">
          <div className="max-w-7xl mx-auto px-6">
            <div className="bg-white/95 backdrop-blur-sm rounded-full shadow-lg px-8 py-3 flex items-center justify-between">
              {/* Logo */}
              <div className="flex items-center">
                <Link href="/" className="flex items-center space-x-3">
                  <img 
                    src="/Logo BW.png?v=3" 
                    alt="FNE" 
                    className="h-12 w-auto py-1" 
                  />
                </Link>
              </div>
              
              {/* Desktop Navigation */}
              <nav className="hidden lg:flex items-center space-x-10">
                <Link href="/#pasantias" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">PASANTÍAS</Link>
                <Link href="/#aula-generativa" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">AULA GENERATIVA</Link>
                <Link href="/noticias" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">NOTICIAS</Link>
                <Link href="/nosotros" className="text-base font-medium text-black font-semibold">NOSOTROS</Link>
                <Link href="/#contacto" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">CONTACTO</Link>
              </nav>
              
              {/* Login Button */}
              <div className="hidden lg:flex items-center space-x-4">
                <Link href="/login" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors border border-gray-300 rounded-full px-4 py-2">
                  PLATAFORMA DE CRECIMIENTO
                </Link>
              </div>
              
              {/* Mobile Menu Button */}
              <button id="mobile-menu-btn" className="lg:hidden p-2 text-gray-800">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
              </button>
            </div>
          </div>
        </header>
        
        {/* Mobile Menu Overlay */}
        <div id="mobile-menu" className="fixed inset-0 bg-white z-50 transform translate-x-full transition-transform duration-300 lg:hidden">
          <div className="p-6">
            <div className="flex justify-between items-center mb-8">
              <span className="text-2xl font-black">FNE</span>
              <button id="close-menu-btn" className="p-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <nav className="flex flex-col space-y-6">
              <Link href="/#pasantias" className="text-xl font-medium">PASANTÍAS</Link>
              <Link href="/#aula-generativa" className="text-xl font-medium">AULA GENERATIVA</Link>
              <Link href="/noticias" className="text-xl font-medium">NOTICIAS</Link>
              <Link href="/nosotros" className="text-xl font-medium">NOSOTROS</Link>
              <Link href="/#contacto" className="text-xl font-medium">CONTACTO</Link>
              <Link href="/login" className="border border-gray-300 rounded-full px-8 py-4 text-sm font-medium w-full text-center hover:bg-gray-100 transition-all duration-300">
                PLATAFORMA DE CRECIMIENTO
              </Link>
            </nav>
          </div>
        </div>

        {/* Hero Section */}
        <section className="pt-64 pb-24 px-6 bg-gradient-to-b from-gray-50 to-white">
          <div className="max-w-6xl mx-auto text-center">
            <h1 className="text-5xl md:text-7xl font-black text-gray-900 mb-6 leading-tight">
              NOSOTROS
            </h1>
          </div>
        </section>

        {/* Who We Are Section */}
        <section className="py-24 px-6 bg-gradient-to-b from-white to-gray-50">
          <div className="max-w-7xl mx-auto">
            {/* Main Statement */}
            <div className="max-w-4xl mx-auto mb-20">
              <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-8 text-center">
                Somos una red de profesionales que reflexiona y crea soluciones para la educación del siglo XXI
              </h2>
              <p className="text-xl text-gray-700 leading-relaxed text-center">
                Conformada por un equipo multidisciplinario de expertos en facilitar procesos de Cambio Cultural 
                en el mundo de la educación, pioneros en la aplicación de los principios de la Nueva Educación 
                en programas de formación para estudiantes y programas de cambio en equipos directivos y docentes.
              </p>
            </div>

            {/* Three Pillars */}
            <div className="grid md:grid-cols-3 gap-8 mb-20">
              <div className="bg-white rounded-3xl shadow-lg p-8 hover:shadow-xl transition-shadow border-2 border-gray-100">
                <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mb-6">
                  <svg className="w-8 h-8 text-[#fdb933]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Transformar</h3>
                <p className="text-gray-700 leading-relaxed">
                  Acompañamos a las comunidades educativas en procesos profundos de transformación cultural, 
                  facilitando el cambio desde adentro. Trabajamos codo a codo con directivos, docentes, 
                  estudiantes y familias para co-crear una nueva cultura escolar centrada en el desarrollo 
                  integral y el bienestar de toda la comunidad.
                </p>
              </div>

              <div className="bg-white rounded-3xl shadow-lg p-8 hover:shadow-xl transition-shadow border-2 border-gray-100">
                <div className="w-16 h-16 bg-[#fdb933] rounded-2xl flex items-center justify-center mb-6">
                  <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Conectar</h3>
                <p className="text-gray-700 leading-relaxed">
                  Sinergizamos redes vivas de colaboración entre escuelas innovadoras de Chile, España y 
                  América Latina. Estas redes permiten que las comunidades educativas compartan sus 
                  experiencias, aprendan unas de otras y co-construyan soluciones a desafíos comunes. 
                  A través de pasantías internacionales, encuentros y programas formativos, creamos 
                  un ecosistema de aprendizaje que trasciende fronteras.
                </p>
              </div>

              <div className="bg-white rounded-3xl shadow-lg p-8 hover:shadow-xl transition-shadow border-2 border-gray-100">
                <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mb-6">
                  <svg className="w-8 h-8 text-[#fdb933]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Innovar</h3>
                <p className="text-gray-700 leading-relaxed">
                  Desarrollamos herramientas e instrumentos propios para implementar, medir y ejecutar 
                  procesos de transformación educativa. Creamos metodologías de diagnóstico, matrices 
                  de evaluación, protocolos de implementación y sistemas de seguimiento que permiten 
                  a las escuelas gestionar su cambio de manera sistemática, medible y sostenible 
                  en el tiempo.
                </p>
              </div>
            </div>

            {/* Impact Numbers */}
            <div className="bg-gradient-to-br from-gray-900 via-black to-gray-800 rounded-3xl p-12 md:p-16 relative overflow-hidden">
              <div className="absolute inset-0 opacity-20">
                <div className="absolute -right-20 -top-20 w-80 h-80 bg-[#fdb933] rounded-full blur-3xl"></div>
                <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-white rounded-full blur-3xl"></div>
              </div>
              
              <div className="relative z-10">
                <h3 className="text-4xl md:text-5xl font-black text-white text-center mb-16">NUESTRO IMPACTO</h3>
                
                <div className="grid md:grid-cols-3 gap-8 md:gap-12">
                  <div className="text-center group">
                    <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-10 border border-white/20 hover:bg-white/15 transform hover:-translate-y-2 transition-all duration-300">
                      <div className="text-7xl font-black text-[#fdb933] mb-6">12</div>
                      <div className="text-white font-bold text-xl leading-relaxed">
                        Escuelas de vanguardia colaboradoras en Barcelona
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-center group">
                    <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-10 border border-white/20 hover:bg-white/15 transform hover:-translate-y-2 transition-all duration-300">
                      <div className="text-7xl font-black text-[#fdb933] mb-6">33</div>
                      <div className="text-white font-bold text-xl leading-relaxed">
                        Colegios han pasado por nuestros programas de transformación
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-center group">
                    <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-10 border border-white/20 hover:bg-white/15 transform hover:-translate-y-2 transition-all duration-300">
                      <div className="text-7xl font-black text-[#fdb933] mb-6">400+</div>
                      <div className="text-white font-bold text-xl leading-relaxed">
                        Pasantes internacionales a Barcelona
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-16 text-center">
                  <div className="bg-[#fdb933]/20 backdrop-blur-sm rounded-2xl p-8 border border-[#fdb933]/30">
                    <p className="text-xl md:text-2xl text-white font-medium">
                      Más de <span className="font-black text-[#fdb933] text-3xl">40</span> colegios han confiado en nuestros programas de pasantías internacionales
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Team Section Header */}
        <section className="py-24 px-6">
          <div className="max-w-6xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              NUESTRO EQUIPO
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Expertos comprometidos con la innovación educativa y el desarrollo de metodologías 
              que potencian el crecimiento integral de cada estudiante
            </p>
          </div>
        </section>

        {/* Team Sections */}
        <section className="py-16 px-6">
          <div className="max-w-7xl mx-auto">
            
            {/* Comité Internacional */}
            <div className="mb-20">
              <h3 className="text-3xl font-bold text-center mb-12 text-gray-900">Comité Internacional</h3>
              <div className="grid md:grid-cols-3 gap-8 items-stretch">
                {['joan-quintana', 'arnoldo-cisternas', 'coral-regi', 'boris-mir', 'pepe-menendez', 'jordi-mussons', 'sandra-entrena', 'anna-comas', 'marcelo-ruiz'].map((memberKey) => {
                  const member = teamMembers[memberKey];
                  return (
                    <div key={memberKey} className="group relative overflow-hidden bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 flex flex-col h-full">
                      <div className="relative flex-1 flex flex-col">
                        <div className="absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(to bottom right, rgba(0, 54, 91, 0.1), rgba(0, 54, 91, 0.2))' }}></div>
                        <div className="p-8 text-center flex flex-col h-full">
                          <div className="relative w-48 h-48 mx-auto mb-6 rounded-full overflow-hidden flex-shrink-0">
                            <TeamMemberImage
                              src={member.image}
                              alt={member.name}
                              name={member.name}
                              className="w-full h-full object-cover team-photo"
                            />
                          </div>
                          <h3 className="text-2xl font-bold text-gray-900 mb-2">{member.name}</h3>
                          <p className="text-gray-600 font-semibold mb-4">{member.role}</p>
                          <p className="text-gray-600 line-clamp-3 mb-6 flex-grow">{member.description}</p>
                          <button
                            onClick={() => handleShowMore(memberKey)}
                            className="text-white px-6 py-3 rounded-full transition-all duration-300 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
                            style={{ backgroundColor: '#00365b' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#002845'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#00365b'}
                          >
                            Ver más
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Equipo FNE */}
            <div className="mb-20">
              <h3 className="text-3xl font-bold text-center mb-12 text-gray-900">Equipo FNE</h3>
              <div className="grid md:grid-cols-3 gap-8 items-stretch">
                {['gabriela-naranjo', 'mora-del-fresno', 'brent-curtis', 'ignacio-pavez', 'marcela-molina', 'andrea-lagos'].map((memberKey) => {
                  const member = teamMembers[memberKey];
                  return (
                    <div key={memberKey} className="group relative overflow-hidden bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 flex flex-col h-full">
                      <div className="relative flex-1 flex flex-col">
                        <div className="absolute inset-0 bg-gradient-to-br from-[#fdb933]/10 to-[#fdb933]/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="p-8 text-center flex flex-col h-full">
                          <div className="relative w-48 h-48 mx-auto mb-6 rounded-full overflow-hidden flex-shrink-0">
                            <TeamMemberImage
                              src={member.image}
                              alt={member.name}
                              name={member.name}
                              className="w-full h-full object-cover team-photo"
                            />
                          </div>
                          <h3 className="text-2xl font-bold text-gray-900 mb-2">{member.name}</h3>
                          <p className="text-gray-600 font-semibold mb-4">{member.role}</p>
                          <p className="text-gray-600 line-clamp-3 mb-6 flex-grow">{member.description}</p>
                          <button
                            onClick={() => handleShowMore(memberKey)}
                            className="bg-[#fdb933] text-black px-6 py-3 rounded-full hover:bg-[#fdb933]/90 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
                          >
                            Ver más
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Asesores Internacionales */}
            <div className="mb-20">
              <h3 className="text-3xl font-bold text-center mb-12 text-gray-900">Asesores Internacionales</h3>
              <div className="grid md:grid-cols-3 gap-8 items-stretch">
                {['sergi-del-moral', 'abraham-de-la-fuente', 'ana-vicalvaro', 'raul-martinez', 'jorge-parra', 'juan-jose-flores', 'betlem-cuesta', 'carlo-de-britos', 'marta-cardenas', 'begonya-folch', 'laura-carmona', 'maite-pino', 'claudia-lopez', 'enrique-vergara', 'laia-garces', 'marta-ortega', 'cristina-montes', 'estefania-del-ramon', 'gemma-pariente', 'maria-latre', 'andreu-basoli', 'neus-colomer', 'cristina-romanos'].map((memberKey) => {
                  const member = teamMembers[memberKey];
                  return (
                    <div key={memberKey} className="group relative overflow-hidden bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 flex flex-col h-full">
                      <div className="relative flex-1 flex flex-col">
                        <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-red-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="p-8 text-center flex flex-col h-full">
                          <div className="relative w-48 h-48 mx-auto mb-6 rounded-full overflow-hidden flex-shrink-0">
                            <TeamMemberImage
                              src={member.image}
                              alt={member.name}
                              name={member.name}
                              className="w-full h-full object-cover team-photo"
                            />
                          </div>
                          <h3 className="text-2xl font-bold text-gray-900 mb-2">{member.name}</h3>
                          <p className="text-gray-600 font-semibold mb-4">{member.role}</p>
                          <p className="text-gray-600 line-clamp-3 mb-6 flex-grow">{member.description}</p>
                          <button
                            onClick={() => handleShowMore(memberKey)}
                            className="bg-red-600 text-white px-6 py-3 rounded-full hover:bg-red-700 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
                          >
                            Ver más
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </section>

        {/* Modal */}
        {selectedMember && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="p-8 overflow-y-auto max-h-[80vh]">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-3xl font-bold text-gray-900 mb-2">
                      {teamMembers[selectedMember].name}
                    </h3>
                    <p className="text-[#fdb933] font-semibold text-lg">
                      {teamMembers[selectedMember].role}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedMember(null)}
                    className="text-gray-400 hover:text-gray-600 text-2xl p-2"
                  >
                    ×
                  </button>
                </div>
                <div className="prose prose-gray max-w-none">
                  <p className="text-gray-700 leading-relaxed">
                    {teamMembers[selectedMember].description}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <Footer />
      </div>

      {/* Load Tailwind CSS with next/script for better performance */}
      <Script 
        src="https://cdn.tailwindcss.com" 
        strategy="lazyOnload"
      />

    </>
  );
}