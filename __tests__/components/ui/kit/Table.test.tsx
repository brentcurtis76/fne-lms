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
    expect(within(table).getByRole('cell', { name: 'Escuela Ejemplo Sur' })).toBeInTheDocument();
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
