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
});
afterAll(() => {
  for (const name of ['scrollWidth', 'clientWidth', 'scrollLeft']) {
    delete (HTMLElement.prototype as any)[name];
  }
  delete (HTMLElement.prototype as any).scrollBy;
});
beforeEach(() => {
  scrollBy.mockClear();
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
