/**
 * The new look's footer (redesign 5b): one line under the page, in place of the public site's big
 * footer (`components/Footer.tsx`), which today's look keeps drawing. The same links as that footer,
 * with the same addresses; «Política de Privacidad» and «Términos de Uso» open the same two
 * pop-ups. The logo, the paragraph, the social networks, the mail address and the sign-in button
 * are left out of the platform's frame (approved with the mock-up).
 */
import React, { useState } from 'react';
import Link from 'next/link';
import PrivacyPolicyModal from '../PrivacyPolicyModal';
import TermsOfUseModal from '../TermsOfUseModal';

/** The six links of `components/Footer.tsx` («Navegación»), in its order, with its addresses. */
export const FOOTER_NUEVO_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Pasantías', href: '/pasantias' },
  { label: 'Programas', href: '/programas' },
  { label: 'Noticias y Eventos', href: '/noticias' },
  { label: 'Nosotros', href: '/nosotros' },
  { label: 'Equipo', href: '/equipo' },
  { label: 'Contacto', href: '/#contacto' },
];

const LINK = 'text-gray-600 hover:text-gray-900 hover:underline transition-colors duration-150 motion-reduce:transition-none';

export default function FooterNuevo() {
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfUse, setShowTermsOfUse] = useState(false);

  return (
    <>
      <footer className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-4 text-xs text-gray-600" data-testid="footer-nuevo">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {FOOTER_NUEVO_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={LINK}>
              {link.label}
            </Link>
          ))}
          <button type="button" onClick={() => setShowPrivacyPolicy(true)} className={LINK}>
            Política de Privacidad
          </button>
          <button type="button" onClick={() => setShowTermsOfUse(true)} className={LINK}>
            Términos de Uso
          </button>
          <span>ATE certificada por RPA Mineduc</span>
          <span>Santiago, Chile</span>
        </div>
      </footer>
      <PrivacyPolicyModal isOpen={showPrivacyPolicy} onClose={() => setShowPrivacyPolicy(false)} />
      <TermsOfUseModal isOpen={showTermsOfUse} onClose={() => setShowTermsOfUse(false)} />
    </>
  );
}
