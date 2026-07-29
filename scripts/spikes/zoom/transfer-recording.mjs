/**
 * Item 3 — recording round trip (results doc §7).
 *
 *   claim → download (re-fetched token) → stream to Supabase S3 multipart
 *   → HEAD verify → trash → permanent delete
 *
 * This is the measurement rig for plan §12's transfer pipeline. The properties it
 * is built to prove, rather than assert:
 *
 *  - The bytes never touch disk or /tmp. The Zoom response body is consumed as a
 *    web stream and pushed part-by-part into S3; peak memory is one part
 *    (PART_SIZE), which is inherent to multipart and is not what §12 forbids.
 *  - Verify-before-delete. The HEAD size must equal Zoom's reported file_size
 *    before ANY destructive call is issued. A mismatch aborts.
 *  - Trash-then-permanent. §12 chose `action=trash` then a later
 *    `action=delete` because Zoom offers no checksum; both are exercised.
 *  - Every destructive call passes through `assertSpikeMeeting`, which re-reads
 *    the meeting from Zoom and refuses anything whose topic is not a spike topic.
 *
 * `--kill-after N` aborts the stream after N parts WITHOUT aborting the S3 upload,
 * so the next run can inspect what a resumed transfer would have to work with.
 *
 * Usage:
 *   node scripts/spikes/zoom/transfer-recording.mjs <meetingUuid> [--kill-after N] [--keep]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadSpikeEnv, zoomApi, makeRedactor, assertSpikeMeeting } from './lib.mjs';
import { makeS3Client } from './s3.mjs';

const ROOT = process.cwd();
const env = loadSpikeEnv(ROOT);
const redact = makeRedactor(env);
const args = process.argv.slice(2);

const meetingUuid = args[0];
if (!meetingUuid) {
  console.error('usage: transfer-recording.mjs <meetingUuid> [--kill-after N] [--keep]');
  process.exit(1);
}
const killAfter = args.includes('--kill-after') ? Number(args[args.indexOf('--kill-after') + 1]) : 0;
const keep = args.includes('--keep');

/**
 * Part size. Production must use ≥5 MiB for every part except the last (the S3
 * spec's minimum), and 8 MiB is the sensible default. It is overridable ONLY
 * because a synthetic spike recording is a couple of megabytes — smaller than a
 * single legal part — so the multipart state machine and the resume question
 * cannot be exercised at production part sizes against this input. Runs at both
 * sizes are reported separately in results §7 and the distinction is called out
 * there; nothing in production should ever pass this flag.
 */
const PART_SIZE = args.includes('--part-size')
  ? Number(args[args.indexOf('--part-size') + 1])
  : 8 * 1024 * 1024;

const STACK_ENV =
  process.env.SPIKE_STACK_ENV ??
  '/private/tmp/claude-501/-Users-brentcurtis-Documents-fne-lms-working/4c88594b-0108-4101-9847-8ed7f6ac3971/scratchpad/spike-supabase/stack.env';
const stack = Object.fromEntries(
  readFileSync(STACK_ENV, 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')];
    })
);

const BUCKET = 'zoom-recordings-spike';
const s3 = makeS3Client({
  endpoint: stack.STORAGE_S3_URL,
  region: stack.S3_PROTOCOL_REGION,
  accessKeyId: stack.S3_PROTOCOL_ACCESS_KEY_ID,
  secretAccessKey: stack.S3_PROTOCOL_ACCESS_KEY_SECRET,
  bucket: BUCKET,
});

const encodedUuid = encodeURIComponent(encodeURIComponent(meetingUuid));
const results = { capturedAt: new Date().toISOString(), meetingUuid, files: [] };

// -- Step 1: claim the recording, exercising the §12 stage-2 token re-fetch path.
// The webhook payload carries a `download_token`; this is the OTHER path — the one
// a resumed or retried job must use once that token has expired.
const listed = await zoomApi(env, 'GET', `/meetings/${encodedUuid}/recordings`, {
  query: { include_fields: 'download_access_token', ttl: 3600 },
});
if (listed.status !== 200) {
  console.error(`claim failed ${listed.status}: ${redact(JSON.stringify(listed.body))}`);
  process.exit(1);
}

const downloadAccessToken = listed.body.download_access_token ?? null;
console.log(`recording claimed: uuid=${listed.body.uuid} duration=${listed.body.duration}min total_size=${listed.body.total_size}`);
console.log(`download_access_token present: ${Boolean(downloadAccessToken)} (ttl requested 3600s)`);
results.claim = {
  status: listed.status,
  uuid: listed.body.uuid,
  durationMinutes: listed.body.duration,
  totalSize: listed.body.total_size,
  tokenViaReFetch: Boolean(downloadAccessToken),
  fileCount: (listed.body.recording_files ?? []).length,
};

const meetingIdForSafety = listed.body.id ?? meetingUuid;

for (const file of listed.body.recording_files ?? []) {
  const label = `${file.file_type}/${file.file_extension}`;
  console.log(`\n=== ${label} · ${file.file_size} bytes · status=${file.status} · id=${file.id} ===`);

  if (file.status !== 'completed') {
    console.log('  skipped — not completed');
    continue;
  }

  const key = `school_9001/spike/${listed.body.uuid.replace(/[/+=]/g, '_')}/${file.id}.${String(
    file.file_extension
  ).toLowerCase()}`;

  // -- Step 2: open the Zoom download as a STREAM.
  const downloadUrl = new URL(file.download_url);
  const started = Date.now();
  const res = await fetch(downloadUrl, {
    headers: downloadAccessToken ? { Authorization: `Bearer ${downloadAccessToken}` } : {},
  });
  console.log(`  GET download_url -> ${res.status} (content-length ${res.headers.get('content-length')})`);
  if (!res.ok || !res.body) {
    console.log(`  download failed: ${(await res.text()).slice(0, 300)}`);
    results.files.push({ label, error: `download ${res.status}` });
    continue;
  }

  // -- Step 3: stream into S3 multipart. One part in memory at a time.
  const uploadId = await s3.createMultipartUpload(key, file.file_type === 'MP4' ? 'video/mp4' : 'audio/m4a');
  const parts = [];
  let pending = Buffer.alloc(0);
  let bytesRead = 0;
  let killed = false;

  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      pending = Buffer.concat([pending, Buffer.from(value)]);

      while (pending.length >= PART_SIZE) {
        const chunk = pending.subarray(0, PART_SIZE);
        pending = pending.subarray(PART_SIZE);
        const partNumber = parts.length + 1;
        const etag = await s3.uploadPart(key, uploadId, partNumber, chunk);
        parts.push({ partNumber, etag, size: chunk.length });
        console.log(`  part ${partNumber} uploaded (${chunk.length} B)`);

        if (killAfter > 0 && parts.length >= killAfter) {
          killed = true;
          break;
        }
      }
      if (killed) break;
    }
  } finally {
    if (killed) await reader.cancel().catch(() => {});
  }

  if (killed) {
    // Deliberate mid-transfer death. Do NOT abort the upload — leave it dangling so
    // the resume question can be answered from the server's own view of it.
    console.log(`\n  *** SIMULATED CRASH after ${parts.length} part(s) — upload left dangling ***`);
    const view = await s3.listParts(key, uploadId);
    console.log(`  ListParts -> ${view.status}; server sees ${view.parts.length} part(s):`);
    console.log(`    ${JSON.stringify(view.parts)}`);
    const head = await s3.headObject(key);
    console.log(`  HeadObject on the incomplete key -> ${head.status} (object must NOT exist yet)`);
    results.files.push({
      label,
      resumeProbe: {
        partsUploaded: parts.length,
        serverVisibleParts: view.parts,
        headStatusBeforeComplete: head.status,
        bytesReadFromZoom: bytesRead,
      },
    });
    await s3.abortMultipartUpload(key, uploadId);
    console.log('  (upload aborted after inspection so the bucket is left clean)');
    continue;
  }

  // Final (short) part.
  if (pending.length > 0) {
    const partNumber = parts.length + 1;
    const etag = await s3.uploadPart(key, uploadId, partNumber, pending);
    parts.push({ partNumber, etag, size: pending.length });
    console.log(`  part ${partNumber} uploaded (${pending.length} B, final)`);
  }

  await s3.completeMultipartUpload(key, uploadId, parts);
  const elapsedMs = Date.now() - started;
  const throughputMBps = bytesRead / 1024 / 1024 / (elapsedMs / 1000);
  console.log(`  CompleteMultipartUpload OK · ${parts.length} part(s) · ${elapsedMs} ms · ${throughputMBps.toFixed(2)} MB/s`);

  // -- Step 4: verify BEFORE any destructive call.
  const head = await s3.headObject(key);
  const storedBytes = Number(head.contentLength);
  const sizeMatches = storedBytes === Number(file.file_size);
  console.log(`  HEAD verify: stored ${storedBytes} vs Zoom-reported ${file.file_size} -> ${sizeMatches ? 'MATCH' : 'MISMATCH'}`);

  results.files.push({
    label,
    zoomFileId: file.id,
    zoomReportedBytes: Number(file.file_size),
    storedBytes,
    sizeMatches,
    parts: parts.map((p) => ({ partNumber: p.partNumber, size: p.size })),
    partCount: parts.length,
    partSizeBytes: PART_SIZE,
    elapsedMs,
    throughputMBps: Number(throughputMBps.toFixed(2)),
    storageKey: key,
  });

  if (!sizeMatches) {
    console.log('  ABORT for this file: verification failed, so nothing is deleted at Zoom.');
    continue;
  }
  if (keep) {
    console.log('  --keep set: leaving the Zoom copy in place.');
    continue;
  }

  // -- Step 5: trash, then permanent delete. Interlock re-checked immediately
  // before each destructive call, not once at the top of the script.
  await assertSpikeMeeting(env, meetingIdForSafety);
  const trashed = await zoomApi(
    env,
    'DELETE',
    `/meetings/${encodedUuid}/recordings/${file.id}`,
    { query: { action: 'trash' } }
  );
  console.log(`  DELETE …/recordings/{fileId}?action=trash -> ${trashed.status}`);

  await assertSpikeMeeting(env, meetingIdForSafety);
  const deleted = await zoomApi(
    env,
    'DELETE',
    `/meetings/${encodedUuid}/recordings/${file.id}`,
    { query: { action: 'delete' } }
  );
  console.log(`  DELETE …/recordings/{fileId}?action=delete -> ${deleted.status}`);

  results.files[results.files.length - 1].trashStatus = trashed.status;
  results.files[results.files.length - 1].deleteStatus = deleted.status;
}

// Post-deletion state.
const after = await zoomApi(env, 'GET', `/meetings/${encodedUuid}/recordings`);
console.log(`\nafter deletion, GET recordings -> ${after.status} ${after.status !== 200 ? redact(JSON.stringify(after.body)) : ''}`);
results.afterDeletion = { status: after.status, body: after.status !== 200 ? after.body : '(files still listed)' };

mkdirSync(path.join(ROOT, 'scripts/spikes/zoom/out'), { recursive: true });
writeFileSync(
  path.join(ROOT, 'scripts/spikes/zoom/out/transfer-result.json'),
  JSON.stringify(results, null, 2)
);
console.log('\nsaved scripts/spikes/zoom/out/transfer-result.json (gitignored)');
