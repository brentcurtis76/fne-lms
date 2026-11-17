import * as React from 'react';
import { AlertCircle, Check, ChevronDown, Search } from 'lucide-react';
import { cx } from './cx';

/**
 * Field and its controls. `Field` draws the label, the required mark, the help and the error, and wires
 * them to the ONE control inside it (`Input`, `Textarea`, `Select`, `SearchInput`): the control gets the
 * id the label points at, `aria-describedby` (help and error), `aria-invalid` and `aria-required`.
 * With `group` it is a `<fieldset>` whose `<legend>` names a set of `Radio`s or `Checkbox`es instead.
 * Every control is the native element, forwards its ref and takes every native attribute.
 */

interface FieldWiring {
  id?: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
  /** A control with its own id tells the field, so the label points at that id. Returns the undo. */
  claimId: (id: string) => () => void;
}

const FieldContext = React.createContext<FieldWiring | null>(null);

/** Inside `<Field group>`: what its radios take (a required group of radios makes each radio required). */
const GroupContext = React.createContext<{ required: boolean } | null>(null);

const useLayoutEffectOnClient = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

/**
 * The own `id` of a control that is a direct child of the field, read while rendering (so the server's
 * HTML is right too). Only controls count: a wrapper's id is not the control's.
 */
function childId(children: React.ReactNode): string | undefined {
  let found: string | undefined;
  React.Children.forEach(children, (child) => {
    if (found !== undefined || !React.isValidElement(child)) return;
    const isControl = ['input', 'select', 'textarea'].includes(child.type as string) || CONTROLS.includes(child.type);
    const id = (child.props as { id?: unknown }).id;
    if (isControl && typeof id === 'string' && id !== '') found = id;
  });
  return found;
}

/** What a control takes from the `Field` around it; its own props win. */
function useFieldWiring<P extends { id?: string; disabled?: boolean; required?: boolean }>(props: P) {
  const field = React.useContext(FieldContext);
  const claimId = field?.claimId;
  useLayoutEffectOnClient(() => {
    if (claimId && props.id) return claimId(props.id);
    return undefined;
  }, [claimId, props.id]);
  const ownDescribedBy = (props as { 'aria-describedby'?: string })['aria-describedby'];
  const ownInvalid = (props as { 'aria-invalid'?: React.AriaAttributes['aria-invalid'] })['aria-invalid'];
  const describedBy = [field?.describedBy, ownDescribedBy].filter(Boolean).join(' ') || undefined;
  const invalid = ownInvalid ?? (field?.invalid ? true : undefined);
  const required = props.required ?? (field?.required || undefined);
  return {
    id: props.id ?? field?.id,
    disabled: props.disabled ?? (field?.disabled || undefined),
    required,
    'aria-describedby': describedBy,
    'aria-invalid': invalid,
    'aria-required': required ? true : undefined,
  };
}

export interface FieldProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  label: React.ReactNode;
  /** The control's id. A control's own `id` wins over it; made with `React.useId` when neither is given. */
  controlId?: string;
  help?: React.ReactNode;
  /** A message here marks the control invalid. */
  error?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  /**
   * A set of radios or tick boxes: a fieldset named by its legend. With `required`, radios: each radio
   * is required (the browser's rule: one of the group must be chosen); tick boxes: at least one must be
   * ticked, checked by the form's own validation («Marca al menos una opción.» on the first box).
   */
  group?: boolean;
  children: React.ReactNode;
}

const LABEL = cx(
  'mb-1 block text-sm font-medium text-gray-700',
  'nuevo:mb-0 nuevo:text-[0.8125rem] nuevo:font-semibold nuevo:text-brand_primary'
);
const HELP = 'mt-1 block text-xs text-gray-500 nuevo:mt-0 nuevo:text-gray-600';
const ERROR = 'mt-1 flex items-center gap-1.5 text-sm text-red-600 nuevo:mt-0 nuevo:text-xs';

export function Field({
  label,
  controlId,
  help,
  error,
  required = false,
  disabled = false,
  group = false,
  className,
  children,
  ...rest
}: FieldProps) {
  const auto = React.useId();
  // One id for the label and the control: the control's own (a direct child's, or one claimed from
  // deeper inside), else `controlId`, else a made one.
  const [claimed, setClaimed] = React.useState<string | undefined>(undefined);
  const claimId = React.useCallback((own: string) => {
    setClaimed(own);
    return () => setClaimed((current) => (current === own ? undefined : current));
  }, []);
  const id = childId(children) ?? claimed ?? controlId ?? `${auto}-control`;
  const helpId = help ? `${auto}-help` : undefined;
  const errorId = error ? `${auto}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const groupRef = React.useRef<HTMLFieldSetElement>(null);
  useAtLeastOneTicked(groupRef, group && required);
  const mark = required ? (
    <span aria-hidden="true" className="text-red-600 nuevo:ml-[2px]">
      *
    </span>
  ) : null;
  const notes = (
    <>
      {help && (
        <span id={helpId} className={HELP}>
          {help}
        </span>
      )}
      {error && (
        <span id={errorId} className={ERROR}>
          <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 flex-none" />
          {error}
        </span>
      )}
    </>
  );
  const box = cx('min-w-0 nuevo:grid nuevo:gap-[6px]', className);

  if (group) {
    return (
      // No aria-required here: it means nothing on a group. The radios carry `required` themselves.
      <fieldset
        {...(rest as React.FieldsetHTMLAttributes<HTMLFieldSetElement>)}
        ref={groupRef}
        className={cx('border-0 p-0', box)}
        disabled={disabled || undefined}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
      >
        <legend className={cx(LABEL, 'p-0')}>
          {label}
          {mark}
        </legend>
        <GroupContext.Provider value={required ? REQUIRED_GROUP : null}>
          <div className="space-y-2 nuevo:space-y-0 nuevo:grid nuevo:gap-3">{children}</div>
        </GroupContext.Provider>
        {notes}
      </fieldset>
    );
  }

  return (
    <div {...(rest as React.HTMLAttributes<HTMLDivElement>)} className={box}>
      <label htmlFor={id} className={LABEL}>
        {label}
        {mark}
      </label>
      <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error), required, disabled, claimId }}>
        {children}
      </FieldContext.Provider>
      {notes}
    </div>
  );
}

const REQUIRED_GROUP = { required: true };

/** The browser's message on the first tick box of a required group with none ticked. */
const AT_LEAST_ONE = 'Marca al menos una opción.';

/**
 * A required group of tick boxes: while none is ticked, the first box carries a custom validity
 * message, so the form's own validation (`checkValidity`, the browser's bubble on sending) stops it.
 * Measured after every render (a parent that ticks a box by its state renders the field again), on
 * every change inside the group and after a form reset. A group without tick boxes is left alone.
 */
function useAtLeastOneTicked(groupRef: React.RefObject<HTMLFieldSetElement>, active: boolean) {
  useLayoutEffectOnClient(() => {
    const group = groupRef.current;
    if (!group || !active) return undefined;
    const boxes = () =>
      Array.from(group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).filter((box) => box.closest('fieldset') === group);
    const update = () => {
      const all = boxes();
      const none = !all.some((box) => box.checked);
      all.forEach((box, at) => box.setCustomValidity(none && at === 0 ? AT_LEAST_ONE : ''));
    };
    update();
    const form = group.form;
    const afterReset = () => window.setTimeout(update, 0);
    group.addEventListener('change', update);
    form?.addEventListener('reset', afterReset);
    return () => {
      group.removeEventListener('change', update);
      form?.removeEventListener('reset', afterReset);
      for (const box of boxes()) box.setCustomValidity('');
    };
  });
}

const CONTROL = cx(
  'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-500',
  'focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand_accent',
  'disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500',
  'aria-[invalid=true]:border-red-500',
  'transition-colors motion-reduce:transition-none',
  'nuevo:min-h-[40px] nuevo:rounded nuevo:border-brand_gray_medium nuevo:px-[0.75em] nuevo:py-[0.5em] nuevo:leading-[1.4] nuevo:text-brand_primary nuevo:duration-150',
  'nuevo:placeholder:text-gray-600 nuevo:hover:border-brand_primary nuevo:focus:border-brand_primary',
  'nuevo:aria-[invalid=true]:border-red-600',
  'nuevo:disabled:border-brand_primary/[0.24] nuevo:disabled:bg-gray-100 nuevo:disabled:text-gray-600'
);

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ className, type = 'text', ...props }, ref) {
  const wiring = useFieldWiring(props);
  return <input ref={ref} type={type} {...props} {...wiring} className={cx(CONTROL, className)} />;
});

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, rows = 4, ...props }, ref) {
  const wiring = useFieldWiring(props);
  return (
    <textarea ref={ref} rows={rows} {...props} {...wiring} className={cx(CONTROL, 'nuevo:min-h-[96px] nuevo:resize-y', className)} />
  );
});

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/** The native select. In the new look it draws its own arrow. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, children, ...props }, ref) {
  const wiring = useFieldWiring(props);
  return (
    <span className="relative block">
      <select ref={ref} {...props} {...wiring} className={cx(CONTROL, 'nuevo:appearance-none nuevo:pr-[2.2em]', className)}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-brand_primary nuevo:block"
      />
    </span>
  );
});

/** A text field with a leading magnifying glass. Give it a `Field` or an `aria-label`. */
export const SearchInput = React.forwardRef<HTMLInputElement, InputProps>(function SearchInput({ className, type = 'search', ...props }, ref) {
  const wiring = useFieldWiring(props);
  return (
    <span className="relative block">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 nuevo:left-[0.75em] nuevo:h-4 nuevo:w-4 nuevo:text-gray-600"
      />
      <input ref={ref} type={type} {...props} {...wiring} className={cx(CONTROL, 'pl-10 nuevo:pl-[2.4em]', className)} />
    </span>
  );
});

/** The controls a `Field` wires (read by `childId`). */
const CONTROLS: unknown[] = [Input, Textarea, Select, SearchInput];

interface ChoiceProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** The words next to the box; clicking them ticks it. */
  label: React.ReactNode;
  /** Help under the words, linked with `aria-describedby`. */
  help?: React.ReactNode;
}

// Alignment and gap are set by each control (a tick box sits at the first line, a switch in the middle).
const CHOICE_ROW = 'flex text-sm text-gray-700 nuevo:text-[0.9375rem] nuevo:text-brand_primary';
const CHOICE_BOX = cx(
  'mt-0.5 h-4 w-4 flex-none cursor-pointer border-gray-300 text-brand_accent focus:ring-brand_accent disabled:cursor-not-allowed',
  'nuevo:m-0 nuevo:mt-[2px] nuevo:h-[18px] nuevo:w-[18px] nuevo:appearance-none nuevo:border nuevo:border-brand_gray_medium nuevo:bg-white',
  'nuevo:checked:border-brand_primary nuevo:checked:bg-brand_primary nuevo:disabled:bg-gray-100'
);

function Choice({ kind, label, help, className, id, required, ...props }: ChoiceProps & { kind: 'checkbox' | 'radio' }, ref: React.ForwardedRef<HTMLInputElement>) {
  const group = React.useContext(GroupContext);
  // A radio of a required group is required (one of the group must be chosen). A tick box is not: in a
  // required group one ticked box is enough, which the group checks (`useAtLeastOneTicked`).
  const isRequired = required ?? (kind === 'radio' && group?.required ? true : undefined);
  const auto = React.useId();
  const inputId = id ?? `${auto}-choice`;
  const helpId = help ? `${auto}-help` : undefined;
  const describedBy = [props['aria-describedby'], helpId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={inputId} className={cx(CHOICE_ROW, 'items-start gap-2 nuevo:gap-[0.6em]', props.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
        <span className="relative inline-flex flex-none">
          <input
            ref={ref}
            id={inputId}
            type={kind}
            {...props}
            required={isRequired}
            aria-describedby={describedBy}
            className={cx(CHOICE_BOX, 'peer', kind === 'checkbox' ? 'rounded nuevo:rounded-sm' : 'rounded-full nuevo:rounded-full')}
          />
          {kind === 'checkbox' ? (
            <Check
              aria-hidden="true"
              strokeWidth={3}
              className="pointer-events-none absolute left-[3px] top-[5px] hidden h-3 w-3 text-white nuevo:peer-checked:block"
            />
          ) : (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-[6px] top-[8px] hidden h-1.5 w-1.5 rounded-full bg-white nuevo:peer-checked:block"
            />
          )}
        </span>
        <span>{label}</span>
      </label>
      {/* Outside the label, so it describes the box without becoming part of its name. */}
      {help && (
        <span id={helpId} className={cx(HELP, 'pl-6 nuevo:pl-[calc(18px+0.6em)]')}>
          {help}
        </span>
      )}
    </div>
  );
}

export type CheckboxProps = ChoiceProps;
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(props, ref) {
  return Choice({ ...props, kind: 'checkbox' }, ref);
});

export type RadioProps = ChoiceProps;
export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(function Radio(props, ref) {
  return Choice({ ...props, kind: 'radio' }, ref);
});

export type SwitchProps = ChoiceProps;

/** An on/off choice: a real checkbox with `role="switch"`, so a form reads it as a checkbox. */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(function Switch({ label, help, className, id, ...props }, ref) {
  const auto = React.useId();
  const inputId = id ?? `${auto}-switch`;
  const helpId = help ? `${auto}-help` : undefined;
  const describedBy = [props['aria-describedby'], helpId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('min-w-0', className)}>
      <label
        htmlFor={inputId}
        className={cx(CHOICE_ROW, 'items-center gap-3', props.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}
      >
        <span className="relative inline-flex flex-none">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            role="switch"
            {...props}
            aria-describedby={describedBy}
            className={cx(
              'peer h-6 w-11 flex-none cursor-pointer appearance-none rounded-full bg-gray-200 transition-colors checked:bg-brand_primary',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent focus-visible:ring-offset-2 disabled:cursor-not-allowed',
              'motion-reduce:transition-none',
              'nuevo:h-[22px] nuevo:w-[38px] nuevo:bg-gray-600/55 nuevo:duration-150 nuevo:checked:bg-brand_primary'
            )}
          />
          <span
            aria-hidden="true"
            className={cx(
              'pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5',
              'motion-reduce:transition-none',
              'nuevo:left-[3px] nuevo:top-[3px] nuevo:h-4 nuevo:w-4 nuevo:[box-shadow:none] nuevo:duration-150 nuevo:peer-checked:translate-x-4'
            )}
          />
        </span>
        <span>{label}</span>
      </label>
      {help && (
        <span id={helpId} className={cx(HELP, 'pl-14 nuevo:pl-[50px]')}>
          {help}
        </span>
      )}
    </div>
  );
});
