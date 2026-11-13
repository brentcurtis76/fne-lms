import React from 'react';

const STORAGE = 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources';

/** Network, partner schools in Catalunya and strategic alliances, as on the previous homepage. */
const ALLIES = [
  { name: 'Instituto Relacional', href: 'https://www.institutorelacional.org/', logo: `${STORAGE}/Red/Instituto%20Relacional.png` },
  { name: 'Escola Virolai', href: 'https://virolai.com/es/', logo: `${STORAGE}/escuelas/Virolai.png` },
  { name: 'International Positive Education Network', href: 'https://www.ipen-network.com/', logo: `${STORAGE}/Alianzas/ipen.png` },
  { name: 'Los Pellines', href: 'https://lospellines.cl/', logo: `${STORAGE}/Red/Los%20Pellines%20ASP.png` },
  { name: 'Escola Sadako', href: 'https://escolasadako.cat/', logo: `${STORAGE}/escuelas/Sadako.png` },
  { name: 'David L. Cooperrider Center for Appreciative Inquiry', href: 'https://appreciativeinquiry.champlain.edu/', logo: `${STORAGE}/Alianzas/Cooperrider%20Center.png` },
  { name: 'Relaciona Consultores', href: 'https://www.relaciona.cl/', logo: `${STORAGE}/Red/Relaciona-Consultores.png` },
  { name: 'Institut Angeleta Ferrer', href: 'https://agora.xtec.cat/iesangeleta/', logo: `${STORAGE}/escuelas/Angeleta%20Ferrer%202.png` },
  { name: 'Els Futurs de l’Educació', href: 'https://elsfutursdeleducacio.cat/', logo: `${STORAGE}/Alianzas/Forum%20Futurs%20de%20leducacio.png` },
  { name: 'Conserva Tu Bosque', href: 'https://conservatubosque.cl/', logo: `${STORAGE}/Red/Conserva-Tu-Bosque.png` },
  { name: 'Institut Escola Les Vinyes', href: 'https://agora.xtec.cat/ielesvinyes/', logo: `${STORAGE}/escuelas/Les%20Vinyes%20-%20Edited.png` },
  { name: 'Fundació Jaume Bofill', href: 'https://fundaciobofill.cat/', logo: `${STORAGE}/Alianzas/Fundacio%20Bofill.png` },
  { name: 'Lodge Los Pellines', href: 'https://www.pellineslodge.cl/', logo: `${STORAGE}/Red/Lodge%20Los%20Pellines.png` },
  { name: 'Escola Octavio Paz', href: 'https://www.escolaoctaviopaz.cat/', logo: `${STORAGE}/escuelas/Octavio%20Paz.png` },
  { name: 'STEAM Conference Barcelona', href: 'https://www.steamconf.com/', logo: `${STORAGE}/Alianzas/SteamConf.png` },
  { name: 'Escola La Maquinista', href: 'https://www.escolalamaquinista.cat/', logo: `${STORAGE}/escuelas/La%20Maquinista%20edited.png` },
  { name: 'Innovamat', href: 'https://www.innovamat.com/', logo: `${STORAGE}/Alianzas/Innovamat.png` },
  { name: 'Escola El Puig', href: 'https://escolaelpuig.cat/', logo: `${STORAGE}/escuelas/El%20Puig%20-%20Edited.png` },
];

/** One slow ribbon with every organisation of the network. The second copy only closes the loop. */
export default function RedAliada() {
  return (
    <section className="red" aria-label="Nuestra red">
      <div className="eyebrow">Una red que piensa la escuela con nosotros</div>
      <div className="mq">
        <div className="mq-t">
          {[0, 1].map((copy) =>
            ALLIES.map((ally) => (
              <a
                key={`${copy}-${ally.name}`}
                href={ally.href}
                target="_blank"
                rel="noopener noreferrer"
                title={ally.name}
                aria-hidden={copy === 1 ? true : undefined}
                tabIndex={copy === 1 ? -1 : undefined}
              >
                <img src={ally.logo} alt={copy === 0 ? ally.name : ''} loading="lazy" decoding="async" />
              </a>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
