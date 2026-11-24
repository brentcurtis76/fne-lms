import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ExternalLink, Paperclip, Trash2, Upload } from 'lucide-react';
import { Button, ConfirmDialog, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, buttonClasses } from '../../ui/kit';
import type { SessionMaterial } from '../../../lib/types/consultor-sessions.types';
import type { SessionDetail, SessionDetailDecisions } from '../../../hooks/useSessionDetail';

type MaterialRow = SessionMaterial & { profiles?: { first_name: string; last_name: string; email: string }; download_url?: string };

/**
 * «Materiales» in the new look: today's upload control (the same file input, `fileInputRef`), the same
 * columns, the open link and the bin under today's rule (`canDeleteMaterial`). Approved: the rows stack
 * on a phone, the two icon buttons are named («Abrir {archivo}», «Eliminar {archivo}»), and the bin asks
 * in a pop-up titled with today's question, then calls the same deletion as today's view.
 */
export default function MaterialsNuevo({ detail, decisions }: { detail: SessionDetail; decisions: SessionDetailDecisions }) {
  const { uploadingMaterial, fileInputRef, handleUploadMaterial, deleteMaterialConfirmed, formatFileSize } = detail;
  const { canChange, listMaterials, uploaderName, canDeleteMaterial } = decisions;
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const materials = listMaterials() as MaterialRow[];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {canChange() && (
        <div className="flex justify-end">
          <label
            className={`${buttonClasses({ variant: 'default' })} cursor-pointer focus-within:ring-2 focus-within:ring-brand_accent focus-within:ring-offset-2`}
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {uploadingMaterial ? 'Subiendo...' : 'Subir material'}
            <input ref={fileInputRef} type="file" onChange={handleUploadMaterial} disabled={uploadingMaterial} className="sr-only" />
          </label>
        </div>
      )}

      {materials.length === 0 ? (
        <div className="grid justify-items-center gap-3 py-12 text-center text-gray-600">
          <Paperclip className="h-10 w-10 text-gray-400" aria-hidden="true" />
          <p>No hay materiales subidos</p>
        </div>
      ) : (
        <Table stackOnPhone>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Archivo</TableHeaderCell>
              <TableHeaderCell>Tipo</TableHeaderCell>
              <TableHeaderCell>Tamaño</TableHeaderCell>
              <TableHeaderCell>Subido por</TableHeaderCell>
              <TableHeaderCell>Fecha</TableHeaderCell>
              <TableHeaderCell align="right">Acciones</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {materials.map((material) => {
              const uploaderNameText = uploaderName(material);
              return (
                <TableRow key={material.id}>
                  <TableCell primary className="font-semibold">
                    <span className="break-all">{material.file_name}</span>
                  </TableCell>
                  <TableCell label="Tipo">
                    <span className="break-all text-gray-600">{material.file_type}</span>
                  </TableCell>
                  <TableCell label="Tamaño">{formatFileSize(material.file_size)}</TableCell>
                  <TableCell label="Subido por">{uploaderNameText}</TableCell>
                  <TableCell label="Fecha">{format(parseISO(material.created_at), 'dd MMM yyyy', { locale: es })}</TableCell>
                  <TableCell label="Acciones" align="right">
                    <span className="inline-flex items-center gap-1">
                      {material.download_url && (
                        <Button
                          variant="quiet"
                          iconOnly
                          href={material.download_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir ${material.file_name}`}
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      {canDeleteMaterial(material) && (
                        <Button
                          variant="quiet"
                          iconOnly
                          aria-label={`Eliminar ${material.file_name}`}
                          onClick={() => setToDelete({ id: material.id, name: material.file_name })}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={toDelete ? `¿Está seguro que desea eliminar "${toDelete.name}"?` : ''}
        confirmLabel="Eliminar"
        tone="danger"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const chosen = toDelete;
          setToDelete(null);
          if (chosen) void deleteMaterialConfirmed(chosen.id);
        }}
        data-testid="session-material-delete"
      />
    </div>
  );
}
