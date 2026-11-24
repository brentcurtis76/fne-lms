import React, { useEffect, useState } from 'react';
import { Checkbox, Field, LoadingBlock, Notice } from '../ui/kit';
import { callApi, failureText } from './api';

export interface PickableList {
  id: string;
  name: string;
  archived_at: string | null;
}

/** Tick one or more lists that are not archived. Nothing is ticked at first. */
export function ListPicker({
  value,
  onChange,
  idPrefix,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  idPrefix: string;
}) {
  const [lists, setLists] = useState<PickableList[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    callApi<{ lists: PickableList[] }>('/api/admin/correos/listas').then((answer) => {
      if (!alive) return;
      if (answer.status === 200 && answer.body) setLists(answer.body.lists.filter((list) => !list.archived_at));
      else setError(failureText(answer));
    });
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <Notice tone="error" title="No se pudieron cargar las listas.">{error}</Notice>;
  if (!lists) return <LoadingBlock label="Cargando las listas" />;
  if (lists.length === 0) {
    return <Notice tone="warning" title="No hay listas.">Crea una lista antes de agregar personas.</Notice>;
  }

  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...value, id] : value.filter((item) => item !== id));
  };

  return (
    <Field label="Listas" group required help="Elige una o más. La persona queda suscrita a cada una.">
      {lists.map((list) => (
        <Checkbox
          key={list.id}
          id={`${idPrefix}-lista-${list.id}`}
          label={list.name}
          checked={value.includes(list.id)}
          onChange={(event) => toggle(list.id, event.currentTarget.checked)}
          data-testid={`${idPrefix}-lista`}
          data-list-name={list.name}
        />
      ))}
    </Field>
  );
}
