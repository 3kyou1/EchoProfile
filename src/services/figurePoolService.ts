import JSZip from "jszip";

import { figurePoolApi } from "@/services/figurePoolApi";
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

const SCHEMA_VERSION = 1;
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

interface RepoPoolContext {
  directoryName: string;
  pool: FigurePool;
}

interface MaterializedPortrait {
  relativePath: string;
  dataBase64: string;
}

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

function base64ToUint8Array(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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

function isPoolRelativePortraitPath(value: string): boolean {
  const trimmed = normalizeString(value);
  return trimmed.startsWith(`${ZIP_PORTRAIT_FOLDER}/`) && !trimmed.includes("..");
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
      const portraitPath = normalizeString(cloned.portrait_url);

      if (!isPoolRelativePortraitPath(portraitPath)) {
        return cloned;
      }

      const portraitFile = zip.file(portraitPath);
      if (!portraitFile) {
        cloned.portrait_url = "";
        return cloned;
      }

      const bytes = await portraitFile.async("uint8array");
      cloned.portrait_url = buildDataUrl(bytes, inferMimeTypeFromPath(portraitPath));
      return cloned;
    })
  );

  return {
    name: normalizeString(payload.name),
    description: normalizeString(payload.description) || undefined,
    records,
  };
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
  updatedAt?: string;
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
    updatedAt: input.updatedAt ?? nowIso(),
    schemaVersion: SCHEMA_VERSION,
    validationSummary: buildValidationSummary(records),
    records,
  };
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

function resolveUniquePoolName(existingNames: string[], requestedName: string): string {
  const trimmedRequested = normalizeString(requestedName) || "Imported pool";
  const normalizedExisting = new Set(existingNames.map((name) => normalizePoolName(name)));
  if (!normalizedExisting.has(normalizePoolName(trimmedRequested))) {
    return trimmedRequested;
  }

  let index = 2;
  while (true) {
    const candidate = `${trimmedRequested} (${index})`;
    if (!normalizedExisting.has(normalizePoolName(candidate))) {
      return candidate;
    }
    index += 1;
  }
}

function extractIdFromLegacyEntry(value: string): string {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLocaleLowerCase();
  return `legacy-${sanitized || "pool"}`;
}

function parseRepoPool(directoryName: string, poolJson: string): FigurePool {
  const parsed = JSON.parse(poolJson) as
    | FigurePool
    | FigurePoolImportPayload
    | FigureRecordInput[];

  if (Array.isArray(parsed)) {
    return buildPool({
      id: extractIdFromLegacyEntry(directoryName),
      name: directoryName,
      origin: "imported",
      isDefault: false,
      records: parsed,
    });
  }

  const payloadLike = parsed as Partial<FigurePoolImportPayload & FigurePool>;
  const id = normalizeString(payloadLike.id) || extractIdFromLegacyEntry(directoryName);
  const name = normalizeString(payloadLike.name) || directoryName;
  const records = Array.isArray(payloadLike.records) ? payloadLike.records : [];
  const origin = payloadLike.origin === "builtin" ? "builtin" : "imported";
  const isDefault = payloadLike.isDefault === true;

  return buildPool({
    id,
    name,
    description: normalizeString(payloadLike.description) || undefined,
    origin,
    isDefault,
    records,
    createdAt: normalizeString(payloadLike.createdAt) || undefined,
    updatedAt: normalizeString(payloadLike.updatedAt) || undefined,
  });
}

async function loadRepoPools(): Promise<RepoPoolContext[]> {
  const entries = await figurePoolApi.listEntries();
  const pools = entries.map((entry) => ({
    directoryName: entry.directoryName,
    pool: parseRepoPool(entry.directoryName, entry.poolJson),
  }));

  const normalizedPools = ensureSingleDefault(pools.map((item) => item.pool));
  return normalizedPools.map((pool) => ({
    directoryName: pools.find((item) => item.pool.id === pool.id)?.directoryName ?? pool.name,
    pool,
  }));
}

async function findRepoPoolById(poolId: string): Promise<RepoPoolContext | null> {
  const pools = await loadRepoPools();
  return pools.find((item) => item.pool.id === poolId) ?? null;
}

async function readRepoRelativePortrait(
  directoryName: string,
  relativePath: string
): Promise<Uint8Array> {
  const portrait = await figurePoolApi.readPortrait({
    directoryName,
    relativePath,
  });
  return base64ToUint8Array(portrait.dataBase64);
}

async function resolveDisplayPortraits({ directoryName, pool }: RepoPoolContext): Promise<FigurePool> {
  const resolved = clonePool(pool);
  resolved.records = await Promise.all(
    resolved.records.map(async (record) => {
      const portraitUrl = normalizeString(record.portrait_url);
      if (!isPoolRelativePortraitPath(portraitUrl)) {
        return record;
      }

      try {
        const bytes = await readRepoRelativePortrait(directoryName, portraitUrl);
        return {
          ...record,
          portrait_url: buildDataUrl(bytes, inferMimeTypeFromPath(portraitUrl)),
        };
      } catch {
        return record;
      }
    })
  );
  return resolved;
}

async function materializePoolPortraits(
  pool: FigurePool,
  previousPool?: FigurePool
): Promise<{ records: FigureRecordInput[]; portraits: MaterializedPortrait[]; removePortraitPaths: string[] }> {
  const portraits: MaterializedPortrait[] = [];
  const records = await Promise.all(
    pool.records.map(async (record) => {
      const cloned = cloneRecord(record);
      const portraitUrl = normalizeString(cloned.portrait_url);

      if (!portraitUrl || isPoolRelativePortraitPath(portraitUrl)) {
        return cloned;
      }

      const bundledPortrait = await fetchPortraitBundle(portraitUrl, cloned.slug || cloned.name);
      cloned.portrait_url = bundledPortrait.path;
      portraits.push({
        relativePath: bundledPortrait.path,
        dataBase64: uint8ArrayToBase64(bundledPortrait.bytes),
      });
      return cloned;
    })
  );

  const previousPaths = new Set(
    (previousPool?.records ?? [])
      .map((record) => normalizeString(record.portrait_url))
      .filter(isPoolRelativePortraitPath)
  );
  const nextPaths = new Set(
    records.map((record) => normalizeString(record.portrait_url)).filter(isPoolRelativePortraitPath)
  );

  const removePortraitPaths = [...previousPaths].filter((path) => !nextPaths.has(path));

  return {
    records,
    portraits,
    removePortraitPaths,
  };
}

async function persistPool(
  pool: FigurePool,
  previousDirectoryName?: string,
  previousPool?: FigurePool
): Promise<RepoPoolContext> {
  const { records, portraits, removePortraitPaths } = await materializePoolPortraits(pool, previousPool);
  const nextPool = buildPool({
    ...pool,
    records,
    createdAt: pool.createdAt,
    updatedAt: nowIso(),
  });

  const result = await figurePoolApi.savePool({
    requestedName: nextPool.name,
    previousDirectoryName,
    poolJson: JSON.stringify(nextPool, null, 2),
    portraits,
    removePortraitPaths,
  });

  return {
    directoryName: result.directoryName,
    pool: parseRepoPool(result.directoryName, result.poolJson),
  };
}

function buildImportedPool(payload: FigurePoolImportPayload, pools: FigurePool[]): FigurePool {
  return buildPool({
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `figure-pool-${Date.now()}`,
    name: payload.name,
    description: payload.description,
    origin: "imported",
    isDefault: pools.length === 0,
    records: payload.records,
  });
}

export async function loadFigurePools(): Promise<FigurePool[]> {
  const pools = await loadRepoPools();
  return Promise.all(pools.map(resolveDisplayPortraits));
}

export async function loadFigurePool(poolId: string): Promise<FigurePool | null> {
  const pool = await findRepoPoolById(poolId);
  return pool ? resolveDisplayPortraits(pool) : null;
}

export async function importFigurePool(payload: FigurePoolImportPayload): Promise<FigurePool> {
  const pools = await loadFigurePools();
  const nextPool = buildImportedPool(payload, pools);
  const persisted = await persistPool(nextPool);
  return clonePool(persisted.pool);
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
  const existingPools = await loadFigurePools();

  return {
    payload: {
      ...resolvedPayload,
      name: resolveUniquePoolName(
        existingPools.map((pool) => pool.name),
        resolvedPayload.name
      ),
    },
    hasNameConflict: false,
  };
}

export async function importFigurePoolFromZip(
  data: Uint8Array,
  options?: FigurePoolZipImportOptions
): Promise<FigurePool> {
  const { zip, payload } = await parseFigurePoolZip(data);
  const resolvedPayload = await resolveImportedZipPayload(payload, zip);

  return importFigurePool({
    ...resolvedPayload,
    name: normalizeString(options?.name) || resolvedPayload.name,
  });
}

export async function exportFigurePool(poolId: string): Promise<FigurePoolImportPayload> {
  const repoPool = await findRepoPoolById(poolId);
  if (!repoPool) {
    throw new Error(`Figure pool not found: ${poolId}`);
  }

  return {
    name: repoPool.pool.name,
    description: repoPool.pool.description,
    records: repoPool.pool.records.map((record) => cloneRecord(record)),
  };
}

export async function exportFigurePoolToZip(poolId: string): Promise<Uint8Array> {
  const repoPool = await findRepoPoolById(poolId);
  if (!repoPool) {
    throw new Error(`Figure pool not found: ${poolId}`);
  }

  const payload = await exportFigurePool(poolId);
  const zip = new JSZip();
  const records = await Promise.all(
    payload.records.map(async (record) => {
      const cloned = cloneRecord(record);
      const portraitUrl = normalizeString(cloned.portrait_url);

      if (!portraitUrl) {
        return cloned;
      }

      if (isPoolRelativePortraitPath(portraitUrl)) {
        const bytes = await readRepoRelativePortrait(repoPool.directoryName, portraitUrl);
        zip.file(portraitUrl, bytes);
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
  const repoPool = await findRepoPoolById(poolId);
  if (!repoPool) {
    throw new Error(`Figure pool not found: ${poolId}`);
  }

  const persisted = await persistPool(
    {
      ...repoPool.pool,
      name: name.trim(),
    },
    repoPool.directoryName,
    repoPool.pool
  );

  return clonePool(persisted.pool);
}

export async function setDefaultFigurePool(poolId: string): Promise<FigurePool[]> {
  const repoPool = await findRepoPoolById(poolId);
  if (!repoPool) {
    throw new Error(`Figure pool not found: ${poolId}`);
  }

  await persistPool(
    {
      ...repoPool.pool,
      isDefault: true,
    },
    repoPool.directoryName,
    repoPool.pool
  );

  return loadFigurePools();
}

export async function createFigureRecord(
  poolId: string,
  record: FigureRecordInput
): Promise<FigurePoolRecord> {
  const repoPool = await findRepoPoolById(poolId);

  if (!repoPool) {
    throw new Error(`Figure pool not found: ${poolId}`);
  }

  const persisted = await persistPool(
    buildPool({
      ...repoPool.pool,
      records: [...repoPool.pool.records.map((item) => cloneRecord(item)), record],
      createdAt: repoPool.pool.createdAt,
      updatedAt: repoPool.pool.updatedAt,
    }),
    repoPool.directoryName,
    repoPool.pool
  );

  const created = persisted.pool.records.find((item) => item.slug === record.slug);
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
  const repoPool = await findRepoPoolById(poolId);
  const record = repoPool?.pool.records.find((item) => item.slug === slug);
  if (!repoPool || !record) {
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
  const repoPool = await findRepoPoolById(poolId);

  if (!repoPool) {
    throw new Error(`Figure pool not found: ${poolId}`);
  }

  const records = repoPool.pool.records.map((record) =>
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

  const persisted = await persistPool(
    buildPool({
      ...repoPool.pool,
      records,
      createdAt: repoPool.pool.createdAt,
      updatedAt: repoPool.pool.updatedAt,
    }),
    repoPool.directoryName,
    repoPool.pool
  );

  const updated = persisted.pool.records.find(
    (record) => record.slug === (patch.slug?.trim() || slug)
  );

  if (!updated) {
    throw new Error(`Figure record not found after update: ${slug}`);
  }

  return updated;
}

export async function deleteFigureRecord(poolId: string, slug: string): Promise<FigurePool> {
  const repoPool = await findRepoPoolById(poolId);

  if (!repoPool) {
    throw new Error(`Figure pool not found: ${poolId}`);
  }

  const persisted = await persistPool(
    buildPool({
      ...repoPool.pool,
      records: repoPool.pool.records
        .filter((record) => record.slug !== slug)
        .map((record) => cloneRecord(record)),
      createdAt: repoPool.pool.createdAt,
      updatedAt: repoPool.pool.updatedAt,
    }),
    repoPool.directoryName,
    repoPool.pool
  );

  return clonePool(persisted.pool);
}

export async function deleteFigurePool(poolId: string): Promise<FigurePool[]> {
  const repoPool = await findRepoPoolById(poolId);
  if (!repoPool) {
    return loadFigurePools();
  }

  await figurePoolApi.deletePool(repoPool.directoryName);

  const remaining = await loadRepoPools();
  if (repoPool.pool.isDefault && remaining.length > 0) {
    await persistPool(
      {
        ...remaining[0]!.pool,
        isDefault: true,
      },
      remaining[0]!.directoryName,
      remaining[0]!.pool
    );
  }

  return loadFigurePools();
}
