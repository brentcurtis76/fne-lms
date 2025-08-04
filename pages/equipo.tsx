import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function EquipoPage() {
  return (
    <>
      <Head>
        <title>Nuestro Equipo - Fundación Nueva Educación</title>
        <meta name="description" content="Conoce al equipo de expertos en educación de la Fundación Nueva Educación, comprometidos con la transformación educativa en Chile y el mundo." />
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
        `}</style>
      </Head>

      <div className="bg-white text-black">
        {/* Header */}
        <header className="fixed top-8 left-0 right-0 z-50 transition-all duration-300">
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
                <Link href="/#pasantias" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">
                  PASANTÍAS
                </Link>
                <Link href="/#aula-generativa" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">
                  AULA GENERATIVA
                </Link>
                <Link href="/noticias" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">
                  NOTICIAS
                </Link>
                <Link href="/equipo" className="text-base font-medium text-black font-semibold">
                  EQUIPO
                </Link>
                <Link href="/#contacto" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors">
                  CONTACTO
                </Link>
              </nav>
              
              {/* Login Button */}
              <div className="hidden lg:flex items-center space-x-4">
                <Link href="/login" className="text-base font-medium text-gray-800 hover:text-gray-600 transition-colors border border-gray-300 rounded-full px-4 py-2">
                  PLATAFORMA DE CRECIMIENTO
                </Link>
              </div>
              
              {/* Mobile Menu Button */}
              <button className="lg:hidden p-2 text-gray-800">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="pt-32">
          {/* Breadcrumb */}
          <section className="py-8 bg-gray-50">
            <div className="max-w-6xl mx-auto px-6">
              <nav className="flex items-center space-x-2 text-sm text-gray-600">
                <Link href="/" className="hover:text-black transition-colors">
                  Inicio
                </Link>
                <span>/</span>
                <span className="text-black">Equipo</span>
              </nav>
            </div>
          </section>

          {/* Hero Section */}
          <section className="py-16">
            <div className="max-w-6xl mx-auto px-6 text-center">
              <div className="inline-block bg-black text-white px-6 py-2 rounded-full text-sm font-medium uppercase tracking-wide mb-6">
                Nuestro Equipo
              </div>
              <h1 className="text-5xl lg:text-6xl font-black uppercase mb-6">
                TRANSFORMANDO LA EDUCACIÓN
              </h1>
              <p className="text-xl leading-relaxed max-w-4xl mx-auto text-gray-700">
                Expertos comprometidos con la innovación educativa y el desarrollo de metodologías que potencian el crecimiento integral de cada estudiante
              </p>
            </div>
          </section>

          {/* Equipo FNE */}
          <section className="py-16">
            <div className="max-w-[1040px] mx-auto px-6">
              <div className="mb-20">
                <div className="text-center mb-12">
                  <h2 className="text-4xl font-black uppercase mb-6">EQUIPO FNE</h2>
                  <p className="text-lg leading-relaxed max-w-3xl mx-auto">
                    El equipo central de la Fundación Nueva Educación, comprometido con la transformación educativa en Chile y el mundo.
                  </p>
                </div>
                
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                  {/* Arnoldo Cisternas */}
                  <div className="text-center bg-white rounded-xl p-6 shadow-lg">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-4"></div>
                    <h3 className="text-lg font-bold mb-2">Arnoldo Cisternas</h3>
                    <p className="text-gray-600 mb-3 text-sm font-medium">Psicólogo y Fundador</p>
                    <p className="text-sm leading-relaxed text-gray-700">
                      Especializado en Comportamiento Organizacional y Coaching Relacional. Co-fundador del Instituto Relacional y presidente de la FNE. Desarrolló el Enfoque Relacional y es autor de "Educación Relacional" y "Relaciones Poderosas".
                    </p>
                  </div>
                  
                  {/* Joan Quintana */}
                  <div className="text-center bg-white rounded-xl p-6 shadow-lg">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-4"></div>
                    <h3 className="text-lg font-bold mb-2">Joan Quintana</h3>
                    <p className="text-gray-600 mb-3 text-sm font-medium">Psicólogo y Director Instituto Relacional</p>
                    <p className="text-sm leading-relaxed text-gray-700">
                      Especializado en Comportamiento Organizacional y Coaching Relacional. Co-fundador del Instituto Relacional y director del programa de Dirección Avanzada en RRHH en ESADE. Co-autor de "Anticípate" y "Relaciones Poderosas".
                    </p>
                  </div>
                  
                  {/* Gabriela Naranjo */}
                  <div className="text-center bg-white rounded-xl p-6 shadow-lg">
                    <div className="w-32 h-32 bg-black rounded-full mx-auto mb-4"></div>
                    <h3 className="text-lg font-bold mb-2">Gabriela Naranjo</h3>
                    <p className="text-gray-600 mb-3 text-sm font-medium">Directora Fundación Nueva Educación</p>
                    <p className="text-sm leading-relaxed text-gray-700">
                      Psicóloga clínica y organizacional, Máster en Dirección de Personas (Universidad Ramón Llull). Creadora de la ATE-FNE reconocida por MINEDUC. Trabaja para que la educación esté centrada en la vida y experiencia del estudiante.
                    </p>
                  </div>
                </div>
                
                <div className="flex justify-center gap-6">
                  <div className="grid md:grid-cols-2 gap-6 max-w-2xl">
                    {/* Brent Curtis */}
                    <div className="text-center bg-white rounded-xl p-6 shadow-lg">
                      <div className="w-32 h-32 bg-black rounded-full mx-auto mb-4"></div>
                      <h3 className="text-lg font-bold mb-2">Brent Curtis</h3>
                      <p className="text-gray-600 mb-3 text-sm font-medium">Teólogo y Director de Vinculación</p>
                      <p className="text-sm leading-relaxed text-gray-700">
                        Encargado de la vinculación con universidades, entidades gubernamentales y organismos internacionales. Experto en redes sociales, educación online y producción de eventos participativos de gran formato.
                      </p>
                    </div>
                    
                    {/* Mora Del Fresno */}
                    <div className="text-center bg-white rounded-xl p-6 shadow-lg">
                      <div className="w-32 h-32 bg-black rounded-full mx-auto mb-4"></div>
                      <h3 className="text-lg font-bold mb-2">Mora Del Fresno</h3>
                      <p className="text-gray-600 mb-3 text-sm font-medium">Coordinadora Académica FNE</p>
                      <p className="text-sm leading-relaxed text-gray-700">
                        Lic. en Ciencias de la Educación (UdeSA), Máster en Neuroeducación (UB). Responsable de la Unidad de Educación del Instituto Relacional Barcelona. Especialista en gestión pedagógica y Educación Relacional.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Equipo Internacional */}
          <section className="py-16 bg-gray-50">
            <div className="max-w-[1040px] mx-auto px-6">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-black uppercase mb-6">EQUIPO INTERNACIONAL</h2>
                <p className="text-lg leading-relaxed max-w-3xl mx-auto">
                  Consultores educativos especializados en innovación pedagógica con más de 20 años de experiencia transformando la educación en España y Latinoamérica.
                </p>
              </div>
              
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                {/* Coral Regí */}
                <div className="text-center bg-white rounded-xl p-6 shadow-lg">
                  <div className="w-32 h-32 bg-black rounded-full mx-auto mb-4"></div>
                  <h3 className="text-lg font-bold mb-2">Coral Regí</h3>
                  <p className="text-gray-600 mb-3 text-sm font-medium">Ex-Directora Escuela Virolai</p>
                  <p className="text-sm leading-relaxed text-gray-700">
                    Bióloga y educadora por vocación. Asesora internacional de escuelas de vanguardia. Miembro del comité científico de Educación Mañana y del Consejo Escolar de Cataluña. Colabora con Fundación Bofill, Carulla y es miembro del Comité Internacional FNE.
                  </p>
                </div>
                
                {/* Jordi Mussons */}
                <div className="text-center bg-white rounded-xl p-6 shadow-lg">
                  <div className="w-32 h-32 bg-black rounded-full mx-auto mb-4"></div>
                  <h3 className="text-lg font-bold mb-2">Jordi Mussons</h3>
                  <p className="text-gray-600 mb-3 text-sm font-medium">Director Escuela Sadako</p>
                  <p className="text-sm leading-relaxed text-gray-700">
                    Maestro y biólogo. Director de Sadako desde 2006, referente internacional en innovación educativa. Autor de "Reinventar La Escuela". Su compromiso con una escuela de oportunidades lo ha convertido en personalidad relevante de la educación. Miembro de la junta directiva de la AEC.
                  </p>
                </div>
                
                {/* Boris Mir */}
                <div className="text-center bg-white rounded-xl p-6 shadow-lg">
                  <div className="w-32 h-32 bg-black rounded-full mx-auto mb-4"></div>
                  <h3 className="text-lg font-bold mb-2">Boris Mir</h3>
                  <p className="text-gray-600 mb-3 text-sm font-medium">Director Instituto Angela Ferrer</p>
                  <p className="text-sm leading-relaxed text-gray-700">
                    Ex-director adjunto del Programa Escola Nova 21. Fundador del Instituto-Escuela Les Vinyes. Experto en transformación educativa, evaluación formativa y liderazgo. Formador universitario y consultor en gestión del cambio.
                  </p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                {/* Pepe Menéndez */}
                <div className="text-center bg-white rounded-xl p-6 shadow-lg">
                  <div className="w-32 h-32 bg-black rounded-full mx-auto mb-4"></div>
                  <h3 className="text-lg font-bold mb-2">Pepe Menéndez</h3>
                  <p className="text-gray-600 mb-3 text-sm font-medium">Ex-Director Adjunto Jesuitas Educació</p>
                  <p className="text-sm leading-relaxed text-gray-700">
                    Promotor del proyecto Horizonte 2020 que revolucionó la educación jesuita. Autor de "Educar para la Vida" y "Escuelas que valgan la pena". Experto en liderazgo de procesos de cambio educativo.
                  </p>
                </div>
                
                {/* Sandra Entrena */}
                <div className="text-center bg-white rounded-xl p-6 shadow-lg">
                  <div className="w-32 h-32 bg-black rounded-full mx-auto mb-4"></div>
                  <h3 className="text-lg font-bold mb-2">Sandra Entrena</h3>
                  <p className="text-gray-600 mb-3 text-sm font-medium">Directora Escuela Virolai</p>
                  <p className="text-sm leading-relaxed text-gray-700">
                    Actual Directora de la Escuela Virolai, formadora de profesores en Barcelona y pilar del proyecto Escola Nova21. Consultora internacional finalista en los Wise Awards 2017.
                  </p>
                </div>
                
                {/* Anna Comas */}
                <div className="text-center bg-white rounded-xl p-6 shadow-lg">
                  <div className="w-32 h-32 bg-black rounded-full mx-auto mb-4"></div>
                  <h3 className="text-lg font-bold mb-2">Anna Comas</h3>
                  <p className="text-gray-600 mb-3 text-sm font-medium">Ex-Directora La Maquinista</p>
                  <p className="text-sm leading-relaxed text-gray-700">
                    Licenciada en Filosofía y Ciencias de la Educación. Participó en Escola Nova21 y Futuros de la Educación (UNESCO Catalunya). Mentora en el PMT de Baleares.
                  </p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-3 gap-6 mb-12">
                {/* Elena Guillén */}
                <div className="text-center bg-white rounded-xl p-6 shadow-lg">
                  <div className="w-32 h-32 bg-black rounded-full mx-auto mb-4"></div>
                  <h3 className="text-lg font-bold mb-2">Elena Guillén</h3>
                  <p className="text-gray-600 mb-3 text-sm font-medium">Directora Escola Octavio Paz</p>
                  <p className="text-sm leading-relaxed text-gray-700">
                    Directora de la Escola Octavio Paz, escuela pública ícono de cambio en Barcelona. Lidera un proceso de transformación basado en relaciones humanas, cohesión comunitaria y pensamiento crítico.
                  </p>
                </div>
                
                {/* Sergi Del Moral */}
                <div className="text-center bg-white rounded-xl p-6 shadow-lg">
                  <div className="w-32 h-32 bg-black rounded-full mx-auto mb-4"></div>
                  <h3 className="text-lg font-bold mb-2">Sergi Del Moral</h3>
                  <p className="text-gray-600 mb-3 text-sm font-medium">Director Institut Escola Les Vinyes</p>
                  <p className="text-sm leading-relaxed text-gray-700">
                    Licenciado en Matemáticas. Centro premiado por Departament d'Educació y Escola Nova 21. Ex-profesor UB y responsable de innovación SIRE. Experto en ABP, personalización del aprendizaje y didáctica matemática.
                  </p>
                </div>
                
                {/* Betlem Cuesta */}
                <div className="text-center bg-white rounded-xl p-6 shadow-lg">
                  <div className="w-32 h-32 bg-black rounded-full mx-auto mb-4"></div>
                  <h3 className="text-lg font-bold mb-2">Betlem Cuesta</h3>
                  <p className="text-gray-600 mb-3 text-sm font-medium">Coordinadora Pedagógica Les Vinyes</p>
                  <p className="text-sm leading-relaxed text-gray-700">
                    Licenciada en Filosofía, Máster en Estudios Feministas (UB) y Cooperación al Desarrollo (UPV). Miembro Forum "Futurs de l'educació" UNESCO. Experiencia en proyectos de cooperación en Kosovo y Rwanda.
                  </p>
                </div>
              </div>

              {/* Consultores Especialización */}
              <div className="bg-black text-white rounded-2xl p-12">
                <h3 className="text-3xl font-bold text-center mb-8">Red de Consultores Especializados</h3>
                <div className="grid md:grid-cols-3 gap-8 text-center">
                  <div>
                    <h4 className="text-xl font-bold mb-4">Innovación Pedagógica</h4>
                    <p className="text-sm opacity-90">Metodologías activas, ABP, pensamiento visible</p>
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-4">Liderazgo Educativo</h4>
                    <p className="text-sm opacity-90">Gestión del cambio, cultura escolar</p>
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-4">Evaluación Formativa</h4>
                    <p className="text-sm opacity-90">Feedback efectivo, rúbricas, portafolios</p>
                  </div>
                </div>
                <div className="text-center mt-10">
                  <a href="/equipo-consultores.pdf" target="_blank" className="inline-flex items-center bg-white text-black rounded-full px-8 py-4 font-medium hover:bg-gray-100 transition-all duration-300">
                    <span>Conoce a todo el equipo</span>
                    <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="py-12 bg-white border-t border-gray-200">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="mb-4 md:mb-0">
                <p className="text-sm text-gray-600">© 2025 Fundación Nueva Educación</p>
                <p className="text-xs text-gray-500">Agencia Técnica Educativa certificada</p>
              </div>
              <div className="flex items-center space-x-6">
                <Link href="/" className="text-sm text-gray-600 hover:text-black transition-colors">
                  Inicio
                </Link>
                <Link href="/#pasantias" className="text-sm text-gray-600 hover:text-black transition-colors">
                  Pasantías
                </Link>
                <Link href="/#aula-generativa" className="text-sm text-gray-600 hover:text-black transition-colors">
                  Aula Generativa
                </Link>
                <Link href="/noticias" className="text-sm text-gray-600 hover:text-black transition-colors">
                  Noticias
                </Link>
                <Link href="/equipo" className="text-sm text-gray-600 hover:text-black transition-colors font-medium">
                  Equipo
                </Link>
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