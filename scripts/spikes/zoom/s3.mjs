/**
 * Minimal AWS SigV4 S3 multipart client — spike-only, zero dependencies.
 *
 * Written by hand rather than pulling @aws-sdk/client-s3 (+lib-storage) into the
 * repo for two reasons: the spike must not dictate Z4's dependency choice, and a
 * from-scratch implementation documents exactly what Supabase's S3 endpoint
 * requires — which is the actual deliverable here (plan §7: "Uploads server-side
 * only via Supabase S3 multipart endpoint").
 *
 * Only the four calls the transfer needs are implemented:
 *   CreateMultipartUpload · UploadPart · CompleteMultipartUpload · AbortMultipartUpload
 * plus HeadObject for the size verification the plan requires before Zoom deletion.
 *
 * Note on memory: UploadPart signs the bytes it sends, so each part is held in
 * memory while it is signed and PUT. That is inherent to S3 multipart and is NOT
 * the thing the plan forbids — what it forbids is buffering the whole recording to
 * disk or /tmp. Peak memory here is one part.
 */

import { createHash, createHmac } from 'node:crypto';

const SERVICE = 's3';

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data).digest();
}

/** RFC3986 encoding; S3 requires unreserved chars only, and `/` kept in paths. */
function uriEncode(value, keepSlash) {
  let out = '';
  for (const char of Buffer.from(value, 'utf8')) {
    const c = String.fromCharCode(char);
    if (/[A-Za-z0-9\-._~]/.test(c)) out += c;
    else if (c === '/' && keepSlash) out += '/';
    else out += `%${char.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

export function makeS3Client({ endpoint, region, accessKeyId, secretAccessKey, bucket }) {
  const base = new URL(endpoint);

  /**
   * Signs and issues one request.
   * @param {object} options
   * @param {string} options.method
   * @param {string} options.key      object key (unencoded)
   * @param {Record<string,string>} [options.query]
   * @param {Buffer|string} [options.body]
   */
  async function request({ method, key, query = {}, body, extraHeaders = {} }) {
    const payload = body ?? Buffer.alloc(0);
    const payloadHash = sha256Hex(payload);

    const now = new Date();
    const amzDate = `${now.toISOString().replace(/[:-]|\.\d{3}/g, '')}`; // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8);

    const canonicalUri = `${base.pathname.replace(/\/$/, '')}/${uriEncode(bucket, false)}/${uriEncode(key, true)}`;

    const canonicalQuery = Object.keys(query)
      .sort()
      .map((k) => `${uriEncode(k, false)}=${uriEncode(String(query[k]), false)}`)
      .join('&');

    const headers = {
      host: base.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...extraHeaders,
    };
    if (payload.length > 0) headers['content-length'] = String(payload.length);

    const sortedHeaderKeys = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort();
    const canonicalHeaders = `${sortedHeaderKeys
      .map((h) => `${h}:${String(headers[Object.keys(headers).find((k) => k.toLowerCase() === h)]).trim()}`)
      .join('\n')}\n`;
    const signedHeaders = sortedHeaderKeys.join(';');

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const scope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, SERVICE);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    headers.Authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const url = `${base.origin}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}`;
    const res = await fetch(url, {
      method,
      headers,
      ...(payload.length > 0 ? { body: payload } : {}),
    });
    const text = res.headers.get('content-type')?.includes('xml') || !res.ok ? await res.text() : '';
    return { status: res.status, ok: res.ok, headers: res.headers, text };
  }

  const tag = (xml, name) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? null;

  return {
    async createMultipartUpload(key, contentType) {
      const res = await request({
        method: 'POST',
        key,
        query: { uploads: '' },
        extraHeaders: contentType ? { 'content-type': contentType } : {},
      });
      if (!res.ok) throw new Error(`CreateMultipartUpload ${res.status}: ${res.text.slice(0, 400)}`);
      const uploadId = tag(res.text, 'UploadId');
      if (!uploadId) throw new Error(`CreateMultipartUpload: no UploadId in ${res.text.slice(0, 300)}`);
      return uploadId;
    },

    async uploadPart(key, uploadId, partNumber, buffer) {
      const res = await request({
        method: 'PUT',
        key,
        query: { partNumber: String(partNumber), uploadId },
        body: buffer,
      });
      if (!res.ok) throw new Error(`UploadPart ${partNumber} ${res.status}: ${res.text.slice(0, 400)}`);
      const etag = res.headers.get('etag');
      if (!etag) throw new Error(`UploadPart ${partNumber}: no ETag returned`);
      return etag;
    },

    async completeMultipartUpload(key, uploadId, parts) {
      const xml = `<CompleteMultipartUpload>${parts
        .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`)
        .join('')}</CompleteMultipartUpload>`;
      const res = await request({
        method: 'POST',
        key,
        query: { uploadId },
        body: Buffer.from(xml, 'utf8'),
        extraHeaders: { 'content-type': 'application/xml' },
      });
      if (!res.ok) throw new Error(`CompleteMultipartUpload ${res.status}: ${res.text.slice(0, 400)}`);
      return res.text;
    },

    async abortMultipartUpload(key, uploadId) {
      const res = await request({ method: 'DELETE', key, query: { uploadId } });
      return res.status;
    },

    async listParts(key, uploadId) {
      const res = await request({ method: 'GET', key, query: { uploadId } });
      if (!res.ok) return { status: res.status, parts: [], raw: res.text };
      const parts = [...res.text.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map((m) => ({
        partNumber: Number(tag(m[1], 'PartNumber')),
        size: Number(tag(m[1], 'Size')),
        etag: tag(m[1], 'ETag'),
      }));
      return { status: res.status, parts, raw: res.text };
    },

    /** The size check the plan requires before any Zoom-side deletion. */
    async headObject(key) {
      const res = await request({ method: 'HEAD', key });
      return {
        status: res.status,
        contentLength: res.headers.get('content-length'),
        contentType: res.headers.get('content-type'),
        etag: res.headers.get('etag'),
      };
    },
  };
}
