// @vitest-environment jsdom
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  type SortDirection,
} from '../../../../components/ui/kit';

/** Redesign 5c — Table and Pagination. Invented rows. */
function Sample({ sort = 'none', onSort = vi.fn(), selected = 'b' }: { sort?: SortDirection; onSort?: () => void; selected?: string }) {
  const rows = [
    { id: 'a', name: 'Docente Uno', school: 'Colegio Ejemplo Norte' },
    { id: 'b', name: 'Docente Dos', school: 'Escuela Ejemplo Sur' },
  ];
  return (
    <Table stackOnPhone aria-label="Usuarios de ejemplo">
      <TableHead>
        <TableRow>
          <TableHeaderCell sort={sort} onSort={onSort}>
            Nombre
          </TableHeaderCell>
          <TableHeaderCell>Colegio</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} selected={row.id === selected} data-testid={`row-${row.id}`}>
            <TableCell primary label="Nombre">
              {row.name}
            </TableCell>
            <TableCell label="Colegio">{row.school}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

describe('Table', () => {
  it('is a real table with column headers and cells', () => {
    render(<Sample />);
    const table = screen.getByRole('table', { name: 'Usuarios de ejemplo' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    // jsdom applies no stylesheet, so the phone's column name (not drawn at desktop width) is part of the name here.
    expect(within(table).getByRole('cell', { name: /Escuela Ejemplo Sur$/ })).toBeInTheDocument();
  });

  it('a sortable header says its order with aria-sort and asks for another with a button', async () => {
    const onSort = vi.fn();
    const { rerender } = render(<Sample sort="none" onSort={onSort} />);
    const header = screen.getByRole('columnheader', { name: 'Nombre' });
    expect(header).toHaveAttribute('aria-sort', 'none');
    await userEvent.click(within(header).getByRole('button', { name: 'Nombre' }));
    expect(onSort).toHaveBeenCalledTimes(1);
    rerender(<Sample sort="ascending" onSort={onSort} />);
    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toHaveAttribute('aria-sort', 'ascending');
    rerender(<Sample sort="descending" onSort={onSort} />);
    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toHaveAttribute('aria-sort', 'descending');
  });

  it('a header that cannot sort has no aria-sort and no button', () => {
    render(<Sample />);
    const header = screen.getByRole('columnheader', { name: 'Colegio' });
    expect(header).not.toHaveAttribute('aria-sort');
    expect(within(header).queryByRole('button')).toBeNull();
  });

  it('marks the selected row, and only that one', () => {
    render(<Sample selected="b" />);
    expect(screen.getByTestId('row-b')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('row-a')).toHaveAttribute('aria-selected', 'false');
  });

  it('every cell carries its column name for the phone cards', () => {
    render(<Sample />);
    for (const cell of screen.getAllByRole('cell')) expect(cell.getAttribute('data-label')).toMatch(/^(Nombre|Colegio)$/);
  });

  // 5c send-back 1, defect 1: under 760 px the parts become block and flex boxes; an explicit role on
  // each keeps them a table for the browser and the screen reader.
  it('every part carries its explicit role, so the phone cards stay a table', () => {
    render(<Sample />);
    const table = screen.getByRole('table', { name: 'Usuarios de ejemplo' });
    expect(table).toHaveAttribute('role', 'table');
    const groups = table.querySelectorAll('thead, tbody');
    expect(groups).toHaveLength(2);
    for (const group of Array.from(groups)) expect(group).toHaveAttribute('role', 'rowgroup');
    for (const row of Array.from(table.querySelectorAll('tr'))) expect(row).toHaveAttribute('role', 'row');
    for (const header of Array.from(table.querySelectorAll('th'))) expect(header).toHaveAttribute('role', 'columnheader');
    for (const cell of Array.from(table.querySelectorAll('td'))) expect(cell).toHaveAttribute('role', 'cell');
  });

  it('a header cell for a row is a row header', () => {
    render(
      <Table aria-label="Filas con nombre">
        <TableBody>
          <TableRow>
            <TableHeaderCell scope="row">Docente Uno</TableHeaderCell>
            <TableCell>Colegio Ejemplo Norte</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByRole('rowheader', { name: 'Docente Uno' })).toHaveAttribute('role', 'rowheader');
  });

  it('a stacked cell names its column in real text, not in generated content, and only on a phone', () => {
    render(<Sample />);
    const school = screen.getByRole('cell', { name: /Escuela Ejemplo Sur/ });
    const name = school.querySelector('[data-kit="cell-label"]');
    expect(name).not.toBeNull();
    expect(name).toHaveTextContent(/^Colegio$/);
    // Not drawn and not read at desktop width (the column header does that work there); shown on a phone.
    const classes = (name as HTMLElement).className.split(/\s+/);
    expect(classes).toContain('hidden');
    expect(classes).toContain('max-[760px]:inline');
    // No generated text left behind.
    expect(school.className).not.toMatch(/content-\[attr\(data-label\)\]/);
    // The card's title shows no name.
    expect(screen.getByRole('cell', { name: 'Docente Dos' }).querySelector('[data-kit="cell-label"]')).toBeNull();
  });

  it('a table that does not stack has no column names in its cells', () => {
    render(
      <Table aria-label="Sin tarjetas">
        <TableBody>
          <TableRow>
            <TableCell label="Colegio">Colegio Ejemplo Norte</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByRole('cell', { name: 'Colegio Ejemplo Norte' }).querySelector('[data-kit="cell-label"]')).toBeNull();
  });
});

describe('Pagination', () => {
  function Pages({ total = 12, initial = 1 }: { total?: number; initial?: number }) {
    const [page, setPage] = React.useState(initial);
    return <Pagination page={page} pageSize={5} total={total} onPageChange={setPage} noun="filas" data-testid="kit-pages" />;
  }

  it('says which rows it shows; «Anterior» is disabled on the first page', () => {
    render(<Pages />);
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeInTheDocument();
    expect(screen.getByTestId('kit-pages-range')).toHaveTextContent('Mostrando 1–5 de 12 filas');
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  it('moves page by page; «Siguiente» is disabled on the last page', async () => {
    render(<Pages />);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByTestId('kit-pages-range')).toHaveTextContent('Mostrando 6–10 de 12 filas');
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByTestId('kit-pages-range')).toHaveTextContent('Mostrando 11–12 de 12 filas');
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByTestId('kit-pages-range')).toHaveTextContent('Mostrando 6–10 de 12 filas');
  });

  it('with nothing to show, both ends are disabled', () => {
    render(<Pages total={0} />);
    expect(screen.getByTestId('kit-pages-range')).toHaveTextContent('Mostrando 0 de 0 filas');
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
});
