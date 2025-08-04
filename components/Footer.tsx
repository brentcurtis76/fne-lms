import React from 'react';
import Link from 'next/link';

interface FooterProps {
  className?: string;
}

export default function Footer({ className = '' }: FooterProps) {
  return (
    <footer className={`bg-black text-white relative overflow-hidden ${className}`}>
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,.05) 35px, rgba(255,255,255,.05) 70px)',
        }}></div>
      </div>
      
      <div className="relative">
        {/* Main Footer Content */}
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            
            {/* Brand Column */}
            <div className="lg:col-span-2">
              <div className="mb-6">
                <img 
                  src="/Logo BW.png?v=3" 
                  alt="Fundación Nueva Educación" 
                  className="h-16 w-auto filter invert" 
                />
              </div>
              <p className="text-white/80 leading-relaxed mb-6 max-w-md">
                Acompañamos a las comunidades educativas a dar el salto hacia una Nueva Educación basada en la autonomía y la colaboración para la expresión plena del potencial de cada estudiante.
              </p>
              
              {/* Social Links */}
              <div className="flex space-x-4">
                <a href="mailto:info@nuevaeducacion.org" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                  </svg>
                </a>
                <a href="https://linkedin.com/company/fundacion-nueva-educacion" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>
              </div>
            </div>
            
            {/* Navigation Links */}
            <div>
              <h4 className="text-lg font-bold mb-6">Navegación</h4>
              <ul className="space-y-3">
                <li><Link href="/#pasantias" className="text-white/70 hover:text-white transition-colors">Pasantías en Barcelona</Link></li>
                <li><Link href="/#aula-generativa" className="text-white/70 hover:text-white transition-colors">Aula Generativa</Link></li>
                <li><Link href="/noticias" className="text-white/70 hover:text-white transition-colors">Noticias</Link></li>
                <li><Link href="/equipo" className="text-white/70 hover:text-white transition-colors">Equipo</Link></li>
                <li><Link href="/#contacto" className="text-white/70 hover:text-white transition-colors">Contacto</Link></li>
              </ul>
            </div>
            
            {/* Contact & Platform */}
            <div>
              <h4 className="text-lg font-bold mb-6">Contacto</h4>
              <ul className="space-y-3">
                <li>
                  <a href="mailto:info@nuevaeducacion.org" className="text-white/70 hover:text-white transition-colors flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                    </svg>
                    info@nuevaeducacion.org
                  </a>
                </li>
                <li className="text-white/70 flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  </svg>
                  Santiago, Chile
                </li>
              </ul>
              
              <div className="mt-6">
                <Link href="/login" className="inline-flex items-center bg-white text-black rounded-full px-6 py-3 font-medium hover:bg-gray-100 transition-colors">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                  </svg>
                  Plataforma de Crecimiento
                </Link>
              </div>
            </div>
            
          </div>
        </div>
        
        {/* Impact Stats Bar */}
        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div>
                <div className="text-2xl font-bold text-white mb-1">60+</div>
                <div className="text-sm text-white/70">Colegios en red</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white mb-1">100k+</div>
                <div className="text-sm text-white/70">Niños impactados</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white mb-1">9</div>
                <div className="text-sm text-white/70">Regiones</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white mb-1">20+</div>
                <div className="text-sm text-white/70">Años transformando</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Bottom Bar */}
        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <div className="text-sm text-white/70">
                © 2025 Fundación Nueva Educación. Todos los derechos reservados.
              </div>
              <div className="flex items-center space-x-6 text-sm">
                <a href="/privacy" className="text-white/70 hover:text-white transition-colors">Política de Privacidad</a>
                <a href="/terms" className="text-white/70 hover:text-white transition-colors">Términos de Uso</a>
                <span className="text-white/50">|</span>
                <span className="text-white/70">ATE certificada por RPA Mineduc</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}