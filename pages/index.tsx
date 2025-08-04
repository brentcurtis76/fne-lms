import React, { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function HomePage() {
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
    
    // Accordion functionality
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    accordionHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const content = header.nextElementSibling as HTMLElement;
        const icon = header.querySelector('svg');
        
        // Toggle current item
        content.classList.toggle('hidden');
        icon?.classList.toggle('rotate-180');
        
        // Close other items
        accordionHeaders.forEach(otherHeader => {
          if (otherHeader !== header) {
            const otherContent = otherHeader.nextElementSibling as HTMLElement;
            const otherIcon = otherHeader.querySelector('svg');
            otherContent.classList.add('hidden');
            otherIcon?.classList.remove('rotate-180');
          }
        });
      });
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

  return (
    <>
      <Head>
        <title>Fundación Nueva Educación - Transforma el Futuro del Aprendizaje</title>
        <meta name="description" content="Acompañamos a las comunidades educativas a dar el salto hacia una Nueva Educación basada en la autonomía y la colaboración para la expresión plena del potencial de cada estudiante." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        
        {/* Google Fonts Inter */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet" />
        
        {/* Tailwind CSS */}
        <script src="https://cdn.tailwindcss.com"></script>
        
        <style jsx>{`
          body {
            font-family: 'Inter', sans-serif;
          }
          
          /* Custom scrollbar */
          ::-webkit-scrollbar {
            width: 8px;
          }
          ::-webkit-scrollbar-track {
            background: #f1f1f1;
          }
          ::-webkit-scrollbar-thumb {
            background: #000;
            border-radius: 4px;
          }
          
          /* Smooth scrolling */
          html {
            scroll-behavior: smooth;
          }
          
          /* Video overlay gradient */
          .video-overlay {
            background: linear-gradient(to right, rgba(255,255,255,0.3) 0%, transparent 50%);
          }
          
          /* Header backdrop blur */
          .header-blur {
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
          }
        `}</style>
      </Head>

      <div className="bg-white text-black">
        {/* Header */}
        <header id="header" className="fixed top-8 left-0 right-0 z-50 transition-all duration-300">
          <div className="max-w-7xl mx-auto px-6">
            <div className="bg-white/95 backdrop-blur-sm rounded-full shadow-lg px-8 py-3 flex items-center justify-between">
              {/* Logo */}
              <div className="flex items-center">
                <Link href="#inicio" className="flex items-center space-x-3">
                  <img 
                    src="/Logo BW.png?v=3" 
                    alt="FNE" 
                    className="h-12 w-auto py-1" 
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      if (e.currentTarget.nextElementSibling) {
                        (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'block';
                      }
                    }}
                  />
                  <span className="text-2xl font-black tracking-tight hidden">FNE</span>
                </Link>
              </div>
              
              {/* Desktop Navigation */}
              <nav className="hidden lg:flex items-center space-x-10">
                <a href="#pasantias" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">PASANTÍAS</a>
                <a href="#aula-generativa" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">AULA GENERATIVA</a>
                <a href="#equipo" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">EQUIPO</a>
                <a href="#contacto" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">CONTACTO</a>
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
              <a href="#pasantias" className="text-xl font-medium">PASANTÍAS</a>
              <a href="#aula-generativa" className="text-xl font-medium">AULA GENERATIVA</a>
              <a href="#equipo" className="text-xl font-medium">EQUIPO</a>
              <a href="#contacto" className="text-xl font-medium">CONTACTO</a>
              <Link href="/login" className="border border-gray-300 rounded-full px-8 py-4 text-sm font-medium w-full text-center hover:bg-gray-100 transition-all duration-300">
                PLATAFORMA DE CRECIMIENTO
              </Link>
            </nav>
          </div>
        </div>
        
        {/* Main Content */}
        <main>
          {/* Hero Section */}
          <section id="inicio" className="relative h-screen min-h-[600px] pt-24">
            <video 
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay 
              loop 
              muted 
              playsInline
              poster="https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1920&h=1080&fit=crop"
            >
              <source src="https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Videos/Video%20fondo%20web_light2.mov" type="video/quicktime" />
              {/* Fallback for browsers that don't support .mov */}
              <source src="https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Videos/Video%20fondo%20web_light2.mov" type="video/mp4" />
            </video>
            
            <div className="video-overlay absolute inset-0"></div>
            
            <div className="relative z-10 h-full flex items-center">
              <div className="max-w-7xl mx-auto px-6">
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-black uppercase mb-6 text-white">
                  VIAJA AL FUTURO<br />DE LA EDUCACIÓN
                </h1>
                <p className="text-lg md:text-xl max-w-[600px] mb-6 text-white/90 leading-relaxed">
                  Acompañamos a las comunidades educativas a dar el salto hacia una Nueva Educación basada en la autonomía y la colaboración para la expresión plena del potencial de cada estudiante.
                </p>
                <p className="text-sm md:text-base max-w-[480px] mb-8 text-white/80">
                  ATE certificada por RPA Mineduc
                </p>
              </div>
            </div>
          </section>
          
          {/* Section 1: Pasantías en Barcelona */}
          <section id="pasantias" className="py-24">
            <div className="max-w-[1040px] mx-auto px-6">
              <div className="lg:flex gap-12">
                <div className="lg:w-[55%] mb-8 lg:mb-0">
                  <h2 className="text-4xl font-black uppercase mb-6">PASANTÍAS EN BARCELONA</h2>
                  <p className="text-lg leading-relaxed mb-6">
                    <strong>Una experiencia única de innovación educativa en el corazón de Europa.</strong>
                  </p>
                  <p className="text-base leading-relaxed mb-4">
                    Acompañamos a líderes educativos chilenos en un viaje transformador a Barcelona, donde visitarán escuelas pioneras en metodologías innovadoras y participarán en talleres especializados con expertos internacionales.
                  </p>
                  <ul className="space-y-2 mb-6 text-base">
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span><strong>Próximas fechas:</strong> Noviembre 2025 y Enero 2026</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Visitas a escuelas innovadoras de Barcelona</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Talleres con metodologías de vanguardia</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Networking con educadores internacionales</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Certificación internacional</span>
                    </li>
                  </ul>
                  <a href="/pasantias-barcelona.pdf" target="_blank" className="inline-flex items-center underline text-lg hover:text-gray-600 transition-colors">
                    <span>Descargar información completa</span>
                    <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                  </a>
                </div>
                <div className="lg:w-[45%] space-y-4">
                  <img src="/barcelona-innovation.jpg" alt="Innovación Educativa - Estudiantes con tecnología 3D" className="w-full h-[200px] object-cover rounded" />
                  <img src="/barcelona-skyline.jpg" alt="Barcelona - Vista aérea con Sagrada Familia" className="w-full h-[200px] object-cover rounded" />
                  <img src="/barcelona-third.jpg" alt="Experiencia Educativa Barcelona" className="w-full h-[200px] object-cover rounded" />
                </div>
              </div>
            </div>
          </section>
          
          {/* Section 2: Aula Generativa */}
          <section id="aula-generativa" className="py-24 bg-[#F5F5F5]">
            <div className="max-w-[1040px] mx-auto px-6">
              <div className="lg:flex gap-12">
                <div className="lg:w-[45%] mb-8 lg:mb-0 space-y-4">
                  <img src="/los-pellines-team.gif" alt="Equipo Los Pellines - Experiencias de Aprendizaje Significativo" className="w-full h-[200px] object-cover rounded" />
                  <img src="/aula-generativa-activity.jpg" alt="Actividad colaborativa - Estudiantes participando en dinámicas de aprendizaje" className="w-full h-[400px] object-cover rounded" />
                </div>
                <div className="lg:w-[55%]">
                  <h2 className="text-4xl font-black uppercase mb-6">AULA GENERATIVA</h2>
                  <p className="text-lg leading-relaxed mb-6 font-semibold">
                    Hacia un ecosistema de relaciones saludables para el crecimiento de cada estudiante.
                  </p>
                  <p className="text-base leading-relaxed mb-6">
                    En Los Pellines nos hemos dedicado por más de 30 años al cuidado y fortalecimiento de la calidad de las relaciones de más de 80 mil niñas y niños. Hoy queremos llevar el "espíritu" de Los Pellines a la sala de clases con una propuesta teórica y práctica que pone en el centro el Aprendizaje con Sentido.
                  </p>
                  
                  <h3 className="text-xl font-bold mb-4">¿Cómo es un aula generativa?</h3>
                  <ul className="space-y-2 mb-6 text-sm">
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Los estudiantes y los profesores están muy motivados</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>La convivencia es el motor principal del aprendizaje significativo</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>La cultura del curso está muy fortalecida porque se promueve una identidad colectiva positiva</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Los estudiantes enseñan, explican y reflexionan</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Se co-construyen reglas de convivencia</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Se generan oportunidades para un reconocimiento social positivo entre iguales</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Se aprende cooperativamente</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>La influencia del profesor es más indirecta</span>
                    </li>
                  </ul>
                  
                  <p className="text-base leading-relaxed mb-6">
                    Esta propuesta busca trasladar al aula los beneficios de nuestros programas, mediante una serie de acciones y dispositivos pedagógicos que promueven y sostienen una cultura de bienestar relacional en el entorno escolar.
                  </p>
                  
                  <a href="/aula-generativa.pdf" target="_blank" className="inline-flex items-center underline text-lg hover:text-gray-600 transition-colors">
                    <span>Descargar programa completo</span>
                    <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </section>
          
          {/* Section 3: Equipo */}
          <section id="equipo" className="py-24">
            <div className="max-w-[1040px] mx-auto px-6">
              {/* Equipo FNE */}
              <div className="mb-20">
                <div className="text-center mb-12">
                  <h2 className="text-4xl font-black uppercase mb-6">EQUIPO FNE</h2>
                  <p className="text-lg leading-relaxed max-w-3xl mx-auto">
                    El equipo central de la Fundación Nueva Educación, comprometido con la transformación educativa en Chile y el mundo.
                  </p>
                </div>
                
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                  {/* Arnoldo Cisternas */}
                  <div className="text-center">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-3"></div>
                    <h3 className="text-base font-bold mb-1">Arnoldo Cisternas</h3>
                    <p className="text-gray-600 mb-2 text-xs">Psicólogo y Fundador</p>
                    <p className="text-xs leading-relaxed">
                      Especializado en Comportamiento Organizacional y Coaching Relacional. Co-fundador del Instituto Relacional y presidente de la FNE. Desarrolló el Enfoque Relacional y es autor de "Educación Relacional" y "Relaciones Poderosas".
                    </p>
                  </div>
                  
                  {/* Joan Quintana */}
                  <div className="text-center">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-3"></div>
                    <h3 className="text-base font-bold mb-1">Joan Quintana</h3>
                    <p className="text-gray-600 mb-2 text-xs">Psicólogo y Director Instituto Relacional</p>
                    <p className="text-xs leading-relaxed">
                      Especializado en Comportamiento Organizacional y Coaching Relacional. Co-fundador del Instituto Relacional y director del programa de Dirección Avanzada en RRHH en ESADE. Co-autor de "Anticípate" y "Relaciones Poderosas".
                    </p>
                  </div>
                  
                  {/* Gabriela Naranjo */}
                  <div className="text-center">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-3"></div>
                    <h3 className="text-base font-bold mb-1">Gabriela Naranjo</h3>
                    <p className="text-gray-600 mb-2 text-xs">Directora Fundación Nueva Educación</p>
                    <p className="text-xs leading-relaxed">
                      Psicóloga clínica y organizacional, Máster en Dirección de Personas (Universidad Ramón Llull). Creadora de la ATE-FNE reconocida por MINEDUC. Trabaja para que la educación esté centrada en la vida y experiencia del estudiante.
                    </p>
                  </div>
                </div>
                
                <div className="flex justify-center gap-6">
                  <div className="grid md:grid-cols-2 gap-6 max-w-2xl">
                    {/* Brent Curtis */}
                    <div className="text-center">
                      <div className="w-32 h-32 bg-black rounded-full mx-auto mb-3"></div>
                      <h3 className="text-base font-bold mb-1">Brent Curtis</h3>
                      <p className="text-gray-600 mb-2 text-xs">Teólogo y Director de Vinculación</p>
                      <p className="text-xs leading-relaxed">
                        Encargado de la vinculación con universidades, entidades gubernamentales y organismos internacionales. Experto en redes sociales, educación online y producción de eventos participativos de gran formato.
                      </p>
                    </div>
                    
                    {/* Mora Del Fresno */}
                    <div className="text-center">
                      <div className="w-32 h-32 bg-black rounded-full mx-auto mb-3"></div>
                      <h3 className="text-base font-bold mb-1">Mora Del Fresno</h3>
                      <p className="text-gray-600 mb-2 text-xs">Coordinadora Académica FNE</p>
                      <p className="text-xs leading-relaxed">
                        Lic. en Ciencias de la Educación (UdeSA), Máster en Neuroeducación (UB). Responsable de la Unidad de Educación del Instituto Relacional Barcelona. Especialista en gestión pedagógica y Educación Relacional.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Equipo Internacional */}
              <div>
                <div className="text-center mb-12">
                  <h2 className="text-4xl font-black uppercase mb-6">EQUIPO INTERNACIONAL</h2>
                  <p className="text-lg leading-relaxed max-w-3xl mx-auto">
                    Consultores educativos especializados en innovación pedagógica con más de 20 años de experiencia transformando la educación en España y Latinoamérica.
                  </p>
                </div>
                
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                  {/* Coral Regí */}
                  <div className="text-center">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-3"></div>
                    <h3 className="text-base font-bold mb-1">Coral Regí</h3>
                    <p className="text-gray-600 mb-2 text-xs">Ex-Directora Escuela Virolai</p>
                    <p className="text-xs leading-relaxed">
                      Bióloga y educadora por vocación. Asesora internacional de escuelas de vanguardia. Miembro del comité científico de Educación Mañana y del Consejo Escolar de Cataluña. Colabora con Fundación Bofill, Carulla y es miembro del Comité Internacional FNE.
                    </p>
                  </div>
                  
                  {/* Jordi Mussons */}
                  <div className="text-center">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-3"></div>
                    <h3 className="text-base font-bold mb-1">Jordi Mussons</h3>
                    <p className="text-gray-600 mb-2 text-xs">Director Escuela Sadako</p>
                    <p className="text-xs leading-relaxed">
                      Maestro y biólogo. Director de Sadako desde 2006, referente internacional en innovación educativa. Autor de "Reinventar La Escuela". Su compromiso con una escuela de oportunidades lo ha convertido en personalidad relevante de la educación. Miembro de la junta directiva de la AEC.
                    </p>
                  </div>
                  
                  {/* Boris Mir */}
                  <div className="text-center">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-3"></div>
                    <h3 className="text-base font-bold mb-1">Boris Mir</h3>
                    <p className="text-gray-600 mb-2 text-xs">Director Instituto Angela Ferrer</p>
                    <p className="text-xs leading-relaxed">
                      Ex-director adjunto del Programa Escola Nova 21. Fundador del Instituto-Escuela Les Vinyes. Experto en transformación educativa, evaluación formativa y liderazgo. Formador universitario y consultor en gestión del cambio.
                    </p>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                  {/* Pepe Menéndez */}
                  <div className="text-center">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-3"></div>
                    <h3 className="text-base font-bold mb-1">Pepe Menéndez</h3>
                    <p className="text-gray-600 mb-2 text-xs">Ex-Director Adjunto Jesuitas Educació</p>
                    <p className="text-xs leading-relaxed">
                      Promotor del proyecto Horizonte 2020 que revolucionó la educación jesuita. Autor de "Educar para la Vida" y "Escuelas que valgan la pena". Experto en liderazgo de procesos de cambio educativo.
                    </p>
                  </div>
                  
                  {/* Sandra Entrena */}
                  <div className="text-center">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-3"></div>
                    <h3 className="text-base font-bold mb-1">Sandra Entrena</h3>
                    <p className="text-gray-600 mb-2 text-xs">Directora Escuela Virolai</p>
                    <p className="text-xs leading-relaxed">
                      Actual Directora de la Escuela Virolai, formadora de profesores en Barcelona y pilar del proyecto Escola Nova21. Consultora internacional finalista en los Wise Awards 2017.
                    </p>
                  </div>
                  
                  {/* Anna Comas */}
                  <div className="text-center">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-3"></div>
                    <h3 className="text-base font-bold mb-1">Anna Comas</h3>
                    <p className="text-gray-600 mb-2 text-xs">Ex-Directora La Maquinista</p>
                    <p className="text-xs leading-relaxed">
                      Licenciada en Filosofía y Ciencias de la Educación. Participó en Escola Nova21 y Futuros de la Educación (UNESCO Catalunya). Mentora en el PMT de Baleares.
                    </p>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-3 gap-6 mb-12">
                  {/* Elena Guillén */}
                  <div className="text-center">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-3"></div>
                    <h3 className="text-base font-bold mb-1">Elena Guillén</h3>
                    <p className="text-gray-600 mb-2 text-xs">Directora Escola Octavio Paz</p>
                    <p className="text-xs leading-relaxed">
                      Directora de la Escola Octavio Paz, escuela pública ícono de cambio en Barcelona. Lidera un proceso de transformación basado en relaciones humanas, cohesión comunitaria y pensamiento crítico.
                    </p>
                  </div>
                  
                  {/* Sergi Del Moral */}
                  <div className="text-center">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-3"></div>
                    <h3 className="text-base font-bold mb-1">Sergi Del Moral</h3>
                    <p className="text-gray-600 mb-2 text-xs">Director Institut Escola Les Vinyes</p>
                    <p className="text-xs leading-relaxed">
                      Licenciado en Matemáticas. Centro premiado por Departament d'Educació y Escola Nova 21. Ex-profesor UB y responsable de innovación SIRE. Experto en ABP, personalización del aprendizaje y didáctica matemática.
                    </p>
                  </div>
                  
                  {/* Betlem Cuesta */}
                  <div className="text-center">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-3"></div>
                    <h3 className="text-base font-bold mb-1">Betlem Cuesta</h3>
                    <p className="text-gray-600 mb-2 text-xs">Coordinadora Pedagógica Les Vinyes</p>
                    <p className="text-xs leading-relaxed">
                      Licenciada en Filosofía, Máster en Estudios Feministas (UB) y Cooperación al Desarrollo (UPV). Miembro Forum "Futurs de l'educació" UNESCO. Experiencia en proyectos de cooperación en Kosovo y Rwanda.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-[#F5F5F5] rounded-lg p-8">
                <h3 className="text-2xl font-bold text-center mb-6">Red de Consultores Especializados</h3>
                <div className="grid md:grid-cols-3 gap-6 text-center">
                  <div>
                    <h4 className="font-semibold mb-2">Innovación Pedagógica</h4>
                    <p className="text-sm text-gray-600">Metodologías activas, ABP, pensamiento visible</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Liderazgo Educativo</h4>
                    <p className="text-sm text-gray-600">Gestión del cambio, cultura escolar</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Evaluación Formativa</h4>
                    <p className="text-sm text-gray-600">Feedback efectivo, rúbricas, portafolios</p>
                  </div>
                </div>
                <div className="text-center mt-8">
                  <a href="/equipo-consultores.pdf" target="_blank" className="inline-flex items-center underline text-lg hover:text-gray-600 transition-colors">
                    <span>Conoce a todo el equipo</span>
                    <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </section>
          
          {/* Section 4: Contacto */}
          <section id="contacto" className="py-24 bg-[#F5F5F5]">
            <div className="max-w-[1040px] mx-auto px-6">
              <div className="lg:flex gap-12">
                <div className="lg:w-[55%] mb-8 lg:mb-0">
                  <h2 className="text-4xl font-black uppercase mb-6">CONTÁCTANOS</h2>
                  <p className="text-lg leading-relaxed mb-8">
                    ¿Listo para transformar tu institución educativa? Conversemos sobre cómo podemos acompañar tu proceso de transformación.
                  </p>
                  
                  <div className="space-y-6">
                    <div className="flex items-start">
                      <svg className="w-6 h-6 text-gray-600 mr-3 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                      </svg>
                      <div>
                        <p className="font-semibold">Email</p>
                        <a href="mailto:info@nuevaeducacion.org" className="text-gray-600 hover:text-black transition-colors">info@nuevaeducacion.org</a>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <svg className="w-6 h-6 text-gray-600 mr-3 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                      </svg>
                      <div>
                        <p className="font-semibold">Dirección</p>
                        <p className="text-gray-600">Santiago, Chile</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <svg className="w-6 h-6 text-gray-600 mr-3 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      <div>
                        <p className="font-semibold">Certificación</p>
                        <p className="text-gray-600">Agencia Técnica Educativa certificada</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="lg:w-[45%]">
                  <div className="bg-white rounded-lg p-8 shadow-lg">
                    <h3 className="text-2xl font-bold mb-6">Impacto en Cifras</h3>
                    <div className="space-y-6">
                      <div className="text-center">
                        <div className="text-4xl font-black mb-2 text-gray-900">60+</div>
                        <p className="text-base text-gray-600">Colegios en nuestra red</p>
                      </div>
                      <div className="text-center">
                        <div className="text-4xl font-black mb-2 text-gray-900">100 mil</div>
                        <p className="text-base text-gray-600">Niños en diversos programas</p>
                      </div>
                      <div className="text-center">
                        <div className="text-4xl font-black mb-2 text-gray-900">9</div>
                        <p className="text-base text-gray-600">Regiones de Chile</p>
                      </div>
                      <div className="text-center">
                        <div className="text-4xl font-black mb-2 text-gray-900">20+</div>
                        <p className="text-base text-gray-600">Años de experiencia</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
        
        {/* Footer */}
        <footer className="py-12 bg-white border-t border-gray-200">
          <div className="max-w-[1040px] mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="mb-4 md:mb-0">
                <p className="text-sm text-gray-600">© 2025 Fundación Nueva Educación</p>
                <p className="text-xs text-gray-500">Agencia Técnica Educativa certificada</p>
              </div>
              <div className="flex items-center space-x-6">
                <a href="mailto:info@nuevaeducacion.org" className="text-sm text-gray-600 hover:text-black transition-colors">
                  info@nuevaeducacion.org
                </a>
                <Link href="/login" className="text-sm text-gray-600 hover:text-black transition-colors border border-gray-300 rounded-full px-4 py-2">
                  Acceder a la Plataforma
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}