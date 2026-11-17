// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Checkbox, Field, Input, Radio, SearchInput, Select, Switch, Textarea } from '../../../../components/ui/kit';

/** Redesign 5c — Field and its controls: the wiring between label, help, error and control. */
const describedIds = (element: HTMLElement) => (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);

describe('Field', () => {
  it('the label names the control', () => {
    render(
      <Field label="Nombre de la sesión">
        <Input />
      </Field>
    );
    const input = screen.getByLabelText('Nombre de la sesión');
    expect(input.tagName).toBe('INPUT');
    expect(input.id).not.toBe('');
  });

  it('keeps an id it is given', () => {
    render(
      <Field label="Correo" controlId="correo-kit">
        <Input type="email" />
      </Field>
    );
    expect(screen.getByLabelText('Correo')).toHaveAttribute('id', 'correo-kit');
  });

  it('aria-describedby holds the help and the error; the error marks it invalid', () => {
    render(
      <Field label="Correo" help="Te escribiremos aquí." error="Ingresa un correo válido.">
        <Input type="email" aria-describedby="otra-nota" />
      </Field>
    );
    const input = screen.getByLabelText('Correo');
    const ids = describedIds(input);
    const texts = ids.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toContain('Te escribiremos aquí.');
    expect(texts).toContain('Ingresa un correo válido.');
    expect(ids).toContain('otra-nota');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/Te escribiremos aquí\..*Ingresa un correo válido\./);
  });

  it('without an error the control is not marked invalid', () => {
    render(
      <Field label="Nombre" help="Así la verán.">
        <Input />
      </Field>
    );
    const input = screen.getByLabelText('Nombre');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).toHaveAccessibleDescription('Así la verán.');
  });

  it('required: the control is required and aria-required; the mark is hidden from screen readers', () => {
    render(
      <Field label="Nombre" required>
        <Input />
      </Field>
    );
    // The mark is not part of the name.
    const input = screen.getByRole('textbox', { name: 'Nombre' });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
  });

  it('disabled reaches the control', () => {
    render(
      <Field label="Campo bloqueado" disabled>
        <Input defaultValue="No editable" />
      </Field>
    );
    expect(screen.getByLabelText('Campo bloqueado')).toBeDisabled();
  });

  it('wires a textarea, a select and a search box the same way', () => {
    render(
      <>
        <Field label="Descripción" help="Objetivos.">
          <Textarea />
        </Field>
        <Field label="Colegio" error="Elige uno.">
          <Select defaultValue="">
            <option value="">Selecciona</option>
            <option value="a">Colegio Ejemplo</option>
          </Select>
        </Field>
        <Field label="Buscar">
          <SearchInput />
        </Field>
      </>
    );
    expect(screen.getByLabelText('Descripción').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Descripción')).toHaveAccessibleDescription('Objetivos.');
    expect(screen.getByLabelText('Colegio').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Colegio')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toBeInTheDocument();
  });

  it('forwards refs and native props', async () => {
    const ref = React.createRef<HTMLInputElement>();
    render(
      <Field label="Nombre">
        <Input ref={ref} data-testid="kit-name" maxLength={10} />
      </Field>
    );
    expect(ref.current).toBe(screen.getByTestId('kit-name'));
    await userEvent.type(ref.current as HTMLInputElement, 'Sesión de prueba larga');
    expect(ref.current).toHaveValue('Sesión de ');
  });

  it('two fields get two different ids', () => {
    render(
      <>
        <Field label="Uno">
          <Input />
        </Field>
        <Field label="Dos">
          <Input />
        </Field>
      </>
    );
    expect(screen.getByLabelText('Uno').id).not.toBe(screen.getByLabelText('Dos').id);
  });

  it('a group is a fieldset named by its legend', () => {
    render(
      <Field label="Modalidad" group help="Una sola.">
        <Radio name="modalidad" value="presencial" label="Presencial" />
        <Radio name="modalidad" value="en-linea" label="En línea" />
      </Field>
    );
    const group = screen.getByRole('group', { name: 'Modalidad' });
    expect(group.tagName).toBe('FIELDSET');
    expect(group).toHaveAccessibleDescription('Una sola.');
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });
});

describe('Checkbox, Radio, Switch', () => {
  it('a checkbox is ticked by clicking its words', async () => {
    render(<Checkbox label="Enviar recordatorio" help="Un día antes." />);
    const box = screen.getByRole('checkbox', { name: 'Enviar recordatorio' });
    expect(box).toHaveAccessibleDescription('Un día antes.');
    await userEvent.click(screen.getByText('Enviar recordatorio'));
    expect(box).toBeChecked();
  });

  it('radios of one name exclude each other', async () => {
    render(
      <>
        <Radio name="m" value="a" label="Presencial" defaultChecked />
        <Radio name="m" value="b" label="En línea" />
      </>
    );
    await userEvent.click(screen.getByRole('radio', { name: 'En línea' }));
    expect(screen.getByRole('radio', { name: 'En línea' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Presencial' })).not.toBeChecked();
  });

  it('a switch is a checkbox with role="switch" that turns on and off', async () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Switch ref={ref} label="Notificaciones activas" />);
    const toggle = screen.getByRole('switch', { name: 'Notificaciones activas' });
    expect(toggle).toBe(ref.current);
    expect(toggle).toHaveAttribute('type', 'checkbox');
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(toggle).toBeChecked();
    await userEvent.keyboard(' ');
    expect(toggle).not.toBeChecked();
  });

  it('a disabled choice cannot be changed', async () => {
    render(<Checkbox label="Bloqueada" disabled />);
    const box = screen.getByRole('checkbox', { name: 'Bloqueada' });
    await userEvent.click(box);
    expect(box).not.toBeChecked();
  });
});
