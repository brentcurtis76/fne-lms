import React, { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function HomePage() {
  const [showFlipbook, setShowFlipbook] = React.useState(false);

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
            background: linear-gradient(135deg, 
              rgba(0,0,0,0.7) 0%, 
              rgba(0,0,0,0.4) 40%, 
              transparent 70%);
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
                <Link href="/equipo" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">EQUIPO</Link>
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
              <Link href="/equipo" className="text-xl font-medium">EQUIPO</Link>
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
              <source src="https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Videos/Fondo%20web.mov" type="video/quicktime" />
              {/* Fallback for browsers that don't support .mov */}
              <source src="https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Videos/Fondo%20web.mov" type="video/mp4" />
            </video>
            
            <div 
              className="absolute inset-0" 
              style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 40%, transparent 70%)'
              }}
            ></div>
            
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
          <section id="pasantias" className="py-24 relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-5">
              <div className="absolute inset-0" style={{
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(0,0,0,.05) 35px, rgba(0,0,0,.05) 70px)',
              }}></div>
            </div>
            
            <div className="max-w-[1040px] mx-auto px-6 relative">
              {/* Section Header */}
              <div className="text-center mb-16">
                <div className="inline-block bg-black text-white px-6 py-2 rounded-full text-sm font-medium uppercase tracking-wide mb-6">
                  Experiencia Internacional
                </div>
                <h2 className="text-5xl lg:text-6xl font-black uppercase mb-6">
                  PASANTÍAS EN BARCELONA
                </h2>
                <p className="text-xl leading-relaxed max-w-3xl mx-auto text-gray-700">
                  Transforma tu visión educativa con una experiencia única de innovación en el corazón de Europa
                </p>
              </div>

              {/* Content Grid */}
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                {/* Left Column - Content */}
                <div>
                  {/* Dates Highlight */}
                  <div className="bg-black text-white rounded-2xl p-8 mb-8 transform hover:scale-105 transition-transform duration-300">
                    <h3 className="text-2xl font-bold mb-4">Próximas Expediciones</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/20">
                        <p className="text-sm opacity-80">Primera Cohorte</p>
                        <p className="text-xl font-bold">Noviembre 2025</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/20">
                        <p className="text-sm opacity-80">Segunda Cohorte</p>
                        <p className="text-xl font-bold">Enero 2026</p>
                      </div>
                    </div>
                  </div>

                  {/* Benefits Grid */}
                  <div className="space-y-4 mb-8">
                    <h3 className="text-2xl font-bold mb-6">¿Qué incluye la experiencia?</h3>
                    
                    <div className="grid gap-4">
                      <div className="flex items-start bg-white border-2 border-black rounded-xl p-6 hover:bg-black hover:text-white group transition-all duration-300">
                        <div className="w-12 h-12 bg-black group-hover:bg-white rounded-lg flex items-center justify-center text-white group-hover:text-black font-bold text-xl mr-4 flex-shrink-0 transition-all duration-300">
                          1
                        </div>
                        <div>
                          <h4 className="font-bold text-lg mb-1">Codocencia en Aulas</h4>
                          <p className="text-gray-600 group-hover:text-gray-300 text-sm">Participa activamente en aulas de Nueva Educación como co-docente</p>
                        </div>
                      </div>

                      <div className="flex items-start bg-white border-2 border-black rounded-xl p-6 hover:bg-black hover:text-white group transition-all duration-300">
                        <div className="w-12 h-12 bg-black group-hover:bg-white rounded-lg flex items-center justify-center text-white group-hover:text-black font-bold text-xl mr-4 flex-shrink-0 transition-all duration-300">
                          2
                        </div>
                        <div>
                          <h4 className="font-bold text-lg mb-1">Visitas a Escuelas Innovadoras</h4>
                          <p className="text-gray-600 group-hover:text-gray-300 text-sm">Conoce de primera mano las metodologías más vanguardistas de Europa</p>
                        </div>
                      </div>

                      <div className="flex items-start bg-white border-2 border-black rounded-xl p-6 hover:bg-black hover:text-white group transition-all duration-300">
                        <div className="w-12 h-12 bg-black group-hover:bg-white rounded-lg flex items-center justify-center text-white group-hover:text-black font-bold text-xl mr-4 flex-shrink-0 transition-all duration-300">
                          3
                        </div>
                        <div>
                          <h4 className="font-bold text-lg mb-1">Talleres Especializados</h4>
                          <p className="text-gray-600 group-hover:text-gray-300 text-sm">Participa en workshops con expertos internacionales en educación</p>
                        </div>
                      </div>

                      <div className="flex items-start bg-white border-2 border-black rounded-xl p-6 hover:bg-black hover:text-white group transition-all duration-300">
                        <div className="w-12 h-12 bg-black group-hover:bg-white rounded-lg flex items-center justify-center text-white group-hover:text-black font-bold text-xl mr-4 flex-shrink-0 transition-all duration-300">
                          4
                        </div>
                        <div>
                          <h4 className="font-bold text-lg mb-1">Networking Internacional</h4>
                          <p className="text-gray-600 group-hover:text-gray-300 text-sm">Construye relaciones con líderes educativos de todo el mundo</p>
                        </div>
                      </div>

                      <div className="flex items-start bg-white border-2 border-black rounded-xl p-6 hover:bg-black hover:text-white group transition-all duration-300">
                        <div className="w-12 h-12 bg-black group-hover:bg-white rounded-lg flex items-center justify-center text-white group-hover:text-black font-bold text-xl mr-4 flex-shrink-0 transition-all duration-300">
                          5
                        </div>
                        <div>
                          <h4 className="font-bold text-lg mb-1">Certificación Internacional</h4>
                          <p className="text-gray-600 group-hover:text-gray-300 text-sm">Obtén reconocimiento oficial de tu participación y aprendizajes</p>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Right Column - Visual Gallery */}
                <div className="relative">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <div className="relative overflow-hidden rounded-2xl shadow-xl transform hover:scale-105 transition-transform duration-300">
                        <img src="/barcelona-innovation.jpg" alt="Innovación Educativa" className="w-full h-48 object-cover" />
                      </div>
                      <div className="relative overflow-hidden rounded-2xl shadow-xl transform hover:scale-105 transition-transform duration-300">
                        <img src="/barcelona-third.jpg" alt="Experiencia Educativa" className="w-full h-64 object-cover" />
                      </div>
                    </div>
                    <div className="space-y-4 pt-8">
                      <div className="relative overflow-hidden rounded-2xl shadow-xl transform hover:scale-105 transition-transform duration-300">
                        <img src="/barcelona-skyline.jpg" alt="Barcelona Skyline" className="w-full h-64 object-cover" />
                      </div>
                      <div className="relative overflow-hidden rounded-2xl shadow-xl transform hover:scale-105 transition-transform duration-300">
                        <img src="/barcelona-stats.jpg" alt="Estadísticas del Programa" className="w-full h-48 object-cover" />
                      </div>
                    </div>
                  </div>

                  {/* Floating Badge */}
                  <div className="absolute -top-4 -right-4 bg-black text-white rounded-full p-4 shadow-xl border-2 border-black">
                    <p className="text-xs font-bold">¡CUPOS</p>
                    <p className="text-xs font-bold">LIMITADOS!</p>
                  </div>

                  {/* CTA Buttons */}
                  <div className="flex flex-col gap-4 mt-6">
                    <button 
                      onClick={() => setShowFlipbook(true)}
                      className="inline-flex items-center justify-center bg-black text-white rounded-full px-8 py-4 font-medium hover:bg-gray-800 transition-all duration-300 transform hover:scale-105 w-full"
                    >
                      <span>Ver Programa Digital Interactivo</span>
                      <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                      </svg>
                    </button>
                    <a href="#contacto" className="inline-flex items-center justify-center border-2 border-black rounded-full px-8 py-4 font-medium hover:bg-black hover:text-white transition-all duration-300 w-full">
                      <span>Solicitar Información</span>
                      <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path>
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </section>
          
          {/* Section 2: Aula Generativa */}
          <section id="aula-generativa" className="py-24 bg-[#F8F8F8] relative overflow-hidden">
            {/* Subtle Background Element */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-black/5 rounded-full transform translate-x-32 -translate-y-32"></div>
            
            <div className="max-w-[1040px] mx-auto px-6 relative">
              {/* Section Header */}
              <div className="text-center mb-16">
                <div className="inline-block bg-black text-white px-6 py-2 rounded-full text-sm font-medium uppercase tracking-wide mb-6">
                  Metodología Los Pellines
                </div>
                <h2 className="text-5xl lg:text-6xl font-black uppercase mb-6">
                  AULA GENERATIVA
                </h2>
                <p className="text-xl leading-relaxed max-w-3xl mx-auto text-gray-700">
                  Hacia un ecosistema de relaciones saludables para el crecimiento de cada estudiante
                </p>
              </div>

              {/* Content Grid */}
              <div className="grid lg:grid-cols-2 gap-16 items-start">
                {/* Left Column - Images */}
                <div className="space-y-6">
                  <div className="relative overflow-hidden rounded-2xl shadow-xl">
                    <img src="/los-pellines-team.gif" alt="Equipo Los Pellines" className="w-full h-64 object-cover" />
                  </div>
                  <div className="relative overflow-hidden rounded-2xl shadow-xl">
                    <img src="/aula-generativa-activity.jpg" alt="Actividad colaborativa" className="w-full h-80 object-cover" />
                  </div>
                  
                  {/* Stats Card */}
                  <div className="bg-black text-white rounded-2xl p-8">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <p className="text-3xl font-bold mb-2">30+</p>
                        <p className="text-sm opacity-90">Años de experiencia</p>
                      </div>
                      <div>
                        <p className="text-3xl font-bold mb-2">80k+</p>
                        <p className="text-sm opacity-90">Niños impactados</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column - Content */}
                <div>
                  {/* Heritage Story */}
                  <div className="bg-white rounded-2xl p-8 shadow-lg mb-8">
                    <h3 className="text-2xl font-bold mb-4">Nuestra Historia</h3>
                    <p className="text-gray-700 leading-relaxed">
                      En Los Pellines nos hemos dedicado por más de 30 años al cuidado y fortalecimiento de la calidad de las relaciones. Hoy llevamos este "espíritu" a la sala de clases con una propuesta que pone en el centro el Aprendizaje con Sentido.
                    </p>
                  </div>

                  {/* Key Characteristics */}
                  <div className="mb-8">
                    <h3 className="text-2xl font-bold mb-6">Características de un Aula Generativa</h3>
                    
                    <div className="grid gap-4">
                      <div className="bg-white rounded-xl p-6 shadow-lg border-l-4 border-black">
                        <h4 className="font-bold text-lg mb-2">Motivación Compartida</h4>
                        <p className="text-gray-600 text-sm">Estudiantes y profesores altamente motivados trabajando juntos</p>
                      </div>

                      <div className="bg-white rounded-xl p-6 shadow-lg border-l-4 border-black">
                        <h4 className="font-bold text-lg mb-2">Convivencia como Motor</h4>
                        <p className="text-gray-600 text-sm">Las relaciones saludables impulsan el aprendizaje significativo</p>
                      </div>

                      <div className="bg-white rounded-xl p-6 shadow-lg border-l-4 border-black">
                        <h4 className="font-bold text-lg mb-2">Identidad Colectiva</h4>
                        <p className="text-gray-600 text-sm">Cultura de curso fortalecida con identidad positiva compartida</p>
                      </div>

                      <div className="bg-white rounded-xl p-6 shadow-lg border-l-4 border-black">
                        <h4 className="font-bold text-lg mb-2">Aprendizaje Cooperativo</h4>
                        <p className="text-gray-600 text-sm">Los estudiantes enseñan, explican y reflexionan entre pares</p>
                      </div>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="flex justify-end">
                    <a href="/aula-generativa.pdf" target="_blank" className="inline-flex items-center bg-black text-white rounded-full px-8 py-4 font-medium hover:bg-gray-800 transition-all duration-300 transform hover:scale-105">
                      <span>Descargar Programa Completo</span>
                      <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                      </svg>
                    </a>
                  </div>
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

        {/* Flipbook Modal */}
        {showFlipbook && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg w-full max-w-6xl h-[85vh] relative">
              {/* Modal Header */}
              <div className="absolute top-0 left-0 right-0 bg-white rounded-t-lg border-b border-gray-200 p-4 flex items-center justify-between z-10">
                <h3 className="text-lg font-bold">Programa de Pasantías Barcelona 2025-2026</h3>
                <button 
                  onClick={() => setShowFlipbook(false)}
                  className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
                  aria-label="Cerrar"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
              
              {/* Iframe Container */}
              <div className="pt-16 h-full">
                <iframe 
                  allowFullScreen
                  allow="clipboard-write" 
                  scrolling="no" 
                  className="fp-iframe" 
                  style={{ 
                    border: '1px solid lightgray', 
                    width: '100%', 
                    height: '100%',
                    borderRadius: '0 0 0.5rem 0.5rem'
                  }}
                  src="https://heyzine.com/flip-book/9723a41fa1.html"
                />
              </div>
              
              {/* External Link Option */}
              <div className="absolute bottom-4 left-4">
                <a 
                  href="https://heyzine.com/flip-book/9723a41fa1.html" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-600 hover:text-black underline"
                >
                  Abrir en nueva pestaña →
                </a>
              </div>
            </div>
          </div>
        )}
        
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