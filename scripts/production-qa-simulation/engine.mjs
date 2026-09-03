import { canonicalJson, expectedCounts, manifestOwnedIds } from './manifest.mjs';
import { assertQaTenantPreflight } from './target-guard.mjs';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function comparableValue(expected, actual) {
  if (actual instanceof Date) {
    if (typeof expected === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expected)) {
      const year = actual.getFullYear();
      const month = String(actual.getMonth() + 1).padStart(2, '0');
      const day = String(actual.getDate()).padStart(2, '0');
      actual = `${year}-${month}-${day}`;
    } else {
      actual = actual.toISOString();
    }
  }
  if (typeof expected === 'number' && typeof actual === 'string' && actual.trim() !== '') {
    const parsed = Number(actual);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (Array.isArray(expected)) return Array.isArray(actual) ? actual.map((item) => comparableValue(undefined, item)) : actual;
  if (isPlainObject(expected) && isPlainObject(actual)) {
    // Normalize only the manifest-declared keys and carry every additional
    // actual key through verbatim, so an unexpected property is compared as
    // drift instead of being projected away. Anything that is not an
    // object-to-object comparison falls through unchanged and therefore also
    // fails the exact canonical-JSON equality below.
    const normalized = { ...actual };
    for (const key of Object.keys(expected)) {
      normalized[key] = comparableValue(expected[key], actual[key]);
    }
    return normalized;
  }
  return actual;
}

export function projectOwnedRow(expected, actual) {
  return comparableValue(expected, isPlainObject(actual) ? actual : {});
}

export function assertOwnedRowsExact(table, expectedRows, actualRows) {
  const actualById = new Map(actualRows.map((row) => [row.id, row]));
  const missing = [];
  for (const expected of expectedRows) {
    const actual = actualById.get(expected.id);
    if (!actual) {
      missing.push(expected);
      continue;
    }
    if (canonicalJson(projectOwnedRow(expected, actual)) !== canonicalJson(expected)) {
      throw new Error(`manifest-owned row drift detected in ${table}`);
    }
  }
  return missing;
}

async function inspectForSeed(store, manifest) {
  const missingByTable = new Map();
  for (const table of manifest.tables) {
    const ids = table.rows.map((row) => row.id);
    const existing = await store.readByIds(table.name, ids, Object.keys(table.rows[0]));
    const missing = assertOwnedRowsExact(table.name, table.rows, existing);
    const collisions = await store.findNaturalKeyCollisions(table.name, table.naturalKey, table.rows);
    const ownedIds = new Set(ids);
    if (collisions.some((row) => !ownedIds.has(row.id))) {
      throw new Error(`unowned natural-key collision detected in ${table.name}`);
    }
    missingByTable.set(table.name, missing);
  }
  return missingByTable;
}

async function preflight(store, manifest, guardedTarget) {
  const rows = await store.readQaTenants(manifest.targetSchoolIds);
  assertQaTenantPreflight(rows, guardedTarget);
}

export async function seedManifest({ store, manifest, guardedTarget }) {
  return store.transaction(async () => {
    await store.acquireManifestLock(manifest.version);
    await preflight(store, manifest, guardedTarget);
    const missingByTable = await inspectForSeed(store, manifest);
    const inserted = {};
    for (const table of manifest.tables) {
      const missing = missingByTable.get(table.name) ?? [];
      if (missing.length > 0) {
        await store.insertMissing(table.name, missing, { jsonColumns: table.jsonColumns ?? [] });
      }
      inserted[table.name] = missing.length;
    }
    const verification = await verifyManifestInTransaction({ store, manifest, guardedTarget, skipPreflight: true });
    return { inserted, counts: verification.counts, digest: verification.digest };
  });
}

async function verifyManifestInTransaction({ store, manifest, guardedTarget, skipPreflight = false }) {
  if (!skipPreflight) {
    await store.acquireManifestLock(manifest.version);
    await preflight(store, manifest, guardedTarget);
  }
  for (const table of manifest.tables) {
    const existing = await store.readByIds(table.name, table.rows.map((row) => row.id), Object.keys(table.rows[0]));
    const missing = assertOwnedRowsExact(table.name, table.rows, existing);
    if (missing.length > 0) throw new Error(`manifest verification is missing rows in ${table.name}`);
  }
  return { counts: expectedCounts(manifest), digest: manifest.digest };
}

export async function verifyManifest({ store, manifest, guardedTarget }) {
  return store.transaction(() => verifyManifestInTransaction({ store, manifest, guardedTarget }), { readOnly: true });
}

export async function resetManifest({ store, manifest, guardedTarget }) {
  return store.transaction(async () => {
    await store.acquireManifestLock(manifest.version);
    await preflight(store, manifest, guardedTarget);

    for (const table of manifest.tables) {
      const existing = await store.readByIds(table.name, table.rows.map((row) => row.id), Object.keys(table.rows[0]));
      assertOwnedRowsExact(table.name, table.rows, existing);
    }

    const references = await store.findForeignReferences(manifestOwnedIds(manifest));
    if (references.length > 0) {
      throw new Error('refusing manifest reset: foreign or unowned rows reference manifest-owned records');
    }

    const deleted = {};
    for (const table of [...manifest.tables].reverse()) {
      const ids = table.rows.map((row) => row.id);
      deleted[table.name] = await store.deleteByIds(table.name, ids);
    }
    for (const table of manifest.tables) {
      const remaining = await store.readByIds(table.name, table.rows.map((row) => row.id), ['id']);
      if (remaining.length > 0) throw new Error(`manifest reset left owned rows in ${table.name}`);
    }
    return { deleted, counts: expectedCounts(manifest), digest: manifest.digest };
  });
}
