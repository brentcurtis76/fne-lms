// @vitest-environment jsdom
/**
 * Redesign 6B: the arrows of a row in the new «Mi Panel» (`components/panel/PanelSection.tsx`).
 * Shown only when the row holds more than fits (not under the pointer), disabled at an end, moving
 * the row by 80% of its visible width; measured again on scroll, on resize and when the cards change.
 * jsdom lays nothing out, so the row's sizes are given by hand.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelSection } from '@/components/panel/PanelSection';

const geo = { scrollWidth: 0, clientWidth: 0, scrollLeft: 0 };
const isRow = (el: Element) => (el.getAttribute('data-testid') ?? '').endsWith('-row');
const scrollBy = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
  geo.scrollLeft = Math.max(0, Math.min(geo.scrollWidth - geo.clientWidth, geo.scrollLeft + (options.left ?? 0)));
  this.dispatchEvent(new Event('scroll'));
});
const scrolledToBy: HTMLElement[] = [];
const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
  scrolledToBy.push(this);
  if (isRow(this)) geo.scrollLeft = options.left ?? geo.scrollLeft;
});
const saved: Record<string, PropertyDescriptor | undefined> = {};

beforeAll(() => {
  for (const name of ['scrollWidth', 'clientWidth'] as const) {
    saved[name] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) {
        return isRow(this) ? geo[name] : 0;
      },
    });
  }
  saved.scrollLeft = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
  Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
    configurable: true,
    get(this: HTMLElement) {
      return isRow(this) ? geo.scrollLeft : 0;
    },
    set(value: number) {
      geo.scrollLeft = value;
    },
  });
  (HTMLElement.prototype as any).scrollBy = scrollBy;
  (HTMLElement.prototype as any).scrollTo = scrollTo;
});
afterAll(() => {
  for (const name of ['scrollWidth', 'clientWidth', 'scrollLeft']) {
    delete (HTMLElement.prototype as any)[name];
  }
  delete (HTMLElement.prototype as any).scrollBy;
  delete (HTMLElement.prototype as any).scrollTo;
});
beforeEach(() => {
  scrollBy.mockClear();
  scrollTo.mockClear();
  scrolledToBy.length = 0;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: query.includes('reduce') ? reduce.on : false, addEventListener() {}, removeEventListener() {} }),
  });
  reduce.on = false;
});
const reduce = { on: false };

const cards = (n: number) => Array.from({ length: n }, (_, i) => <div key={i}>Tarjeta {i + 1}</div>);

function row(n = 5, itemsKey = 'a') {
  return (
    <PanelSection title="Continuar Aprendiendo" row itemsKey={itemsKey} data-testid="panel-section-x">
      {cards(n)}
    </PanelSection>
  );
}

const left = () => screen.queryByRole('button', { name: 'Desplazar izquierda' }) as HTMLButtonElement | null;
const right = () => screen.queryByRole('button', { name: 'Desplazar derecha' }) as HTMLButtonElement | null;

describe('the arrows of a row', () => {
  it('a row that fits: no arrows', () => {
    Object.assign(geo, { scrollWidth: 500, clientWidth: 600, scrollLeft: 0 });
    render(row());
    expect(left()).toBeNull();
    expect(right()).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Continuar Aprendiendo' })).toBeTruthy();
  });

  it('a row with more: both shown without any pointer; the left one disabled at the start', () => {
    Object.assign(geo, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 0 });
    render(row());
    expect(left()!.disabled).toBe(true);
    expect(right()!.disabled).toBe(false);
    expect(left()!.getAttribute('data-testid')).toBe('panel-section-x-left');
    expect(right()!.getAttribute('data-testid')).toBe('panel-section-x-right');
  });

  it('each arrow moves the row by 80% of its visible width; the right one disabled at the end', () => {
    Object.assign(geo, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 0 });
    render(row());
    fireEvent.click(right()!);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 320, behavior: 'smooth' });
    expect(left()!.disabled).toBe(false);
    fireEvent.click(right()!);
    expect(geo.scrollLeft).toBe(600);
    expect(right()!.disabled).toBe(true);
    fireEvent.click(left()!);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -320, behavior: 'smooth' });
    expect(right()!.disabled).toBe(false);
  });

  it('no smooth motion when the person asks for less motion', () => {
    reduce.on = true;
    Object.assign(geo, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 0 });
    render(row());
    fireEvent.click(right()!);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 320, behavior: 'auto' });
  });

  it('measured again on a resize of the window and when the cards change', () => {
    Object.assign(geo, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 0 });
    const view = render(row(5, 'a'));
    expect(right()).not.toBeNull();
    geo.clientWidth = 1200;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(right()).toBeNull();
    geo.scrollWidth = 1800;
    view.rerender(row(7, 'b'));
    expect(right()).not.toBeNull();
  });

  it('a section that is not a row: no arrows, its children as they are', () => {
    Object.assign(geo, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 0 });
    render(
      <PanelSection title="Mis Rutas de Aprendizaje" sub="Una línea" action={<a href="/mi-aprendizaje">Ver todas</a>}>
        <p>Contenido</p>
      </PanelSection>
    );
    expect(left()).toBeNull();
    expect(screen.getByText('Una línea')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver todas' }).getAttribute('href')).toBe('/mi-aprendizaje');
  });
});

/*
 * Send-back «by sight», point 3: when `startKey` changes the row goes back to its start (smoothly, as
 * the arrows move it; at once under reduced motion); never on the first draw nor on another re-render.
 * The track does not let the browser anchor its scroll.
 */
describe('the row back to its start when `startKey` changes', () => {
  function keyed(startKey: number, n = 5, itemsKey = 'a') {
    return (
      <PanelSection title="Propuestas de Cursos" row itemsKey={itemsKey} startKey={startKey} data-testid="panel-section-x">
        {cards(n)}
      </PanelSection>
    );
  }

  it('the first draw does not move the row, whatever the key', () => {
    Object.assign(geo, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 300 });
    render(keyed(3));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(geo.scrollLeft).toBe(300);
  });

  it('a key first given after draws without one (a loading state before): no movement', () => {
    Object.assign(geo, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 300 });
    const view = render(
      <PanelSection title="Propuestas de Cursos" row itemsKey="a" data-testid="panel-section-x">
        {cards(5)}
      </PanelSection>
    );
    view.rerender(keyed(0, 5, 'b'));
    expect(scrollTo).not.toHaveBeenCalled();
    view.rerender(keyed(1, 6, 'c'));
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('a new key: the track goes to 0, as the arrows move it', () => {
    Object.assign(geo, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 300 });
    const view = render(keyed(0));
    view.rerender(keyed(1, 6, 'b'));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' });
    expect(scrolledToBy[0]).toBe(screen.getByTestId('panel-section-x-row'));
    expect(geo.scrollLeft).toBe(0);
  });

  it('under reduced motion it goes at once', () => {
    reduce.on = true;
    Object.assign(geo, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 300 });
    const view = render(keyed(0));
    view.rerender(keyed(1, 6, 'b'));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'auto' });
  });

  it('the same key on a re-render, with other cards (edited, deleted): no movement', () => {
    Object.assign(geo, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 300 });
    const view = render(keyed(2));
    view.rerender(keyed(2, 4, 'b'));
    view.rerender(keyed(2, 4, 'c'));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(geo.scrollLeft).toBe(300);
  });

  it('the track does not anchor its scroll', () => {
    Object.assign(geo, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 0 });
    render(keyed(0));
    expect(screen.getByTestId('panel-section-x-row').className.split(/\s+/)).toContain('[overflow-anchor:none]');
  });
});
