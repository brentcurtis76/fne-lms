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
      role: 'Coordinadora Pedagógica FNE - IR',
      image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Mora%20Del%20Fresno.png',
      description: 'Coordina las operaciones de la Fundación en Barcelona y Chile. Es licenciada y profesora en Ciencias de la Educación (Universidad de San Andrés, Argentina), Máster en Neuroeducación (Universitat de Barcelona, España). Es especialista en gestión y liderazgo pedagógico, así como en Educación Relacional, ya que actualmente es responsable de la Unidad de Educación del Instituto Relacional en Barcelona. Ha trabajado como profesora y tutora escolar en nivel secundario. Colabora en diversos proyectos de acompañamiento de escuelas en procesos de transformación pedagógica en Argentina, Chile, España y Portugal.'
    },
    'gabriela-naranjo': {
      name: 'Gabriela Naranjo',
      role: 'Directora de la FNE – IR Chile',
      image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Gabriela%20Naranjo.jpg',
      description: 'Es la directora de la Fundación Nueva Educación, conduce el equipo de trabajo en Chile para alcanzar los objetivos estratégicos de la FNE. Es psicóloga clínica y organizacional, es Máster en Dirección de Personas por la Universidad Ramón Llull en Barcelona, es Psicóloga Clínica con formación de postgrado en enfoque  neoraichiano y biosíntesis. Ha conducido y dado forma a la orgánica de la FNE en Chile, creo la ATE – FNE reconocida por el MINEDUC en Chile y cada día trabaja para la consolidación institucional y la viabilidad en el mediano y largo plazo del proyecto FNE. Su pasión por el mundo interior de las personas le ha llevado a trabajar día a día para que la educación deje de estar de espaldas al mundo interior de las niñas y los niños. Trabaja para que la educación esté centrada en la vida del estudiante en su experiencia y la construcción de su identidad.'
    },
    'brent-curtis': {
      name: 'Brent Curtis',
      role: 'Relaciones Institucionales FNE',
      image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Brent%20Curtis.JPG',
      description: 'Brent es Teólogo y está a cargo de la vinculación con la red de instituciones que conectan con el propósito de la FNE, tanto con Universidades como con entidades gubernamentales, organismos internacionales, corporaciones y fundaciones educacionales de las que dependen las escuelas y colegios que forman parte de la red de instituciones que buscan transformar la educación en Chile. Posee un profundo interés por transformar la educación y favorecer la emergencia de un nicho de escuelas de vanguardia en Chile que pueda movilizar la transformación de todo el sistema educativo. Experto en redes sociales, educación on-line y producción de eventos participativos de gran formato.'
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
      image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Sandra%20Entrena.jpg',
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
    }
  };

  return (
    <>
      <Head>
        <title>Nosotros - Fundación Nueva Educación</title>
        <meta name="description" content="Conoce a la Fundación Nueva Educación, nuestra misión de transformar la educación y el equipo de expertos comprometidos con el cambio educativo." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
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
            
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Liderando la transformación educativa desde la experiencia y el compromiso con el desarrollo integral
            </p>
          </div>
        </section>

        {/* Mission & Vision Section */}
        <section className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            {/* Tab Navigation */}
            <div className="flex flex-wrap justify-center gap-4 mb-16">
              <button
                onClick={() => setActiveTab('mision')}
                className={`px-8 py-3 rounded-full font-medium transition-all ${
                  activeTab === 'mision'
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Nuestra Misión
              </button>
              <button
                onClick={() => setActiveTab('vision')}
                className={`px-8 py-3 rounded-full font-medium transition-all ${
                  activeTab === 'vision'
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Nuestra Visión
              </button>
              <button
                onClick={() => setActiveTab('valores')}
                className={`px-8 py-3 rounded-full font-medium transition-all ${
                  activeTab === 'valores'
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Nuestros Valores
              </button>
            </div>

            {/* Tab Content */}
            <div className="max-w-4xl mx-auto">
              {activeTab === 'mision' && (
                <div className="bg-white rounded-2xl shadow-lg p-12">
                  <h2 className="text-3xl font-bold mb-6 text-gray-900">Nuestra Misión</h2>
                  <p className="text-lg text-gray-700 leading-relaxed mb-6">
                    Somos una red de profesionales apasionados por la educación del siglo XXI, comprometidos con la reflexión profunda y la creación de soluciones innovadoras para transformar el paradigma educativo actual.
                  </p>
                  <p className="text-lg text-gray-700 leading-relaxed mb-6">
                    Conformados por un equipo multidisciplinario de expertos, facilitamos procesos de Cambio Cultural en las comunidades educativas, pioneros en la aplicación de los principios de la Nueva Educación en programas de formación para estudiantes y equipos directivos y docentes.
                  </p>
                  <div className="grid md:grid-cols-2 gap-6 mt-8">
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h3 className="font-bold text-xl mb-3">🎯 Nuestro Enfoque</h3>
                      <p className="text-gray-600">
                        Transformación sistémica de la educación a través del acompañamiento personalizado y la innovación pedagógica basada en evidencia.
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h3 className="font-bold text-xl mb-3">🌍 Nuestro Alcance</h3>
                      <p className="text-gray-600">
                        Trabajamos con más de 60 colegios en Chile, impactando a más de 100,000 estudiantes en 9 regiones del país.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'vision' && (
                <div className="bg-white rounded-2xl shadow-lg p-12">
                  <h2 className="text-3xl font-bold mb-6 text-gray-900">Nuestra Visión</h2>
                  <p className="text-lg text-gray-700 leading-relaxed mb-6">
                    Aspiramos a ser el referente líder en la transformación educativa de América Latina, creando un ecosistema de escuelas innovadoras que sirvan como modelo para el cambio sistémico en la educación.
                  </p>
                  <p className="text-lg text-gray-700 leading-relaxed mb-6">
                    Visualizamos un futuro donde cada estudiante pueda desarrollar su máximo potencial en ambientes de aprendizaje que fomenten la autonomía, la colaboración y el pensamiento crítico, preparándolos para los desafíos del siglo XXI.
                  </p>
                  <div className="bg-black text-white rounded-xl p-8 mt-8">
                    <h3 className="font-bold text-xl mb-4">Hacia el 2030</h3>
                    <ul className="space-y-3">
                      <li className="flex items-start">
                        <span className="mr-3">✓</span>
                        <span>Red de 200+ escuelas transformadas en Chile y América Latina</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-3">✓</span>
                        <span>Formación de 10,000+ docentes en metodologías innovadoras</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-3">✓</span>
                        <span>Centro de investigación educativa de referencia internacional</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === 'valores' && (
                <div className="bg-white rounded-2xl shadow-lg p-12">
                  <h2 className="text-3xl font-bold mb-6 text-gray-900">Nuestros Valores</h2>
                  <div className="grid gap-6">
                    <div className="border-l-4 border-black pl-6">
                      <h3 className="font-bold text-xl mb-2">Innovación Pedagógica</h3>
                      <p className="text-gray-700">
                        Promovemos metodologías activas y participativas que sitúan al estudiante en el centro del proceso de aprendizaje, fomentando su autonomía y creatividad.
                      </p>
                    </div>
                    <div className="border-l-4 border-black pl-6">
                      <h3 className="font-bold text-xl mb-2">Colaboración Transformadora</h3>
                      <p className="text-gray-700">
                        Creemos en el poder de las redes colaborativas para generar cambios significativos y sostenibles en las comunidades educativas.
                      </p>
                    </div>
                    <div className="border-l-4 border-black pl-6">
                      <h3 className="font-bold text-xl mb-2">Excelencia con Propósito</h3>
                      <p className="text-gray-700">
                        Buscamos la excelencia no como un fin en sí mismo, sino como un medio para desarrollar el máximo potencial de cada estudiante.
                      </p>
                    </div>
                    <div className="border-l-4 border-black pl-6">
                      <h3 className="font-bold text-xl mb-2">Aprendizaje Continuo</h3>
                      <p className="text-gray-700">
                        Fomentamos una cultura de mejora continua, donde el error es parte del proceso y la reflexión es fundamental para el crecimiento.
                      </p>
                    </div>
                    <div className="border-l-4 border-black pl-6">
                      <h3 className="font-bold text-xl mb-2">Impacto Social</h3>
                      <p className="text-gray-700">
                        Trabajamos para reducir las brechas educativas y crear oportunidades equitativas para todos los estudiantes, independientemente de su contexto.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Statistics Section */}
        <section className="py-24 px-6 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl font-bold text-center mb-16 text-gray-900">Nuestro Impacto</h2>
            <div className="grid md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="text-5xl font-black text-black mb-3">60+</div>
                <p className="text-gray-600 font-medium">Colegios en nuestra red</p>
              </div>
              <div className="text-center">
                <div className="text-5xl font-black text-black mb-3">100k+</div>
                <p className="text-gray-600 font-medium">Estudiantes impactados</p>
              </div>
              <div className="text-center">
                <div className="text-5xl font-black text-black mb-3">9</div>
                <p className="text-gray-600 font-medium">Regiones de Chile</p>
              </div>
              <div className="text-center">
                <div className="text-5xl font-black text-black mb-3">20+</div>
                <p className="text-gray-600 font-medium">Años de experiencia</p>
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
            
            {/* Equipo FNE */}
            <div className="mb-20">
              <h3 className="text-3xl font-bold text-center mb-12 text-gray-900">Equipo FNE</h3>
              <div className="grid md:grid-cols-3 gap-8 items-stretch">
                {['arnoldo-cisternas', 'joan-quintana', 'mora-del-fresno', 'gabriela-naranjo', 'brent-curtis'].map((memberKey) => {
                  const member = teamMembers[memberKey];
                  return (
                    <div key={memberKey} className="group relative overflow-hidden bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 flex flex-col h-full">
                      <div className="relative flex-1 flex flex-col">
                        <div className="absolute inset-0 bg-gradient-to-br from-[#00365b]/10 to-[#00365b]/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="p-8 text-center flex flex-col h-full">
                          <div className="relative w-48 h-48 mx-auto mb-6 rounded-full overflow-hidden flex-shrink-0">
                            <TeamMemberImage
                              src={member.image}
                              alt={member.name}
                              className="w-full h-full object-cover team-photo"
                            />
                          </div>
                          <h3 className="text-2xl font-bold text-gray-900 mb-2">{member.name}</h3>
                          <p className="text-[#00365b] font-semibold mb-4">{member.role}</p>
                          <p className="text-gray-600 line-clamp-3 mb-6 flex-grow">{member.description}</p>
                          <button
                            onClick={() => handleShowMore(memberKey)}
                            className="bg-gradient-to-r from-[#00365b] to-[#00365b]/80 text-white px-6 py-3 rounded-full hover:from-[#00365b]/90 hover:to-[#00365b] transition-all duration-300 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
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

            {/* Equipo Internacional */}
            <div className="mb-20">
              <h3 className="text-3xl font-bold text-center mb-12 text-gray-900">Equipo Internacional</h3>
              <div className="grid md:grid-cols-3 gap-8 items-stretch">
                {['coral-regi', 'boris-mir', 'jordi-mussons', 'pepe-menendez', 'sandra-entrena', 'anna-comas', 'sergi-del-moral', 'betlem-cuesta'].map((memberKey) => {
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
                              className="w-full h-full object-cover team-photo"
                            />
                          </div>
                          <h3 className="text-2xl font-bold text-gray-900 mb-2">{member.name}</h3>
                          <p className="text-[#fdb933] font-semibold mb-4">{member.role}</p>
                          <p className="text-gray-600 line-clamp-3 mb-6 flex-grow">{member.description}</p>
                          <button
                            onClick={() => handleShowMore(memberKey)}
                            className="bg-gradient-to-r from-[#fdb933] to-[#fdb933]/80 text-white px-6 py-3 rounded-full hover:from-[#fdb933]/90 hover:to-[#fdb933] transition-all duration-300 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
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
                    <p className="text-blue-600 font-semibold text-lg">
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