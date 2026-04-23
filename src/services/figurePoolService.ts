import JSZip from "jszip";

import bundledFigureSeedData from "@/data/scientistPool.json";
import { storageAdapter } from "@/services/storage";
import type {
  FigurePool,
  FigurePoolImportPayload,
  FigurePoolZipImportOptions,
  FigurePoolZipInspection,
  FigurePoolRecord,
  FigurePoolValidationSummary,
  FigureRecordInput,
  FigureRecordValidationIssue,
} from "@/types/figurePool";

const STORE_NAME = "figure-pools.json";
const POOLS_KEY = "pools";
const SCHEMA_VERSION = 1;
const BUILTIN_POOL_ID = "builtin-scientists";
const ZIP_POOL_MANIFEST = "pool.json";
const ZIP_PORTRAIT_FOLDER = "portraits";

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
};

const EXTENSION_TO_MIME: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function nowIso(): string {
  return new Date().toISOString();
}

function cloneRecord(input: FigureRecordInput): FigureRecordInput {
  return {
    ...input,
    localized_names: input.localized_names ? { ...input.localized_names } : undefined,
    achievements_zh: [...input.achievements_zh],
    achievements_en: [...input.achievements_en],
  };
}

function clonePool(pool: FigurePool): FigurePool {
  return {
    ...pool,
    records: pool.records.map((record) => ({
      ...record,
      localized_names: record.localized_names ? { ...record.localized_names } : undefined,
      achievements_zh: [...record.achievements_zh],
      achievements_en: [...record.achievements_en],
      errors: [...record.errors],
    })),
    validationSummary: { ...pool.validationSummary },
  };
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePoolName(value: string): string {
  return normalizeString(value).toLocaleLowerCase();
}

function sanitizeFilename(value: string): string {
  const normalized = normalizeString(value)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "portrait";
}

function getPathExtension(value: string): string {
  const cleaned = normalizeString(value).split(/[?#]/, 1)[0] ?? "";
  const match = cleaned.match(/(\.[a-z0-9]+)$/i);
  return match?.[1]?.toLocaleLowerCase() ?? "";
}

function inferMimeTypeFromPath(value: string): string {
  return EXTENSION_TO_MIME[getPathExtension(value)] ?? "application/octet-stream";
}

function inferFileExtension(value: string, mimeType: string): string {
  const extensionFromPath = getPathExtension(value);
  return (MIME_TO_EXTENSION[mimeType] ?? extensionFromPath) || ".bin";
}

function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = "";
  const CHUNK_SIZE = 0x8000;
  for (let index = 0; index < data.length; index += CHUNK_SIZE) {
    binary += String.fromCharCode(...data.subarray(index, index + CHUNK_SIZE));
  }
  return btoa(binary);
}

function buildDataUrl(data: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${uint8ArrayToBase64(data)}`;
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  let binary = "";
  try {
    binary = atob(match[2] ?? "");
  } catch {
    return null;
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return {
    bytes,
    mimeType: match[1] ?? "application/octet-stream",
  };
}

function resolveBundledPortraitPath(value: string): string | null {
  const trimmed = normalizeString(value);
  if (!trimmed) {
    return null;
  }

  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return null;
  }

  return trimmed.replace(/^\.?\//, "");
}

async function fetchPortraitBundle(
  portraitUrl: string,
  basename: string
): Promise<{ bytes: Uint8Array; mimeType: string; path: string }> {
  const trimmedUrl = normalizeString(portraitUrl);
  const decodedDataUrl = decodeDataUrl(trimmedUrl);
  if (decodedDataUrl) {
    const extension = inferFileExtension(trimmedUrl, decodedDataUrl.mimeType);
    return {
      bytes: decodedDataUrl.bytes,
      mimeType: decodedDataUrl.mimeType,
      path: `${ZIP_PORTRAIT_FOLDER}/${sanitizeFilename(basename)}${extension}`,
    };
  }

  const response = await fetch(trimmedUrl);
  if (!response.ok) {
    throw new Error(`Failed to bundle portrait: ${trimmedUrl}`);
  }

  const headerMimeType = normalizeString(response.headers.get("Content-Type")).split(";", 1)[0] ?? "";
  const mimeType = headerMimeType || inferMimeTypeFromPath(trimmedUrl);
  const extension = inferFileExtension(trimmedUrl, mimeType);

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType,
    path: `${ZIP_PORTRAIT_FOLDER}/${sanitizeFilename(basename)}${extension}`,
  };
}

async function parseFigurePoolZip(
  data: Uint8Array
): Promise<{ zip: JSZip; payload: FigurePoolImportPayload }> {
  const zip = await JSZip.loadAsync(data);
  const manifest = zip.file(ZIP_POOL_MANIFEST);

  if (!manifest) {
    throw new Error("Invalid figure pool archive: missing pool.json");
  }

  const parsed = JSON.parse(await manifest.async("string")) as FigurePoolImportPayload | FigureRecordInput[];
  const payload = Array.isArray(parsed)
    ? { name: "Imported pool", records: parsed }
    : parsed;

  return {
    zip,
    payload,
  };
}

async function resolveImportedZipPayload(
  payload: FigurePoolImportPayload,
  zip: JSZip
): Promise<FigurePoolImportPayload> {
  const records = await Promise.all(
    payload.records.map(async (record) => {
      const cloned = cloneRecord(record);
      const bundledPortraitPath = resolveBundledPortraitPath(cloned.portrait_url);

      if (!bundledPortraitPath) {
        return cloned;
      }

      const portraitFile = zip.file(bundledPortraitPath);
      if (!portraitFile) {
        cloned.portrait_url = "";
        return cloned;
      }

      const bytes = await portraitFile.async("uint8array");
      cloned.portrait_url = buildDataUrl(bytes, inferMimeTypeFromPath(bundledPortraitPath));
      return cloned;
    })
  );

  return {
    name: normalizeString(payload.name),
    description: normalizeString(payload.description) || undefined,
    records,
  };
}

async function findPoolNameConflict(name: string): Promise<FigurePool | null> {
  const pools = await loadFigurePools();
  const normalizedName = normalizePoolName(name);

  return pools.find((pool) => normalizePoolName(pool.name) === normalizedName) ?? null;
}

function validateRecord(
  input: FigureRecordInput,
  duplicateSlugs: Set<string>
): FigureRecordValidationIssue[] {
  const errors: FigureRecordValidationIssue[] = [];

  const requiredStringFields: Array<keyof FigureRecordInput> = [
    "slug",
    "name",
    "portrait_url",
    "quote_en",
    "quote_zh",
    "core_traits",
    "thinking_style",
    "temperament_tags",
    "temperament_summary",
    "loading_copy_zh",
    "loading_copy_en",
    "bio_zh",
    "bio_en",
  ];

  for (const field of requiredStringFields) {
    if (!normalizeString(input[field])) {
      errors.push({ field, message: `${field} is required` });
    }
  }

  if (duplicateSlugs.has(normalizeString(input.slug))) {
    errors.push({ field: "slug", message: "slug must be unique within the pool" });
  }

  const requiredArrayFields: Array<keyof Pick<FigureRecordInput, "achievements_zh" | "achievements_en">> = [
    "achievements_zh",
    "achievements_en",
  ];

  for (const field of requiredArrayFields) {
    const value = input[field];
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => !normalizeString(item))) {
      errors.push({ field, message: `${field} must contain at least one non-empty item` });
    }
  }

  return errors;
}

function buildValidationSummary(records: FigurePoolRecord[]): FigurePoolValidationSummary {
  const invalidCount = records.filter((record) => record.status === "invalid").length;
  const errorCount = records.reduce((sum, record) => sum + record.errors.length, 0);

  return {
    validCount: records.length - invalidCount,
    invalidCount,
    errorCount,
  };
}

function validatePoolRecords(records: FigureRecordInput[]): FigurePoolRecord[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const slug = normalizeString(record.slug);
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  const duplicateSlugs = new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([slug]) => slug)
  );

  const timestamp = nowIso();

  return records.map((record) => {
    const cloned = cloneRecord(record);
    const errors = validateRecord(cloned, duplicateSlugs);

    return {
      ...cloned,
      status: errors.length > 0 ? "invalid" : "valid",
      errors,
      updatedAt: timestamp,
    };
  });
}

function buildPool(input: {
  id: string;
  name: string;
  description?: string;
  origin: "builtin" | "imported";
  isDefault: boolean;
  records: FigureRecordInput[];
  createdAt?: string;
}): FigurePool {
  const createdAt = input.createdAt ?? nowIso();
  const records = validatePoolRecords(input.records);

  return {
    id: input.id,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    origin: input.origin,
    isDefault: input.isDefault,
    createdAt,
    updatedAt: nowIso(),
    schemaVersion: SCHEMA_VERSION,
    validationSummary: buildValidationSummary(records),
    records,
  };
}

function builtinSeedPool(): FigurePool {
  return buildPool({
    id: BUILTIN_POOL_ID,
    name: "Scientists",
    description: "Bundled built-in figure pool",
    origin: "builtin",
    isDefault: true,
    records: bundledFigureSeedData as FigureRecordInput[],
    createdAt: "2026-04-23T00:00:00.000Z",
  });
}

async function loadStore() {
  return storageAdapter.load(STORE_NAME, {
    defaults: {
      [POOLS_KEY]: [],
    },
    autoSave: true,
  });
}

async function savePools(pools: FigurePool[]): Promise<void> {
  const store = await loadStore();
  await store.set(POOLS_KEY, pools);
  await store.save();
}

function ensureSingleDefault(pools: FigurePool[]): FigurePool[] {
  if (pools.length === 0) {
    return [];
  }

  let seenDefault = false;
  const normalized = pools.map((pool) => {
    if (pool.isDefault && !seenDefault) {
      seenDefault = true;
      return pool;
    }

    if (pool.isDefault) {
      return { ...pool, isDefault: false };
    }

    return pool;
  });

  if (!seenDefault) {
    return normalized.map((pool, index) => (index === 0 ? { ...pool, isDefault: true } : pool));
  }

  return normalized;
}

export async function loadFigurePools(): Promise<FigurePool[]> {
  const store = await loadStore();
  const stored = (await store.get<FigurePool[]>(POOLS_KEY)) ?? [];

  if (stored.length > 0) {
    return ensureSingleDefault(stored);
  }

  const seeded = [builtinSeedPool()];
  await savePools(seeded);
  return seeded;
}

export async function loadFigurePool(poolId: string): Promise<FigurePool | null> {
  const pools = await loadFigurePools();
  const pool = pools.find((item) => item.id === poolId);
  return pool ? clonePool(pool) : null;
}

export async function importFigurePool(payload: FigurePoolImportPayload): Promise<FigurePool> {
  const pools = await loadFigurePools();
  const nextPool = buildPool({
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `figure-pool-${Date.now()}`,
    name: payload.name,
    description: payload.description,
    origin: "imported",
    isDefault: false,
    records: payload.records,
  });

  const nextPools = ensureSingleDefault([...pools, nextPool]);
  await savePools(nextPools);
  return nextPools.find((pool) => pool.id === nextPool.id) ?? nextPool;
}

export async function importFigurePoolFromJson(content: string): Promise<FigurePool> {
  const parsed = JSON.parse(content) as FigurePoolImportPayload | FigureRecordInput[];
  const payload = Array.isArray(parsed)
    ? { name: "Imported pool", records: parsed }
    : parsed;

  return importFigurePool(payload);
}

export async function inspectFigurePoolZip(data: Uint8Array): Promise<FigurePoolZipInspection> {
  const { zip, payload } = await parseFigurePoolZip(data);
  const resolvedPayload = await resolveImportedZipPayload(payload, zip);
  const conflict = await findPoolNameConflict(resolvedPayload.name);

  return {
    payload: resolvedPayload,
    hasNameConflict: conflict != null,
    conflictingPoolId: conflict?.id,
    conflictingPoolName: conflict?.name,
  };
}

export async function importFigurePoolFromZip(
  data: Uint8Array,
  options?: FigurePoolZipImportOptions
): Promise<FigurePool> {
  const inspection = await inspectFigurePoolZip(data);
  const nextName = normalizeString(options?.name) || inspection.payload.name;
  const conflict = await findPoolNameConflict(nextName);

  if (conflict) {
    throw new Error(`Figure pool name already exists: ${nextName}`);
  }

  return importFigurePool({
    ...inspection.payload,
    name: nextName,
  });
}

export async function exportFigurePool(poolId: string): Promise<FigurePoolImportPayload> {
  const pool = await loadFigurePool(poolId);
  if (!pool) {
    throw new Error(`Figure pool not found: ${poolId}`);
  }

  return {
    name: pool.name,
    description: pool.description,
    records: pool.records.map((record) => cloneRecord(record)),
  };
}

export async function exportFigurePoolToZip(poolId: string): Promise<Uint8Array> {
  const payload = await exportFigurePool(poolId);
  const zip = new JSZip();
  const records = await Promise.all(
    payload.records.map(async (record) => {
      const cloned = cloneRecord(record);
      const portraitUrl = normalizeString(cloned.portrait_url);

      if (!portraitUrl) {
        return cloned;
      }

      const bundledPortrait = await fetchPortraitBundle(portraitUrl, cloned.slug || cloned.name);
      zip.file(bundledPortrait.path, bundledPortrait.bytes);
      cloned.portrait_url = bundledPortrait.path;
      return cloned;
    })
  );

  zip.file(
    ZIP_POOL_MANIFEST,
    JSON.stringify(
      {
        name: payload.name,
        description: payload.description,
        records,
      } satisfies FigurePoolImportPayload,
      null,
      2
    )
  );

  return zip.generateAsync({ type: "uint8array" });
}

export async function renameFigurePool(poolId: string, name: string): Promise<FigurePool> {
  const pools = await loadFigurePools();
  const nextPools = pools.map((pool) =>
    pool.id === poolId
      ? {
          ...pool,
          name: name.trim(),
          updatedAt: nowIso(),
        }
      : pool
  );
  const normalized = ensureSingleDefault(nextPools);
  await savePools(normalized);
  const updated = normalized.find((pool) => pool.id === poolId);
  if (!updated) {
    throw new Error(`Figure pool not found: ${poolId}`);
  }
  return updated;
}

export async function setDefaultFigurePool(poolId: string): Promise<FigurePool[]> {
  const pools = await loadFigurePools();
  const nextPools = pools.map((pool) => ({
    ...pool,
    isDefault: pool.id === poolId,
  }));
  const normalized = ensureSingleDefault(nextPools);
  await savePools(normalized);
  return normalized;
}

export async function createFigureRecord(
  poolId: string,
  record: FigureRecordInput
): Promise<FigurePoolRecord> {
  const pools = await loadFigurePools();
  const pool = pools.find((item) => item.id === poolId);

  if (!pool) {
    throw new Error(`Figure pool not found: ${poolId}`);
  }

  const nextPool = buildPool({
    ...pool,
    records: [...pool.records.map((item) => cloneRecord(item)), record],
    createdAt: pool.createdAt,
  });

  const nextPools = ensureSingleDefault(
    pools.map((item) => (item.id === poolId ? nextPool : item))
  );
  await savePools(nextPools);

  const created = nextPools
    .find((item) => item.id === poolId)
    ?.records.find((item) => item.slug === record.slug);
  if (!created) {
    throw new Error(`Figure record not found after create: ${record.slug}`);
  }
  return created;
}

export async function duplicateFigureRecord(
  poolId: string,
  slug: string,
  nextSlug: string
): Promise<FigurePoolRecord> {
  const pool = await loadFigurePool(poolId);
  const record = pool?.records.find((item) => item.slug === slug);
  if (!pool || !record) {
    throw new Error(`Figure record not found: ${slug}`);
  }

  return createFigureRecord(poolId, {
    ...cloneRecord(record),
    slug: nextSlug,
    name: `${record.name} Copy`,
  });
}

export async function updateFigureRecord(
  poolId: string,
  slug: string,
  patch: Partial<FigureRecordInput>
): Promise<FigurePoolRecord> {
  const pools = await loadFigurePools();
  const pool = pools.find((item) => item.id === poolId);

  if (!pool) {
    throw new Error(`Figure pool not found: ${poolId}`);
  }

  const records = pool.records.map((record) =>
    record.slug === slug
      ? ({
          ...cloneRecord(record),
          ...patch,
          localized_names:
            patch.localized_names === undefined
              ? record.localized_names
              : patch.localized_names,
        } satisfies FigureRecordInput)
      : cloneRecord(record)
  );

  const nextPool = buildPool({
    ...pool,
    records,
    createdAt: pool.createdAt,
  });
  const nextPools = ensureSingleDefault(
    pools.map((item) => (item.id === poolId ? nextPool : item))
  );
  await savePools(nextPools);

  const updated = nextPools
    .find((item) => item.id === poolId)
    ?.records.find((record) => record.slug === (patch.slug?.trim() || slug));

  if (!updated) {
    throw new Error(`Figure record not found after update: ${slug}`);
  }

  return updated;
}

export async function deleteFigureRecord(poolId: string, slug: string): Promise<FigurePool> {
  const pools = await loadFigurePools();
  const pool = pools.find((item) => item.id === poolId);

  if (!pool) {
    throw new Error(`Figure pool not found: ${poolId}`);
  }

  const nextPool = buildPool({
    ...pool,
    records: pool.records
      .filter((record) => record.slug !== slug)
      .map((record) => cloneRecord(record)),
    createdAt: pool.createdAt,
  });
  const nextPools = ensureSingleDefault(
    pools.map((item) => (item.id === poolId ? nextPool : item))
  );
  await savePools(nextPools);

  const updated = nextPools.find((item) => item.id === poolId);
  if (!updated) {
    throw new Error(`Figure pool not found after delete: ${poolId}`);
  }
  return updated;
}

export async function deleteFigurePool(poolId: string): Promise<FigurePool[]> {
  const pools = await loadFigurePools();
  const nextPools = ensureSingleDefault(pools.filter((pool) => pool.id !== poolId));
  await savePools(nextPools);
  return nextPools;
}
