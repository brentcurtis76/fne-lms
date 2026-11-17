import * as React from 'react';
import { Button } from './Button';

/**
 * Not rendered anywhere: read only by `npm run type-check` (which skips `__tests__/`). If an icon-only
 * button without an `aria-label` ever stopped being a type error, the `@ts-expect-error` below would
 * itself fail the type-check.
 */
export function ButtonTypeChecks() {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const linkRef = React.useRef<HTMLAnchorElement>(null);
  return (
    <>
      {/* @ts-expect-error iconOnly requires aria-label */}
      <Button iconOnly>
        <svg />
      </Button>
      <Button iconOnly aria-label="Cerrar">
        <svg />
      </Button>
      <Button ref={buttonRef} type="submit" data-testid="typecheck-button">
        Guardar
      </Button>
      <Button ref={linkRef} href="/dashboard" target="_blank">
        Panel
      </Button>
    </>
  );
}
