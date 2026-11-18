/**
 * GET /api/community/documents/<id>/link[?download=1][&version=<id>]
 *
 * F12d (EC-S3): the one way to open, preview or download a community
 * document. Answers a link to the document's file signed for five minutes,
 * for a person who may read the document's record.
 *
 * Who may: the record is read WITH THE CALLER'S SESSION, so the table's own
 * read rule decides (people who may enter the document's workspace; only
 * active documents). A hidden document, another community's document and a
 * missing one all get the same 404, as does a malformed id.
 *
 * Where the file is: lib/storage/community-document-link.ts works out the
 * store (storage_bucket, empty = the old store `resources`) and the object's
 * name (the stored key, or the key inside an old full address), and refuses
 * anything outside documents/<that document's workspace id>/. Only the
 * signing uses the service client. `version=<document_versions id>` signs
 * that version's file instead; the version must belong to the document.
 * `download=1` asks the store to answer "save this file" under the
 * document's file name. The stored value and the link are never logged.
 * Built on pages/api/contracts/invoice-link.ts.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createApiSupabaseClient, createServiceRoleClient, requireVerifiedCaller } from '../../../../../lib/api-auth';
import {
  DOCUMENT_LINK_SECONDS,
  documentObjectName,
  documentStore,
} from '../../../../../lib/storage/community-document-link';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = { error: 'Documento no encontrado' };
const SERVER_ERROR = { error: 'Error interno del servidor' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const caller = await requireVerifiedCaller(req, res);
  if (!caller.user) {
    return res.status(caller.status).json(caller.body);
  }

  const { id, version } = req.query;
  const download = req.query.download === '1';
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    return res.status(404).json(NOT_FOUND);
  }
  if (version !== undefined && (typeof version !== 'string' || !UUID_PATTERN.test(version))) {
    return res.status(404).json(NOT_FOUND);
  }

  try {
    const session = await createApiSupabaseClient(req, res);

    const { data: document, error: documentError } = await session
      .from('community_documents')
      .select('id, workspace_id, storage_path, storage_bucket, file_name, mime_type, is_active')
      .eq('id', id)
      .maybeSingle();
    if (documentError) {
      console.error('[document-link] document read failed');
      return res.status(500).json(SERVER_ERROR);
    }
    if (!document || document.is_active !== true) {
      return res.status(404).json(NOT_FOUND);
    }

    let storagePath: unknown = document.storage_path;
    let storedBucket: unknown = document.storage_bucket;
    if (typeof version === 'string') {
      const { data: row, error: versionError } = await session
        .from('document_versions')
        .select('id, document_id, storage_path, storage_bucket')
        .eq('id', version)
        .eq('document_id', document.id)
        .maybeSingle();
      if (versionError) {
        console.error('[document-link] version read failed');
        return res.status(500).json(SERVER_ERROR);
      }
      if (!row || row.document_id !== document.id) {
        return res.status(404).json(NOT_FOUND);
      }
      storagePath = row.storage_path;
      storedBucket = row.storage_bucket;
    }

    const bucket = documentStore(storedBucket);
    const name = bucket ? documentObjectName(storagePath, bucket, document.workspace_id) : null;
    if (!bucket || !name) {
      return res.status(404).json(NOT_FOUND);
    }

    const store = createServiceRoleClient().storage.from(bucket);
    const { data: signed, error: signError } = await store.createSignedUrl(name, DOCUMENT_LINK_SECONDS);
    if (signError || !signed?.signedUrl) {
      if (signError) console.error('[document-link] signing failed');
      return res.status(404).json(NOT_FOUND);
    }

    // Send-back 1: the download value is added here, to the link storage-js
    // signed, with URLSearchParams (encoded exactly once): storage-js would
    // encode an encoded name a second time, and a raw one not enough (& and #
    // would end it). The store sends the name in a header, so line breaks and
    // other control characters (C0, DEL, C1) are removed first.
    let url = signed.signedUrl;
    if (download) {
      const raw = typeof document.file_name === 'string' ? document.file_name : '';
      const fileName = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
      const link = new URL(signed.signedUrl);
      link.searchParams.set('download', fileName);
      url = link.toString();
    }

    return res.status(200).json({ url, expiresIn: DOCUMENT_LINK_SECONDS });
  } catch (error) {
    console.error('[document-link] unexpected error:', error instanceof Error ? error.name : 'unknown');
    return res.status(500).json(SERVER_ERROR);
  }
}
