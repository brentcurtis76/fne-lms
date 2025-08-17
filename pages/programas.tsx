import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Footer from '../components/Footer';

interface Program {
  id: string;
  title: string;
  subtitle: string;
  duration?: string;
  description: string;
  objectives: string[];
  activities: string[];
  results?: string[];
  icon: string;
  color: string;
  gradient: string;
}

const programs: Program[] = [
  {
    id: 'inspira',
    title: 'INSPIRA',
    subtitle: 'Viaja y sumérgete en una escuela de vanguardia educativa',
    duration: '2 semanas',
    description: 'INSPIRA es una experiencia diseñada para ampliar la mirada pedagógica y entregar respuestas concretas sobre cómo alcanzar paso a paso una educación de vanguardia para Chile.',
    objectives: [
      'Visitas Pedagógicas: Jornadas en colegios de vanguardia para conocer el proyecto educativo',
      'Estadia Pedagógica: Trabajo pedagógico en aula junto a un educador de vanguardia',
      'Conversatorios con Expertos: Sesiones de diálogo con expertos en educación de Cataluña',
      'Talleres de síntesis: Síntesis de aprendizajes y recursos compartidos',
      'Plataforma de registro: Bitácora de viaje compartida con documentación del cambio'
    ],
    activities: [
      'Jornadas de visitas a colegios de vanguardia',
      'Trabajo pedagógico directo en aula',
      'Diálogos con expertos educativos',
      'Síntesis de aprendizajes y desafíos',
      'Registro multimedia del viaje'
    ],
    icon: 'plane',
    color: 'from-[#FFC107] to-[#FFA000]',
    gradient: 'bg-gradient-to-br from-[#FFC107] via-[#FFB300] to-[#FFA000]'
  },
  {
    id: 'inicia',
    title: 'INICIA',
    subtitle: 'Introducción a la Nueva Educación',
    duration: '40-80 horas',
    description: 'Programa diseñado para establecimientos educacionales que desean conocer y discernir el inicio de un largo y profundo proceso de transformación de su cultura educativa.',
    objectives: [
      'Asesorar y formar al director y su equipo en liderazgo del cambio',
      'Acompañamiento al equipo de gestión para el proceso cultural',
      'Favorecer la emergencia de un sentido de urgencia compartido',
      'Visualizar un horizonte de transformación compartido',
      'Construir una línea base participativa rápida',
      'Identificar necesidades para implementación futura'
    ],
    activities: [
      'Asesoría Directiva y al equipo de gestión',
      'Talleres de formación con líderes de base',
      'Visitas internacionales a la escuela',
      'Plataforma de formación con cursos introductorios'
    ],
    results: [
      'Creación colectiva de proyecto de transformación',
      'Construcción de línea base de cambio',
      'Diseño de plan general para el primer año',
      'Elección de personas para INSPIRA en BCN'
    ],
    icon: 'lightbulb',
    color: 'from-[#0066CC] to-[#004499]',
    gradient: 'bg-gradient-to-br from-[#0066CC] via-[#0055BB] to-[#004499]'
  },
  {
    id: 'evoluciona',
    title: 'EVOLUCIONA',
    subtitle: 'Transformación profunda de la cultura educativa',
    description: 'Programa orientado hacia una profunda transformación de la cultura educativa de cada establecimiento de forma progresiva durante 3 años.',
    objectives: [
      'Asesoramiento en equipo de consultores expertos',
      'Flexibilidad de Evolución Cultural PROPIA',
      'Modelo universal para evolucionar con base en evolución cultural',
      'Transformación a medida para cada establecimiento'
    ],
    activities: [
      'Evolución del modelo pedagógico de Barcelona en flexibilidad',
      'Gestión y monitoreo del proceso ejecutivo cultural',
      'Asegurar apertura de servicios asesores y formación',
      'Plan en caso múltiple según cultura'
    ],
    icon: 'gears',
    color: 'from-[#FFC107] to-[#FFA000]',
    gradient: 'bg-gradient-to-br from-[#FFC107] via-[#FFB300] to-[#FFA000]'
  },
  {
    id: 'aula-generativa',
    title: 'AULA GENERATIVA',
    subtitle: 'Ecosistema de relaciones saludables para el crecimiento',
    description: 'El aula generativa busca optimizar los procesos y elevar los resultados en el crecimiento y aprendizaje de cada estudiante, fortaleciendo la calidad de los vínculos entre pares.',
    objectives: [
      'Construcción de ecosistema de relaciones saludables en el aula',
      'Desarrollo de autonomía, interdependencia y trabajo colaborativo',
      'Orientación al crecimiento individual y colectivo',
      'Desarrollo de mentalidad de crecimiento y valores'
    ],
    activities: [
      'Programa de educación relacional',
      'Programa de innovación pedagógica en el aula',
      'Programa de crecimiento personal',
      'Programa de prácticas generativas',
      'Programa de comunidades de crecimiento'
    ],
    results: [
      'Calidad de vida para educadores con aulas con motor propio',
      'Vínculos seguros y prosociales entre pares',
      'Conexión positiva con las familias',
      'Superación de la dicotomía Convivencia/Aprendizaje',
      'Síntesis hacia la mirada generativa'
    ],
    icon: 'network',
    color: 'from-[#0066CC] to-[#004499]',
    gradient: 'bg-gradient-to-br from-[#0066CC] via-[#0055BB] to-[#004499]'
  }
];

export default function ProgramasPage() {
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [activeTab, setActiveTab] = useState<'objectives' | 'activities' | 'results'>('objectives');

  const handleProgramClick = (program: Program) => {
    setSelectedProgram(program);
    setActiveTab('objectives');
  };

  const renderIcon = (iconName: string, className: string = "w-10 h-10") => {
    switch(iconName) {
      case 'plane':
        return (
          <svg className={className} fill="currentColor" viewBox="0 0 24 24">
            <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0011.5 2A1.5 1.5 0 0010 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
          </svg>
        );
      case 'lightbulb':
        return (
          <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
        );
      case 'gears':
        return (
          <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"/>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        );
      case 'network':
        return (
          <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"/>
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Head>
        <title>Programas - Fundación Nueva Educación</title>
        <meta name="description" content="Programas de transformación educativa de la Fundación Nueva Educación" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        
        {/* Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet" />
        
        {/* Tailwind CSS */}
        <script src="https://cdn.tailwindcss.com"></script>
      </Head>

      <div className="min-h-screen bg-white">
        {/* Header - matching index.tsx style */}
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
              <nav className="hidden lg:flex items-center space-x-7 xl:space-x-9">
                <a href="/#pasantias" className="text-sm font-medium text-gray-800 hover:text-gray-600 transition-colors">PASANTÍAS</a>
                <Link href="/programas" className="text-sm font-medium text-black">PROGRAMAS</Link>
                <Link href="/noticias" className="text-sm font-medium text-gray-800 hover:text-gray-600 transition-colors">NOTICIAS Y EVENTOS</Link>
                <Link href="/nosotros" className="text-sm font-medium text-gray-800 hover:text-gray-600 transition-colors">NOSOTROS</Link>
                <a href="/#red" className="text-sm font-medium text-gray-800 hover:text-gray-600 transition-colors">RED</a>
                <a href="/#contacto" className="text-sm font-medium text-gray-800 hover:text-gray-600 transition-colors">CONTACTO</a>
              </nav>
              
              {/* Login Button */}
              <div className="hidden lg:flex items-center">
                <Link href="/login" className="text-sm font-medium text-gray-800 hover:text-gray-600 transition-colors border border-gray-300 rounded-full px-4 py-2">
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
              <a href="/#pasantias" className="text-xl font-medium">PASANTÍAS</a>
              <Link href="/programas" className="text-xl font-medium">PROGRAMAS</Link>
              <Link href="/noticias" className="text-xl font-medium">NOTICIAS Y EVENTOS</Link>
              <Link href="/nosotros" className="text-xl font-medium">NOSOTROS</Link>
              <a href="/#red" className="text-xl font-medium">RED</a>
              <a href="/#contacto" className="text-xl font-medium">CONTACTO</a>
              <Link href="/login" className="border border-gray-300 rounded-full px-8 py-4 text-sm font-medium w-full text-center hover:bg-gray-100 transition-all duration-300">
                PLATAFORMA DE CRECIMIENTO
              </Link>
            </nav>
          </div>
        </div>

        {/* Hero Section - Matching Nosotros Style */}
        <section className="pt-64 pb-24 px-6 bg-gradient-to-b from-gray-50 to-white">
          <div className="max-w-7xl mx-auto">
            {/* Main Statement */}
            <div className="max-w-4xl mx-auto">
              <h1 className="text-5xl lg:text-6xl font-black uppercase mb-8 text-center transition-all duration-300 hover:text-[#FFC107] hover:scale-105 cursor-default">
                PROGRAMAS DE TRANSFORMACIÓN EDUCATIVA
              </h1>
              <p className="text-xl text-gray-700 leading-relaxed text-center">
                Rutas transformadoras hacia una nueva educación. Descubre nuestros programas diseñados 
                para acompañar a las comunidades educativas en su viaje hacia la innovación pedagógica 
                y el desarrollo integral de cada estudiante.
              </p>
            </div>
          </div>
        </section>

        {/* Programs Grid */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {programs.map((program, index) => (
              <div
                key={program.id}
                className="group relative transform transition-all duration-700 hover:scale-105 cursor-pointer"
                onClick={() => handleProgramClick(program)}
              >
                <div className={`relative overflow-hidden rounded-3xl shadow-xl ${program.gradient} p-1`}>
                  <div className="bg-white rounded-3xl p-8 h-full">
                    {/* Program Header */}
                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <div className="mb-4 text-gray-900">
                          {renderIcon(program.icon, "w-12 h-12")}
                        </div>
                        <h3 className="text-3xl font-black text-gray-900 mb-2">{program.title}</h3>
                        <p className="text-gray-600 font-medium">{program.subtitle}</p>
                        {program.duration && (
                          <span className="inline-block mt-2 bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm">
                            <svg className="inline w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {program.duration}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Program Description */}
                    <p className="text-gray-700 mb-6 line-clamp-3">{program.description}</p>
                    
                    {/* Preview of objectives */}
                    <div className="space-y-2 mb-6">
                      {program.objectives.slice(0, 2).map((objective, idx) => (
                        <div key={idx} className="flex items-start">
                          <span className="text-gray-400 mr-2">•</span>
                          <span className="text-sm text-gray-600 line-clamp-1">{objective}</span>
                        </div>
                      ))}
                      {program.objectives.length > 2 && (
                        <span className="text-sm text-gray-500 italic">
                          +{program.objectives.length - 2} más...
                        </span>
                      )}
                    </div>
                    
                    {/* CTA */}
                    <div className="flex items-center text-gray-900 font-semibold group-hover:translate-x-2 transition-transform">
                      <span>Explorar programa</span>
                      <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                {/* Hover effect glow */}
                <div className={`absolute inset-0 rounded-3xl ${program.gradient} opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500`}></div>
              </div>
            ))}
          </div>
        </section>

        {/* Program Detail Modal/Section */}
        {selectedProgram && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto relative animate-slideUp">
              {/* Close button */}
              <button
                onClick={() => setSelectedProgram(null)}
                className="absolute top-6 right-6 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors z-10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              {/* Header with gradient */}
              <div className={`${selectedProgram.gradient} p-8 rounded-t-3xl`}>
                <div className="text-white">
                  <div className="mb-4">
                    {renderIcon(selectedProgram.icon, "w-16 h-16")}
                  </div>
                  <h2 className="text-4xl font-black mb-2">{selectedProgram.title}</h2>
                  <p className="text-xl opacity-90">{selectedProgram.subtitle}</p>
                  {selectedProgram.duration && (
                    <span className="inline-block mt-4 bg-white/20 backdrop-blur text-white px-4 py-2 rounded-full">
                      <svg className="inline w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Duración: {selectedProgram.duration}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Content */}
              <div className="p-8">
                {/* Description */}
                <div className="mb-8">
                  <p className="text-lg text-gray-700 leading-relaxed">{selectedProgram.description}</p>
                </div>
                
                {/* Tabs */}
                <div className="border-b border-gray-200 mb-6">
                  <div className="flex space-x-8">
                    <button
                      onClick={() => setActiveTab('objectives')}
                      className={`pb-3 px-1 relative font-semibold transition-colors ${
                        activeTab === 'objectives' 
                          ? 'text-black' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Objetivos
                      {activeTab === 'objectives' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black"></div>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('activities')}
                      className={`pb-3 px-1 relative font-semibold transition-colors ${
                        activeTab === 'activities' 
                          ? 'text-black' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Actividades
                      {activeTab === 'activities' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black"></div>
                      )}
                    </button>
                    {selectedProgram.results && (
                      <button
                        onClick={() => setActiveTab('results')}
                        className={`pb-3 px-1 relative font-semibold transition-colors ${
                          activeTab === 'results' 
                            ? 'text-black' 
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Resultados
                        {activeTab === 'results' && (
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black"></div>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Tab Content */}
                <div className="space-y-4 animate-fadeIn">
                  {activeTab === 'objectives' && (
                    <div className="space-y-3">
                      {selectedProgram.objectives.map((objective, index) => (
                        <div 
                          key={index} 
                          className="flex items-start p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <span className="flex-shrink-0 w-8 h-8 bg-black text-white rounded-full flex items-center justify-center text-sm font-bold mr-4">
                            {index + 1}
                          </span>
                          <p className="text-gray-700">{objective}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {activeTab === 'activities' && (
                    <div className="space-y-3">
                      {selectedProgram.activities.map((activity, index) => (
                        <div 
                          key={index} 
                          className="flex items-start p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <span className="flex-shrink-0 w-8 h-8 bg-[#0066CC] text-white rounded-full flex items-center justify-center text-sm font-bold mr-4">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                          <p className="text-gray-700">{activity}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {activeTab === 'results' && selectedProgram.results && (
                    <div className="space-y-3">
                      {selectedProgram.results.map((result, index) => (
                        <div 
                          key={index} 
                          className="flex items-start p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <span className="flex-shrink-0 w-8 h-8 bg-[#FFC107] text-black rounded-full flex items-center justify-center text-sm font-bold mr-4">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                          </span>
                          <p className="text-gray-700">{result}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* CTA Buttons */}
                <div className="mt-8 flex flex-col sm:flex-row gap-4">
                  <Link href="/#contacto" className="flex-1 bg-black text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800 transition-colors text-center">
                    Contáctanos
                  </Link>
                  <button className="flex-1 border-2 border-black text-black px-6 py-3 rounded-full font-semibold hover:bg-black hover:text-white transition-colors">
                    Descargar brochure
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Timeline Section */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-black text-gray-900 mb-4">RUTA DE TRANSFORMACIÓN</h2>
              <p className="text-xl text-gray-600">El camino recomendado hacia la nueva educación</p>
            </div>
            
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-1/2 transform -translate-x-1/2 w-1 h-full bg-gradient-to-b from-blue-500 via-purple-500 to-orange-500"></div>
              
              {/* Timeline items */}
              <div className="space-y-12">
                {programs.map((program, index) => (
                  <div key={program.id} className={`flex items-center ${index % 2 === 0 ? 'flex-row' : 'flex-row-reverse'}`}>
                    <div className="flex-1">
                      <div className={`p-6 bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow ${index % 2 === 0 ? 'mr-8 text-right' : 'ml-8'}`}>
                        <div className={`mb-3 ${index % 2 === 0 ? 'flex justify-end' : 'flex justify-start'}`}>
                          <div className="text-gray-800">
                            {renderIcon(program.icon, "w-10 h-10")}
                          </div>
                        </div>
                        <h3 className="text-2xl font-bold mt-2 mb-2">{program.title}</h3>
                        <p className="text-gray-600">{program.subtitle}</p>
                      </div>
                    </div>
                    
                    {/* Timeline dot */}
                    <div className="relative z-10">
                      <div className="w-12 h-12 bg-white border-4 border-black rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold">{index + 1}</span>
                      </div>
                    </div>
                    
                    <div className="flex-1"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-gradient-to-br from-black via-gray-900 to-black">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-4xl font-black text-white mb-6">
              ¿LISTO PARA TRANSFORMAR TU INSTITUCIÓN?
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Comienza hoy el viaje hacia una educación de vanguardia
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/#contacto" className="bg-white text-black px-8 py-4 rounded-full font-semibold hover:bg-gray-100 transition-colors">
                Contáctanos
              </Link>
              <Link href="/login" className="border-2 border-white text-white px-8 py-4 rounded-full font-semibold hover:bg-white hover:text-black transition-colors">
                Accede a la plataforma
              </Link>
            </div>
          </div>
        </section>

        <Footer />
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .animate-slideUp {
          animation: slideUp 0.5s ease-out;
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        
        .line-clamp-1 {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        
        .line-clamp-3 {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </>
  );
}