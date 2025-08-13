import React, { useState } from 'react';
import Link from 'next/link';
import PrivacyPolicyModal from './PrivacyPolicyModal';
import TermsOfUseModal from './TermsOfUseModal';

interface FooterProps {
  className?: string;
}

export default function Footer({ className = '' }: FooterProps) {
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfUse, setShowTermsOfUse] = useState(false);

  return (
    <>
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
              <div>
                <p className="text-sm text-white/60 mb-3">Síguenos</p>
                <div className="flex space-x-3">
                <a href="https://cl.linkedin.com/company/fundacion-nueva-educacion" target="_blank" rel="noopener noreferrer" 
                   className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors" title="LinkedIn">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>
                <a href="https://www.instagram.com/fundacion_nueva_educacion/" target="_blank" rel="noopener noreferrer" 
                   className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors" title="Instagram">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zM5.838 12a6.162 6.162 0 1112.324 0 6.162 6.162 0 01-12.324 0zM12 16a4 4 0 110-8 4 4 0 010 8zm4.965-10.405a1.44 1.44 0 112.881 0 1.44 1.44 0 01-2.881 0z"/>
                  </svg>
                </a>
                <a href="https://web.facebook.com/nuevaeducacion.org" target="_blank" rel="noopener noreferrer" 
                   className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors" title="Facebook">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
                <a href="https://x.com/fnuevaeducacion" target="_blank" rel="noopener noreferrer" 
                   className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors" title="X (Twitter)">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
                <a href="https://www.youtube.com/c/NuevaEducacionFundacion" target="_blank" rel="noopener noreferrer" 
                   className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors" title="YouTube">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                </a>
                </div>
              </div>
            </div>
            
            {/* Navigation Links */}
            <div>
              <h4 className="text-lg font-bold mb-6">Navegación</h4>
              <ul className="space-y-3">
                <li><Link href="/#pasantias" className="text-white/70 hover:text-white transition-colors">Pasantías</Link></li>
                <li><Link href="/#aula-generativa" className="text-white/70 hover:text-white transition-colors">Aula Generativa</Link></li>
                <li><Link href="/equipo" className="text-white/70 hover:text-white transition-colors">Equipo</Link></li>
                <li><Link href="/noticias" className="text-white/70 hover:text-white transition-colors">Noticias</Link></li>
                <li><Link href="/nosotros" className="text-white/70 hover:text-white transition-colors">Nosotros</Link></li>
                <li><Link href="/#red" className="text-white/70 hover:text-white transition-colors">Red</Link></li>
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
        
        {/* Bottom Bar */}
        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <div className="text-sm text-white/70">
                © 2025 Fundación Nueva Educación. Todos los derechos reservados.
              </div>
              <div className="flex items-center space-x-6 text-sm">
                <button 
                  onClick={() => setShowPrivacyPolicy(true)}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  Política de Privacidad
                </button>
                <button 
                  onClick={() => setShowTermsOfUse(true)}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  Términos de Uso
                </button>
                <span className="text-white/50">|</span>
                <span className="text-white/70">ATE certificada por RPA Mineduc</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
    
    {/* Modals */}
    <PrivacyPolicyModal 
      isOpen={showPrivacyPolicy} 
      onClose={() => setShowPrivacyPolicy(false)} 
    />
    <TermsOfUseModal 
      isOpen={showTermsOfUse} 
      onClose={() => setShowTermsOfUse(false)} 
    />
    </>
  );
}