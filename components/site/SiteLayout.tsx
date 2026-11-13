import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import PrivacyPolicyModal from '../PrivacyPolicyModal';
import TermsOfUseModal from '../TermsOfUseModal';
import { useSiteEffects } from './useSiteEffects';

export type SiteSection = 'inicio' | 'pasantias' | 'programas' | 'noticias' | 'nosotros';

interface SiteLayoutProps {
  /** Which nav entry is the current page. */
  active: SiteSection;
  title: string;
  description: string;
  /** Optional social-preview image (absolute URL). */
  image?: string;
  /** Extra tags for this page's <head> (canonical, twitter card, ...). */
  head?: React.ReactNode;
  children: React.ReactNode;
}

const NAV: Array<{ id: SiteSection; label: string; href: string }> = [
  { id: 'pasantias', label: 'Pasantías', href: '/pasantias' },
  { id: 'programas', label: 'Programas', href: '/programas' },
  { id: 'noticias', label: 'Noticias', href: '/noticias' },
  { id: 'nosotros', label: 'Nosotros', href: '/nosotros' },
];

const SOCIAL = [
  { label: 'LinkedIn', href: 'https://cl.linkedin.com/company/fundacion-nueva-educacion' },
  { label: 'Instagram', href: 'https://www.instagram.com/fundacion_nueva_educacion/' },
  { label: 'Facebook', href: 'https://web.facebook.com/nuevaeducacion.org' },
  { label: 'X', href: 'https://x.com/fnuevaeducacion' },
  { label: 'YouTube', href: 'https://www.youtube.com/c/NuevaEducacionFundacion' },
];

const FAMILY = [
  { strong: 'Los Pellines', light: 'Nueva Educación', mark: '/sitio/ne-fill.png', color: 'linear-gradient(100deg,#0db14b 30%,#00957b)' },
  { strong: 'Los Pellines', light: 'Lodge', mark: '/sitio/lodge-fill.png', color: 'linear-gradient(100deg,#ae6e0d 30%,#744943)' },
  { strong: 'Los Pellines', light: 'Summer Camp', mark: '/sitio/camp-fill.png', color: 'linear-gradient(100deg,#f5846c 30%,#ef4044)' },
  { strong: 'Los Pellines', light: 'Empresa', mark: '/sitio/empresa-fill.png', color: 'linear-gradient(100deg,#00957b 30%,#005879)' },
  { strong: 'Relaciona', light: 'Consultores', mark: '/sitio/relaciona-fill.png', color: 'linear-gradient(100deg,#ef4044 30%,#ae1b1f)' },
];

function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link className="logo" href="/" aria-label="Fundación Nueva Educación, inicio" onClick={onClick}>
      <i className="mark" />
      <span>
        <small>Fundación</small>
        <b>Nueva Educación</b>
      </span>
    </Link>
  );
}

/**
 * Shell of the public site: fonts, the fixed nav, the footer and the page-wide
 * effects. Everything it renders sits inside `.ne`, the scope of
 * `styles/sitio.css`.
 */
export default function SiteLayout({ active, title, description, image, head, children }: SiteLayoutProps) {
  const root = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  useSiteEffects(root);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const contactHref = active === 'inicio' ? '#contacto' : '/#contacto';

  return (
    <>
    <div className={`ne${menuOpen ? ' menu-open' : ''}`} ref={root}>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        {image && <meta property="og:image" content={image} />}
        <meta name="theme-color" content="#00243e" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Besley:ital,wght@0,400;0,500;1,400&family=Kristi&display=swap"
          rel="stylesheet"
        />
        {head}
      </Head>
      {/* First load only: hide what animates in before the browser paints it. */}
      <script
        dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('ne-html','ne-js')" }}
      />
      <div className="prog" aria-hidden="true" />
      <div className="cur" aria-hidden="true" />

      <header className="nav" data-testid="site-header">
        <Logo onClick={closeMenu} />
        <ul className="links">
          {NAV.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={active === item.id ? 'page' : undefined}
                onClick={closeMenu}
                data-testid={`site-nav-${item.id}`}
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <Link href={contactHref} onClick={closeMenu} data-testid="site-nav-contacto">
              Contacto
            </Link>
          </li>
          <li className="hub">
            <Link href="/login" onClick={closeMenu} data-testid="site-nav-hub-movil">
              Hub de Transformación →
            </Link>
          </li>
        </ul>
        <Link className="btn mag" href="/login" data-testid="site-nav-hub">
          Hub de Transformación <span className="arr">→</span>
        </Link>
        <button
          className="burger"
          type="button"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          data-testid="site-nav-burger"
        >
          <i />
          <i />
        </button>
      </header>

      <main>{children}</main>

      <footer className="pie-s">
        <div className="wrap">
          <div className="cols">
            <div>
              <Logo />
              <p style={{ marginTop: 18, maxWidth: '44ch' }}>
                Acompañamos a las comunidades educativas a dar el salto hacia una Nueva Educación basada en la
                autonomía y la colaboración, para la expresión plena del potencial de cada estudiante.
              </p>
              <div className="redes" aria-label="Redes sociales">
                {SOCIAL.map((network) => (
                  <a key={network.label} href={network.href} target="_blank" rel="noopener noreferrer">
                    {network.label}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <h2>Navegación</h2>
              <ul>
                <li><Link href="/pasantias">Pasantías</Link></li>
                <li><Link href="/programas">Programas</Link></li>
                <li><Link href="/noticias">Noticias y Eventos</Link></li>
                <li><Link href="/nosotros">Nosotros</Link></li>
                <li><Link href="/equipo">Equipo</Link></li>
                <li><Link href={contactHref}>Contacto</Link></li>
              </ul>
            </div>
            <div>
              <h2>Contacto</h2>
              <ul>
                <li><a href="mailto:info@nuevaeducacion.org">info@nuevaeducacion.org</a></li>
                <li>Santiago, Chile</li>
                <li>ATE certificada por RPA Mineduc</li>
                <li><Link href="/login">Hub de Transformación</Link></li>
              </ul>
            </div>
          </div>
          <div className="familia" aria-label="Grupo Nueva Educación">
            <div className="fne">
              <i className="mark" />
              <span>
                Fundación<b style={{ color: 'var(--sol)' }}>Nueva Educación</b>
              </span>
            </div>
            {FAMILY.map((member) => (
              <div key={member.strong + member.light}>
                <i className="mark" style={{ ['--m' as string]: `url(${member.mark})`, background: member.color }} />
                <span>
                  <b>{member.strong}</b>
                  {member.light}
                </span>
              </div>
            ))}
          </div>
          <div className="legal">
            <span>© {new Date().getFullYear()} Fundación Nueva Educación. Todos los derechos reservados.</span>
            <span>
              <button type="button" onClick={() => setShowPrivacy(true)} data-testid="site-footer-privacidad">
                Política de Privacidad
              </button>
              <button type="button" onClick={() => setShowTerms(true)} data-testid="site-footer-terminos">
                Términos de Uso
              </button>
            </span>
          </div>
        </div>
      </footer>
    </div>
    {/* Outside .ne: the modals bring their own (platform) styling. */}
    <PrivacyPolicyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    <TermsOfUseModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
    </>
  );
}
