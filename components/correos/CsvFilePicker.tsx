import React, { useId, useRef, useState } from 'react';
import { Button, Notice } from '../ui/kit';
import { MAX_CSV_BYTES } from '../../lib/correos/csv';

export interface PickedFile {
  name: string;
  size: number;
  text: string;
}

/**
 * The file-upload piece the redesign kit lacks: one button that opens the file chooser, the chosen file's name,
 * and a plain message when it cannot be read. The file is read here, in the browser, as text: UTF-8 first; a
 * file that is not valid UTF-8 is read as Windows-1252 (how spreadsheet programs often save CSV). Whether the
 * text is a usable contact file is decided by the server.
 */
export function CsvFilePicker({
  file,
  onFile,
  disabled = false,
}: {
  file: PickedFile | null;
  onFile: (file: PickedFile | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const choose = async (picked: File | undefined) => {
    setError(null);
    if (!picked) return;
    if (picked.size > MAX_CSV_BYTES) {
      onFile(null);
      setError('El archivo pesa más de 8 MB. Divídelo en archivos más pequeños.');
      return;
    }
    setReading(true);
    try {
      const bytes = await picked.arrayBuffer();
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        text = new TextDecoder('windows-1252').decode(bytes);
      }
      onFile({ name: picked.name, size: picked.size, text });
    } catch {
      onFile(null);
      setError('No se pudo leer el archivo. Inténtalo de nuevo.');
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700 nuevo:text-[0.8125rem] nuevo:font-semibold nuevo:text-brand_primary">
        Archivo CSV
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => choose(event.currentTarget.files?.[0])}
        data-testid="correos-importar-archivo"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" loading={reading} disabled={disabled} onClick={() => inputRef.current?.click()}>
          {file ? 'Elegir otro archivo' : 'Elegir archivo'}
        </Button>
        <span className="text-sm text-gray-700" data-testid="correos-importar-nombre">
          {file ? `${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)` : 'Ningún archivo elegido'}
        </span>
      </div>
      <p className="text-xs text-gray-600">
        La primera fila nombra las columnas: «correo» (obligatoria), y si quieres «nombre», «apellido» y «organización».
        Separado por comas o por punto y coma. Hasta 20.000 filas.
      </p>
      {error ? (
        <Notice tone="error" title="No se pudo usar el archivo.">
          {error}
        </Notice>
      ) : null}
    </div>
  );
}
