import React from 'react';
import { Button, Checkbox, Dialog, Field, Input, Notice, Textarea } from '../ui/kit';
import type { useCourseProposalForm } from './useCourseProposalForm';

/**
 * The new look's course proposal form (redesign 6C), to create and to edit, on the kit's `Dialog`.
 * Everything it shows and does comes from `useCourseProposalForm`, the hook today's markup reads too:
 * the same field ids and names (the change handler reads the name), the same validation and its
 * messages (shown in a `Notice` at the top of the form), the same submit and close rules.
 *
 * The form is a real `<form>` and its send button sits in the window's footer, joined to the form by
 * the `form` attribute: Enter in a text field sends it, as today. `noValidate`: the fields carry the
 * kit's required mark (and the native `required`), but the hook's messages speak, not the browser's
 * own bubble. Escape, the veil and the X close it (resetting it), except while it sends.
 */
export function CourseProposalFormNuevo({
  isOpen,
  form,
}: {
  isOpen: boolean;
  form: ReturnType<typeof useCourseProposalForm>;
}) {
  const { isSubmitting, error, formData, isEditing, handleChange, handleSubmit, handleClose } = form;
  const formId = React.useId();

  // The message is drawn at the top of the form's body, which may be scrolled to its end when the
  // person presses the send button (a short window). After each submit has run its course, the notice,
  // if there is one, is brought into sight inside the window's scrolling body. `submits` counts the
  // submits that finished; the effect runs only when it changes, so opening the window, typing that
  // clears the message or any other re-render never moves anything, and a submit that leaves no
  // message (sent and closed) finds no notice and moves nothing. The same message produced again is
  // a new count, so it is brought into sight again.
  const noticeRef = React.useRef<HTMLDivElement>(null);
  const [submits, setSubmits] = React.useState(0);
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    await handleSubmit(e);
    setSubmits((n) => n + 1);
  };
  React.useEffect(() => {
    if (submits === 0) return;
    const notice = noticeRef.current;
    if (!notice || typeof notice.scrollIntoView !== 'function') return;
    const reduce =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    // `nearest`: the body scrolls only as far as needed, and the page behind the fixed window, whose
    // view already holds the window, has nothing to do.
    notice.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
  }, [submits]);

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      eyebrow="Propuestas de Cursos"
      title={isEditing ? 'Editar Propuesta de Curso' : 'Nueva Propuesta de Curso'}
      description={
        isEditing
          ? 'Modifica los detalles de tu propuesta de curso.'
          : 'Comparte tu idea para un nuevo curso que beneficiaría a la plataforma.'
      }
      dismissable={!isSubmitting}
      data-testid="proposal-form-dialog"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} data-testid="proposal-form-cancel">
            Cancelar
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={isSubmitting}
            data-testid="proposal-form-submit"
          >
            {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Enviar Propuesta'}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={onSubmit} className="grid gap-[14px]" data-testid="proposal-form">
        {/* The kit's error Notice is `role="alert"`: a screen reader announces it. */}
        {error && (
          <Notice ref={noticeRef} tone="error">
            {error}
          </Notice>
        )}

        <Field label="Título del curso" required>
          <Input
            type="text"
            id="titulo"
            name="titulo"
            value={formData.titulo}
            onChange={handleChange}
            placeholder="Ej: Estrategias de Aprendizaje Colaborativo"
            disabled={isSubmitting}
          />
        </Field>

        <Field label="Descripción corta" required>
          <Textarea
            id="descripcion_corta"
            name="descripcion_corta"
            value={formData.descripcion_corta}
            onChange={handleChange}
            rows={3}
            placeholder="Describe brevemente de qué se trataría el curso..."
            disabled={isSubmitting}
          />
        </Field>

        <Field label="Competencias a desarrollar" required>
          <Textarea
            id="competencias_desarrollar"
            name="competencias_desarrollar"
            value={formData.competencias_desarrollar}
            onChange={handleChange}
            rows={4}
            placeholder="¿Qué habilidades o competencias desarrollarían los participantes?"
            disabled={isSubmitting}
          />
        </Field>

        <Field label="Tiempo requerido para desarrollar el contenido" required>
          <Input
            type="text"
            id="tiempo_requerido_desarrollo"
            name="tiempo_requerido_desarrollo"
            value={formData.tiempo_requerido_desarrollo}
            onChange={handleChange}
            placeholder="Ej: 2 semanas, 1 mes, 3 meses"
            disabled={isSubmitting}
          />
        </Field>

        <Checkbox
          id="necesita_ayuda_diseno_instruccional"
          name="necesita_ayuda_diseno_instruccional"
          checked={formData.necesita_ayuda_diseno_instruccional}
          onChange={handleChange}
          disabled={isSubmitting}
          label="¿Necesita ayuda con el diseño instruccional?"
          help="Marque esta opción si requiere apoyo de nuestro equipo para estructurar el contenido del curso."
        />
      </form>
    </Dialog>
  );
}

export default CourseProposalFormNuevo;
