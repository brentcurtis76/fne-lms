// @vitest-environment jsdom
/**
 * Redesign 6C, step 4(c): the new markup of the panel's four pop-ups, its own behaviour (the look is
 * `nuevo` in this file). Escape and the veil close each window, and do not while it saves or sends;
 * the focus starts inside and returns to the opener; the remove-image button has its name; the form
 * shows the hook's messages and not the browser's, and Enter can send it; the delete confirmation's
 * two buttons; the bottom-sheet classes the kit gives under 560 px; every help line and message of the
 * settings window and of the form stands with its control (`helpOf`). The veil is clicked without
 * user-event's pointer-events check (see `__tests__/components/ui/kit/Dialog.test.tsx`).
 * Every person, community and proposal is invented.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, helpOf, settle, smallPng } from '../../helpers/popups';

const fake = vi.hoisted(() => ({
  log: [] as unknown[],
  update: [] as Array<{ error: unknown } | 'pending'>,
  pending: null as null | { resolve: (value: unknown) => void },
}));

vi.mock('next/link', async () => ({ default: (await import('../../helpers/popups')).LinkFake }));
vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: 'nuevo', setLook: () => {} }) }));
vi.mock('react-hot-toast', () => {
  const toast = {
    success: (message: unknown) => fake.log.push({ 'toast.success': message }),
    error: (message: unknown) => fake.log.push({ 'toast.error': message }),
  };
  return { toast, default: toast };
});
vi.mock('@/lib/services/communityWorkspace', () => ({
  communityWorkspaceService: {
    uploadCommunityImage: () => Promise.resolve({ url: 'https://example.invalid/subida.png', path: 'p' }),
    updateWorkspaceSettings: (...args: unknown[]) => {
      fake.log.push({ updateWorkspaceSettings: args });
      const answer = fake.update.shift() ?? { error: null };
      if (answer === 'pending') return new Promise((resolve) => (fake.pending = { resolve }));
      return Promise.resolve(answer);
    },
  },
}));

import WorkspaceSettingsModal from '@/components/community/WorkspaceSettingsModal';
import { MemberProfileModal } from '@/components/community/MemberProfileModal';
import { CourseProposalModal } from '@/components/course-proposals/CourseProposalModal';
import { ConfirmDialog } from '@/components/course-proposals/ConfirmDialog';
import type { UserProfile } from '@/types/roles';

const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const veil = () => document.querySelector('[data-kit="dialog-veil"]') as HTMLElement;

beforeEach(() => {
  fake.log = [];
  fake.update = [];
  fake.pending = null;
});

/** An opener button and the pop-up it opens; `close` is what the pop-up's onClose does. */
function Opener({ children }: { children: (open: boolean, close: () => void) => React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      {children(open, () => {
        fake.log.push('onClose');
        setOpen(false);
      })}
    </>
  );
}

const settings = (open: boolean, close: () => void, over: Partial<React.ComponentProps<typeof WorkspaceSettingsModal>> = {}) => (
  <WorkspaceSettingsModal
    isOpen={open}
    onClose={close}
    workspaceId="ws-inventado"
    currentName="Comunidad Inventada"
    onUpdate={(updates) => fake.log.push({ onUpdate: updates })}
    {...over}
  />
);

const MEMBER: UserProfile = {
  id: 'member-inventado',
  email: 'persona.inventada@example.invalid',
  first_name: 'Persona',
  last_name: 'Inventada',
  created_at: '2026-03-04T15:00:00Z',
  user_roles: [{ role_type: 'docente' } as any],
};

describe('community settings, new look', () => {
  it('is named by its title, has the eyebrow, the field and its help; the focus starts in the name and returns to the opener', async () => {
    const u = user();
    render(<Opener>{(open, close) => settings(open, close)}</Opener>);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    await u.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Configuración de la Comunidad' });
    expect(within(dialog).getByText('Mi Comunidad de Crecimiento')).toBeInTheDocument();
    const name = within(dialog).getByLabelText('Nombre de la Comunidad');
    expect(name).toHaveAccessibleDescription('Cualquier miembro puede cambiar el nombre del grupo');
    expect(name).toHaveAttribute('maxlength', '100');
    expect(within(dialog).getByRole('group', { name: 'Imagen de la Comunidad' })).toHaveAccessibleDescription('Máx. 5MB (JPEG, PNG, WebP)');
    await waitFor(() => expect(name).toHaveFocus());
    await u.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(opener).toHaveFocus());
    expect(fake.log).toEqual(['onClose']);
  });

  it('Escape closes it; the veil closes it', async () => {
    const u = user();
    render(<Opener>{(open, close) => settings(open, close)}</Opener>);
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    await u.click(veil());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.log).toEqual(['onClose', 'onClose']);
  });

  it('while saving: no X, Escape and the veil do nothing, both buttons unavailable, «Guardando...»', async () => {
    const u = user();
    render(<Opener>{(open, close) => settings(open, close)}</Opener>);
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    fake.update = ['pending'];
    await u.click(screen.getByTestId('workspace-settings-save'));
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
    expect(screen.getByTestId('workspace-settings-save')).toHaveTextContent('Guardando...');
    expect(screen.getByTestId('workspace-settings-save')).toBeDisabled();
    expect(screen.getByTestId('workspace-settings-cancel')).toBeDisabled();
    await u.keyboard('{Escape}');
    await u.click(veil());
    expect(screen.getByRole('dialog', { name: 'Configuración de la Comunidad' })).toBeInTheDocument();
    fake.pending?.resolve({ error: null });
    await settle();
    expect(fake.log).toEqual([
      { updateWorkspaceSettings: ['ws-inventado', { customName: 'Comunidad Inventada', imageUrl: '', imageStoragePath: undefined }] },
      { 'toast.success': 'Configuración actualizada exitosamente' },
      { onUpdate: { customName: 'Comunidad Inventada', imageUrl: '' } },
      'onClose',
    ]);
  });

  it('the remove-image button is named «Quitar imagen» and removes the preview; «Subir imagen» opens the hidden file input', async () => {
    const u = user();
    render(<Opener>{(open, close) => settings(open, close, { currentImageUrl: 'https://example.invalid/comunidad.png' })}</Opener>);
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('img', { name: 'Vista previa' })).toHaveAttribute('src', 'https://example.invalid/comunidad.png');
    await u.click(screen.getByRole('button', { name: 'Quitar imagen' }));
    expect(screen.queryByRole('img', { name: 'Vista previa' })).toBeNull();
    const input = document.getElementById('community-image-upload') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/jpg,image/png,image/webp');
    expect(input).toHaveClass('hidden');
    const opened = vi.spyOn(input, 'click');
    await u.click(screen.getByRole('button', { name: 'Subir imagen' }));
    expect(opened).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { files: [smallPng()] } });
    await settle();
    expect(screen.getByRole('img', { name: 'Vista previa' }).getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });

  it('the kit draws a bottom sheet under 560 px (its classes on the veil and the box)', async () => {
    const u = user();
    render(<Opener>{(open, close) => settings(open, close)}</Opener>);
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(veil().className).toContain('nuevo:max-[559px]:items-end');
    expect(screen.getByTestId('workspace-settings-dialog').className).toContain('nuevo:max-[559px]:rounded-b-none');
  });
});

describe('member profile, new look', () => {
  // As the panel does: the member is cleared when the window closes (the pop-up then draws nothing).
  function member(m: UserProfile, isCurrentUser = false) {
    return function drawMember(open: boolean, close: () => void) {
      return <MemberProfileModal isOpen={open} onClose={close} member={open ? m : null} isCurrentUser={isCurrentUser} />;
    };
  }

  it('named by the member, «(Tú)» for oneself; the focus starts on «Cerrar» and returns to the opener', async () => {
    const u = user();
    render(<Opener>{member(MEMBER, true)}</Opener>);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    await u.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Persona Inventada (Tú)' });
    expect(within(dialog).getByText('Mi Comunidad de Crecimiento')).toBeInTheDocument();
    expect(within(dialog).getByText('Docente')).toBeInTheDocument();
    const cerrar = within(dialog).getAllByRole('button', { name: 'Cerrar' }).find((b) => b.textContent?.trim() === 'Cerrar')!;
    await waitFor(() => expect(cerrar).toHaveFocus());
    await u.click(cerrar);
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('the details as a description list; the three never-filled rows are not drawn even when the member carries them', async () => {
    const u = user();
    const full = {
      ...MEMBER,
      school: { id: 1, name: 'Colegio Inventado' } as any,
      generation: { id: 'g', name: 'Generación Inventada' } as any,
      community: { id: 'c', name: 'Comunidad Inventada' } as any,
    };
    render(<Opener>{member(full)}</Opener>);
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog', { name: 'Persona Inventada' });
    const terms = within(dialog).getAllByRole('term').map((t) => t.textContent?.trim());
    expect(terms).toEqual(['Correo electrónico', 'Miembro desde']);
    expect(within(dialog).getAllByRole('definition').map((d) => d.textContent?.trim())).toEqual([
      'persona.inventada@example.invalid',
      '4 de marzo de 2026',
    ]);
    expect(within(dialog).queryByText('Colegio Inventado')).toBeNull();
    expect(within(dialog).queryByText('Generación Inventada')).toBeNull();
    expect(within(dialog).queryByText('Comunidad Inventada')).toBeNull();
  });

  it('«Ver Perfil Completo» is a link to /user/{id} that closes; Escape and the veil close it', async () => {
    const u = user();
    render(<Opener>{member(MEMBER)}</Opener>);
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    const link = screen.getByRole('link', { name: 'Ver Perfil Completo' });
    expect(link).toHaveAttribute('href', '/user/member-inventado');
    await u.click(link);
    expect(screen.queryByRole('dialog')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    await u.click(veil());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.log).toEqual(['onClose', 'onClose', 'onClose']);
  });
});

describe('course proposal form, new look', () => {
  const submits: unknown[] = [];
  let answer: Promise<void> | null = null;
  const form = (open: boolean, close: () => void) => (
    <CourseProposalModal
      isOpen={open}
      onClose={close}
      onSubmit={(data) => {
        submits.push(data);
        return answer ?? Promise.resolve();
      }}
      editingProposal={null}
    />
  );
  beforeEach(() => {
    submits.length = 0;
    answer = null;
  });

  it('named by its title, described by its line; the focus starts in the title field and returns to the opener', async () => {
    const u = user();
    render(<Opener>{form}</Opener>);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    await u.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Nueva Propuesta de Curso' });
    expect(dialog).toHaveAccessibleDescription('Comparte tu idea para un nuevo curso que beneficiaría a la plataforma.');
    expect(within(dialog).getByText('Propuestas de Cursos')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByLabelText(/Título del curso/)).toHaveFocus());
    await u.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('the four fields carry the required mark without the browser\'s own bubble: the hook\'s message shows in a notice', async () => {
    const u = user();
    render(<Opener>{form}</Opener>);
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    const theForm = screen.getByTestId('proposal-form') as HTMLFormElement;
    expect(theForm.noValidate).toBe(true);
    for (const id of ['titulo', 'descripcion_corta', 'competencias_desarrollar', 'tiempo_requerido_desarrollo']) {
      expect(document.getElementById(id)).toHaveAttribute('aria-required', 'true');
    }
    await u.click(screen.getByRole('button', { name: 'Enviar Propuesta' }));
    expect(screen.getByRole('alert')).toHaveTextContent('El título es requerido');
    expect(submits).toEqual([]);
  });

  it('Enter can send it: the send button is the form\'s only submit button, joined by the form attribute', async () => {
    const u = user();
    render(<Opener>{form}</Opener>);
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    const theForm = screen.getByTestId('proposal-form') as HTMLFormElement;
    const send = screen.getByTestId('proposal-form-submit') as HTMLButtonElement;
    expect(send.type).toBe('submit');
    expect(send.form).toBe(theForm);
    const ofTheForm = Array.from(document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')).filter((b) => b.form === theForm);
    expect(ofTheForm).toEqual([send]);
    // A browser's Enter in a text field submits the form through its default button; the submit
    // event is what the hook listens to.
    fireEvent.submit(theForm);
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('El título es requerido');
  });

  it('Escape and the veil close it (reset), and do not while sending; no X while sending', async () => {
    const u = user();
    render(<Opener>{form}</Opener>);
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    await u.type(screen.getByLabelText(/Título del curso/), 'Algo');
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByLabelText(/Título del curso/)).toHaveValue('');
    await u.click(veil());
    expect(screen.queryByRole('dialog')).toBeNull();

    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    for (const [id, value] of [['titulo', 'T'], ['descripcion_corta', 'D'], ['competencias_desarrollar', 'C'], ['tiempo_requerido_desarrollo', '1 mes']]) {
      fireEvent.change(document.getElementById(id)!, { target: { value } });
    }
    const wait = deferred<void>();
    answer = wait.promise;
    await u.click(screen.getByRole('button', { name: 'Enviar Propuesta' }));
    const send = screen.getByTestId('proposal-form-submit');
    expect(send).toHaveTextContent('Guardando...');
    expect(send).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
    await u.keyboard('{Escape}');
    await u.click(veil());
    expect(screen.getByRole('dialog', { name: 'Nueva Propuesta de Curso' })).toBeInTheDocument();
    wait.resolve();
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.log).toEqual(['onClose', 'onClose', 'onClose']);
  });
});

describe('the delete confirmation, new look', () => {
  function Holder() {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Abrir
        </button>
        <ConfirmDialog
          isOpen={open}
          onClose={() => {
            fake.log.push('onClose');
            setOpen(false);
          }}
          onConfirm={() => fake.log.push('onConfirm')}
          title="Eliminar Propuesta"
          description="¿Estás seguro de que deseas eliminar esta propuesta? Esta acción no se puede deshacer."
          confirmText="Eliminar"
          cancelText="Cancelar"
          isLoading={false}
          variant="danger"
        />
      </>
    );
  }

  it('its eyebrow, title and question; two buttons, the focus on «Cancelar»; «Eliminar» is the danger one', async () => {
    const u = user();
    render(<Holder />);
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog', { name: 'Eliminar Propuesta' });
    expect(within(dialog).getByText('Confirmar')).toBeInTheDocument();
    expect(within(dialog).getByText('¿Estás seguro de que deseas eliminar esta propuesta? Esta acción no se puede deshacer.')).toBeInTheDocument();
    const cancel = screen.getByTestId('proposal-confirm-dialog-cancel');
    const confirm = screen.getByTestId('proposal-confirm-dialog-confirm');
    expect(cancel).toHaveTextContent('Cancelar');
    expect(confirm).toHaveTextContent('Eliminar');
    expect(confirm.className).toContain('bg-red-600');
    await waitFor(() => expect(cancel).toHaveFocus());
  });

  it('«Eliminar» calls onConfirm and closes at once; the focus returns to the opener', async () => {
    const u = user();
    render(<Holder />);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    await u.click(opener);
    await u.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.log).toEqual(['onConfirm', 'onClose']);
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('«Cancelar», Escape and the veil close it without confirming', async () => {
    const u = user();
    render(<Holder />);
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    await u.click(screen.getByRole('button', { name: 'Cancelar' }));
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    await u.keyboard('{Escape}');
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    await u.click(veil());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.log).toEqual(['onClose', 'onClose', 'onClose']);
  });
});

describe('every help line and message stands with its control (send-back 1, point 2(b))', () => {
  // A help line is «associated» when a screen reader gets it with its control: one of the control's
  // aria-describedby targets, or inside its label. For the image of the settings window the control is
  // the button «Subir imagen» inside the group «Imagen de la Comunidad», and the help is the group's
  // description (accepted: the group is the field). Hidden or unassociated fails.
  it('the settings window: the name\'s help with the name field, the image\'s help with its group; both shown', async () => {
    const u = user();
    render(<Opener>{(open, close) => settings(open, close)}</Opener>);
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog', { name: 'Configuración de la Comunidad' });
    expect(helpOf(within(dialog).getByLabelText('Nombre de la Comunidad'), 'Cualquier miembro puede cambiar el nombre del grupo')).toEqual({
      found: true,
      associated: 'control',
      hidden: false,
    });
    expect(helpOf(within(dialog).getByRole('button', { name: 'Subir imagen' }), 'Máx. 5MB (JPEG, PNG, WebP)')).toEqual({
      found: true,
      associated: 'group',
      hidden: false,
    });
  });

  it('the form: the four text fields have no help, and point at nothing missing; the tick box\'s help is with the tick box', async () => {
    const u = user();
    render(
      <Opener>
        {(open, close) => <CourseProposalModal isOpen={open} onClose={close} onSubmit={() => Promise.resolve()} editingProposal={null} />}
      </Opener>
    );
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    for (const id of ['titulo', 'descripcion_corta', 'competencias_desarrollar', 'tiempo_requerido_desarrollo', 'necesita_ayuda_diseno_instruccional']) {
      const ids = (document.getElementById(id)!.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
      expect(ids.filter((target) => document.getElementById(target) === null)).toEqual([]);
    }
    expect(
      helpOf(document.getElementById('necesita_ayuda_diseno_instruccional')!, 'Marque esta opción si requiere apoyo de nuestro equipo para estructurar el contenido del curso.')
    ).toEqual({ found: true, associated: 'control', hidden: false });
  });

  /** The hook's four messages in order, each with the field it names. */
  const MESSAGES: Array<[id: string, message: string, value: string]> = [
    ['titulo', 'El título es requerido', 'Título Inventado'],
    ['descripcion_corta', 'La descripción es requerida', 'Descripción inventada'],
    ['competencias_desarrollar', 'Las competencias a desarrollar son requeridas', 'Competencias inventadas'],
    ['tiempo_requerido_desarrollo', 'El tiempo requerido es requerido', '1 mes'],
  ];

  async function eachMessage(check: (field: HTMLElement, message: string) => void) {
    const u = user();
    render(
      <Opener>
        {(open, close) => <CourseProposalModal isOpen={open} onClose={close} onSubmit={() => Promise.resolve()} editingProposal={null} />}
      </Opener>
    );
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    for (const [id, message, value] of MESSAGES) {
      await u.click(screen.getByTestId('proposal-form-submit'));
      check(document.getElementById(id)!, message);
      fireEvent.change(document.getElementById(id)!, { target: { value } });
      await settle();
    }
  }

  it('the form: each of the hook\'s messages is shown in the form\'s alert, not hidden', () =>
    eachMessage((_field, message) => {
      const alert = within(screen.getByTestId('proposal-form')).getByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(helpOf(alert, message)).toMatchObject({ found: true, hidden: false });
    }));

  // A REAL GAP, left failing for the lead (send-back 1, point 2(b)): the hook's messages are shown in ONE
  // notice at the top of the form (the 6C brief's design), announced as an alert but tied to no field:
  // no field's aria-describedby points at it and none is marked invalid. Tying each message to the field
  // it names needs a change in `CourseProposalFormNuevo.tsx` (not a test change).
  it.fails('the form: each of the hook\'s messages is associated with the field it names (differs, for the lead)', () =>
    eachMessage((field, message) => {
      expect(helpOf(field, message)).toEqual({ found: true, associated: 'control', hidden: false });
    }));
});
