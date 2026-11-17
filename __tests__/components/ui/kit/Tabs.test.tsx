// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tab, TabLinks, TabList, TabPanel, Tabs } from '../../../../components/ui/kit';

/** Redesign 5c — Tabs and TabLinks. */
function Sample({ onValueChange }: { onValueChange?: (value: string) => void }) {
  return (
    <Tabs defaultValue="detalles" onValueChange={onValueChange}>
      <TabList label="Secciones de la sesión">
        <Tab value="detalles">Detalles</Tab>
        <Tab value="materiales">Materiales</Tab>
        <Tab value="informe">Informe</Tab>
        <Tab value="actividad">Actividad</Tab>
      </TabList>
      <TabPanel value="detalles">Contenido de detalles</TabPanel>
      <TabPanel value="materiales">Contenido de materiales</TabPanel>
      <TabPanel value="informe">Contenido del informe</TabPanel>
      <TabPanel value="actividad">Contenido de actividad</TabPanel>
    </Tabs>
  );
}

const tab = (name: string) => screen.getByRole('tab', { name });

describe('Tabs', () => {
  it('has the roles; the panel is named by its tab and the tab controls its panel', () => {
    render(<Sample />);
    expect(screen.getByRole('tablist', { name: 'Secciones de la sesión' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    const panel = screen.getByRole('tabpanel', { name: 'Detalles' });
    expect(panel).toHaveTextContent('Contenido de detalles');
    expect(tab('Detalles')).toHaveAttribute('aria-controls', panel.id);
    expect(tab('Detalles')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Materiales')).toHaveAttribute('aria-selected', 'false');
  });

  it('only the selected tab is in the tab order', () => {
    render(<Sample />);
    expect(tab('Detalles')).toHaveAttribute('tabindex', '0');
    for (const name of ['Materiales', 'Informe', 'Actividad']) expect(tab(name)).toHaveAttribute('tabindex', '-1');
  });

  it('a click selects a tab and shows its panel', async () => {
    const onValueChange = vi.fn();
    render(<Sample onValueChange={onValueChange} />);
    await userEvent.click(tab('Informe'));
    expect(tab('Informe')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Informe' })).toHaveTextContent('Contenido del informe');
    expect(screen.queryByText('Contenido de detalles')).toBeNull();
    expect(onValueChange).toHaveBeenCalledWith('informe');
  });

  it('Right and Left move and select, wrapping at the ends', async () => {
    render(<Sample />);
    tab('Detalles').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(tab('Materiales')).toHaveFocus();
    expect(tab('Materiales')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Materiales')).toHaveAttribute('tabindex', '0');
    expect(tab('Detalles')).toHaveAttribute('tabindex', '-1');
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(tab('Actividad')).toHaveFocus();
    expect(tab('Actividad')).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowRight}');
    expect(tab('Detalles')).toHaveFocus();
  });

  it('Home and End go to the first and the last', async () => {
    render(<Sample />);
    tab('Detalles').focus();
    await userEvent.keyboard('{End}');
    expect(tab('Actividad')).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Actividad' })).toBeInTheDocument();
    await userEvent.keyboard('{Home}');
    expect(tab('Detalles')).toHaveFocus();
    expect(tab('Detalles')).toHaveAttribute('aria-selected', 'true');
  });

  it('Tab leaves the row for the panel', async () => {
    render(<Sample />);
    tab('Detalles').focus();
    await userEvent.tab();
    expect(screen.getByRole('tabpanel')).toHaveFocus();
  });

  // 5c send-back 1, defect 7a: there is always one way in by the keyboard.
  it('with nothing selected, the first enabled tab is the tab stop', async () => {
    render(
      <>
        <button type="button">Antes</button>
        <Tabs>
          <TabList label="Sin elegir">
            <Tab value="uno" disabled>
              Uno
            </Tab>
            <Tab value="dos">Dos</Tab>
            <Tab value="tres">Tres</Tab>
          </TabList>
        </Tabs>
      </>
    );
    expect(tab('Dos')).toHaveAttribute('tabindex', '0');
    expect(tab('Tres')).toHaveAttribute('tabindex', '-1');
    screen.getByRole('button', { name: 'Antes' }).focus();
    await userEvent.tab();
    expect(tab('Dos')).toHaveFocus();
  });

  it('when the selected tab is disabled, the first enabled tab is the tab stop', async () => {
    function Disabling() {
      const [off, setOff] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOff(true)}>
            Bloquear
          </button>
          <Tabs value="dos">
            <TabList label="Bloqueable">
              <Tab value="uno">Uno</Tab>
              <Tab value="dos" disabled={off}>
                Dos
              </Tab>
            </TabList>
          </Tabs>
        </>
      );
    }
    render(<Disabling />);
    expect(tab('Dos')).toHaveAttribute('tabindex', '0');
    expect(tab('Uno')).toHaveAttribute('tabindex', '-1');
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    expect(tab('Uno')).toHaveAttribute('tabindex', '0');
    await userEvent.tab();
    expect(tab('Uno')).toHaveFocus();
  });

  // 5c send-back 1, defect 7b.
  it('values that differ only in signs get different ids, and each panel is named by its own tab', async () => {
    render(
      <Tabs defaultValue="por escuela">
        <TabList label="Vistas">
          <Tab value="por escuela">Por escuela</Tab>
          <Tab value="por/escuela">Por red</Tab>
          <Tab value="por_escuela">Por comuna</Tab>
        </TabList>
        <TabPanel value="por escuela">Vista uno</TabPanel>
        <TabPanel value="por/escuela">Vista dos</TabPanel>
        <TabPanel value="por_escuela">Vista tres</TabPanel>
      </Tabs>
    );
    const ids = screen.getAllByRole('tab').map((element) => element.id);
    expect(new Set(ids).size).toBe(3);
    const controls = screen.getAllByRole('tab').map((element) => element.getAttribute('aria-controls'));
    expect(new Set(controls).size).toBe(3);
    expect(screen.getByRole('tabpanel', { name: 'Por escuela' })).toHaveTextContent('Vista uno');
    await userEvent.click(tab('Por red'));
    expect(screen.getByRole('tabpanel', { name: 'Por red' })).toHaveTextContent('Vista dos');
    expect(tab('Por red')).toHaveAttribute('aria-controls', screen.getByRole('tabpanel').id);
    await userEvent.click(tab('Por comuna'));
    expect(screen.getByRole('tabpanel', { name: 'Por comuna' })).toHaveTextContent('Vista tres');
  });

  it('controlled: the parent decides', async () => {
    function Controlled() {
      const [value, setValue] = React.useState('materiales');
      return (
        <>
          <p data-testid="value">{value}</p>
          <Tabs value={value} onValueChange={setValue}>
            <TabList label="Vista">
              <Tab value="detalles">Detalles</Tab>
              <Tab value="materiales">Materiales</Tab>
            </TabList>
            <TabPanel value="detalles">A</TabPanel>
            <TabPanel value="materiales">B</TabPanel>
          </Tabs>
        </>
      );
    }
    render(<Controlled />);
    expect(tab('Materiales')).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(tab('Detalles'));
    expect(screen.getByTestId('value')).toHaveTextContent('detalles');
    expect(tab('Detalles')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('TabLinks', () => {
  it('renders links; the current one has aria-current="page"', () => {
    render(
      <TabLinks
        label="Configuración"
        items={[
          { href: '/configuracion/notificaciones', label: 'Notificaciones' },
          { href: '/configuracion/apariencia', label: 'Apariencia', current: true },
        ]}
      />
    );
    expect(screen.getByRole('navigation', { name: 'Configuración' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Apariencia' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Notificaciones' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Notificaciones' })).toHaveAttribute('href', '/configuracion/notificaciones');
  });
});
