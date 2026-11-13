import React, { useEffect, useRef, useState } from 'react';
import { TEAM_GROUPS, TEAM_MEMBERS, TeamMember } from './teamData';

/** A portrait that falls back to the person's initials when the photo cannot load. */
function Portrait({ member }: { member: TeamMember }) {
  const [failed, setFailed] = useState(false);
  if (failed || !member.image) {
    const initials = member.name
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
    return (
      <span className="ini" role="img" aria-label={member.name}>
        {initials}
      </span>
    );
  }
  return <img src={member.image} alt={member.name} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

/** The three groups of the team; a portrait with a biography opens it in a dialog. */
export default function TeamSection() {
  const [selected, setSelected] = useState<TeamMember | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!selected && dialog.open) {
      dialog.close();
    }
  }, [selected]);

  return (
    <section className="equipo" id="equipo">
      <div className="wrap">
        <div className="eyebrow rv">Nuestro equipo</div>
        <h2 className="rv">
          <span className="l">Las personas</span> detrás del cambio
        </h2>
        <p className="rv">
          Expertos comprometidos con la innovación educativa y el desarrollo de metodologías que potencian el
          crecimiento de cada estudiante.
        </p>

        {TEAM_GROUPS.map((group) => (
          <div className="grupo" key={group.id} id={group.id}>
            <h3 className="rv">
              {group.title} <small>{String(group.members.length).padStart(2, '0')}</small>
            </h3>
            <div className="gente">
              {group.members.map((key, index) => {
                const member = TEAM_MEMBERS[key];
                if (!member) return null;
                const portrait = (
                  <>
                    <span className="ret">
                      <Portrait member={member} />
                      {member.description && <span className="mas">Ver más</span>}
                    </span>
                    <b>{member.name}</b>
                    <span className="rol">{member.role}</span>
                  </>
                );
                const style = { ['--d' as string]: index % 6 };
                return member.description ? (
                  <button
                    type="button"
                    className="pers rv"
                    key={key}
                    style={style}
                    onClick={() => setSelected(member)}
                    data-testid={`equipo-${key}`}
                  >
                    {portrait}
                  </button>
                ) : (
                  <div className="pers rv" key={key} style={style}>
                    {portrait}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        className="bio"
        aria-label={selected ? selected.name : 'Biografía'}
        onClose={() => setSelected(null)}
        onClick={(event) => {
          if (event.target === dialogRef.current) setSelected(null);
        }}
      >
        {selected && (
          <>
            <button type="button" className="cerrar" onClick={() => setSelected(null)} data-testid="equipo-bio-cerrar">
              Cerrar ✕
            </button>
            <div className="in">
              <div className="ret">
                <Portrait member={selected} />
              </div>
              <div className="tx">
                <p className="rol">{selected.role}</p>
                <h3>{selected.name}</h3>
                <p>{selected.description}</p>
              </div>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
