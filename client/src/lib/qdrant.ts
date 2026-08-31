import { createHash } from "node:crypto";
import { embeddingDimensions } from "@/lib/embeddings";

export function qdrantUrl(): string {
  return (process.env.QDRANT_URL || "http://127.0.0.1:6333").replace(/\/$/, "");
}

export function qdrantCollection(): string {
  return process.env.QDRANT_COLLECTION || "documents";
}

export function qdrantTestCasesCollection(): string {
  return process.env.QDRANT_TEST_CASES_COLLECTION || "generated_tests";
}

export function pointIdFor(key: string): string {
  const h = createHash("sha1").update(key).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function qdrantFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${qdrantUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as T & { status?: string; status_code?: number };
  if (!res.ok) {
    throw new Error(`Qdrant ${path} failed (${res.status}): ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json;
}

export async function listCollections(): Promise<string[]> {
  const data = await qdrantFetch<{ result?: { collections?: Array<{ name: string }> } }>("/collections");
  return (data.result?.collections ?? []).map((c) => c.name);
}

export async function createCollection(
  name: string,
  options: {
    dimensions?: number;
    distance?: "Cosine" | "Euclid" | "Dot";
  } = {}
): Promise<boolean> {
  const size = options.dimensions ?? embeddingDimensions();
  const distance = options.distance ?? "Cosine";

  await qdrantFetch(`/collections/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: { size, distance },
    }),
  });
  return true;
}

export async function deleteCollection(name: string): Promise<boolean> {
  await qdrantFetch(`/collections/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  return true;
}

export async function ensureCollection(name = qdrantCollection()): Promise<void> {
  const currentDim = embeddingDimensions();
  try {
    const info = await qdrantFetch<{ result?: { config?: { params?: { vectors?: { size?: number } } } } }>(
      `/collections/${encodeURIComponent(name)}`
    );
    const existingSize = info.result?.config?.params?.vectors?.size;
    if (existingSize && existingSize !== currentDim) {
      console.log(`[Qdrant] 🔄 Recreating collection "${name}" to match embedding dimension (${existingSize} -> ${currentDim})`);
      await qdrantFetch(`/collections/${encodeURIComponent(name)}`, { method: "DELETE" });
    } else if (existingSize === currentDim) {
      return;
    }
  } catch {
    // Collection doesn't exist yet
  }

  await qdrantFetch(`/collections/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: { size: currentDim, distance: "Cosine" },
    }),
  });
}

export type QdrantPoint = {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
};

export async function upsertPoints(
  points: QdrantPoint[],
  collection = qdrantCollection(),
): Promise<void> {
  if (points.length === 0) return;
  await ensureCollection(collection);
  await qdrantFetch(`/collections/${encodeURIComponent(collection)}/points?wait=true`, {
    method: "PUT",
    body: JSON.stringify({ points }),
  });
}

export async function collectionInfo(collection = qdrantCollection()) {
  return qdrantFetch<{
    result?: {
      status?: string;
      points_count?: number;
      indexed_vectors_count?: number;
    };
    status?: string;
  }>(`/collections/${encodeURIComponent(collection)}`);
}

export type ScrolledPoint = {
  id: string | number;
  payload?: Record<string, unknown>;
};

export async function scrollPoints(
  limit = 20,
  collection = qdrantCollection(),
  filter?: Record<string, unknown>,
  offset?: unknown,
) {
  return qdrantFetch<{
    result?: {
      points?: ScrolledPoint[];
      next_page_offset?: unknown;
    };
  }>(`/collections/${encodeURIComponent(collection)}/points/scroll`, {
    method: "POST",
    body: JSON.stringify({
      limit,
      with_payload: true,
      with_vector: false,
      ...(filter ? { filter } : {}),
      ...(offset !== undefined && offset !== null ? { offset } : {}),
    }),
  });
}

/** Page through a collection until exhausted (or maxPoints). */
export async function scrollAllPoints(
  collection = qdrantCollection(),
  options: { filter?: Record<string, unknown>; pageSize?: number; maxPoints?: number } = {},
): Promise<ScrolledPoint[]> {
  const pageSize = options.pageSize ?? 100;
  const maxPoints = options.maxPoints ?? 500;
  const points: ScrolledPoint[] = [];
  let offset: unknown = undefined;

  while (points.length < maxPoints) {
    const data = await scrollPoints(pageSize, collection, options.filter, offset);
    const batch = data.result?.points ?? [];
    points.push(...batch);
    const next = data.result?.next_page_offset;
    if (next == null || batch.length === 0) break;
    offset = next;
  }

  return points.slice(0, maxPoints);
}

export function formatDocumentPoint(point: ScrolledPoint): Record<string, unknown> {
  return {
    id: point.id,
    ...(point.payload ?? {}),
  };
}

export async function loadDocumentCollection(githubRepo?: string): Promise<ScrolledPoint[]> {
  const collection = qdrantCollection();
  const repoKey = githubRepo?.trim();
  const filter = repoKey
    ? { must: [{ key: "githubRepo", match: { value: repoKey } }] }
    : undefined;
  try {
    const filtered = await scrollAllPoints(collection, { filter, maxPoints: 500 });
    if (filtered.length > 0 || !repoKey) return filtered;
    return scrollAllPoints(collection, { maxPoints: 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("doesn't exist") || message.includes("404")) {
      return [];
    }
    throw err;
  }
}

export type QdrantSearchResult = {
  id: string | number;
  version: number;
  score: number;
  payload?: {
    documentId?: string;
    chunkIndex?: number;
    totalChunks?: number;
    title?: string;
    content?: string;
    source?: string;
    githubRepo?: string;
    owner?: string;
    repo?: string;
    branch?: string;
    userId?: string;
    [key: string]: unknown;
  };
};

export interface SearchPointsOptions {
  collection?: string;
  limit?: number;
  scoreThreshold?: number;
  filter?: Record<string, unknown>;
}

/**
 * Search Qdrant collection using a vector embedding and optional metadata filter
 */
export async function searchPoints(
  vector: number[],
  options: SearchPointsOptions = {}
): Promise<QdrantSearchResult[]> {
  const collection = options.collection || qdrantCollection();
  const limit = options.limit ?? 5;

  const payload: Record<string, unknown> = {
    vector,
    limit,
    with_payload: true,
    with_vector: false,
  };

  if (options.scoreThreshold !== undefined) {
    payload.score_threshold = options.scoreThreshold;
  }

  if (options.filter) {
    payload.filter = options.filter;
  }

  const response = await qdrantFetch<{
    result?: QdrantSearchResult[];
  }>(`/collections/${encodeURIComponent(collection)}/points/search`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return response.result ?? [];
}

/**
 * Retrieve top-k most relevant chunks matching a text query using VoyageAI embeddings
 */
export async function retrieveSimilarChunks(
  query: string,
  options: {
    githubRepo?: string;
    owner?: string;
    repo?: string;
    source?: string;
    limit?: number;
    collection?: string;
    scoreThreshold?: number;
  } = {}
): Promise<QdrantSearchResult[]> {
  const { embedTexts } = await import("@/lib/embeddings");
  const [queryVector] = await embedTexts([query]);

  const mustConditions: Array<Record<string, unknown>> = [];
  if (options.githubRepo) {
    mustConditions.push({ key: "githubRepo", match: { value: options.githubRepo } });
  } else if (options.owner && options.repo) {
    mustConditions.push({ key: "githubRepo", match: { value: `${options.owner}/${options.repo}` } });
  }
  if (options.source) {
    mustConditions.push({ key: "source", match: { value: options.source } });
  }

  const filter = mustConditions.length > 0 ? { must: mustConditions } : undefined;

  return searchPoints(queryVector, {
    collection: options.collection,
    limit: options.limit ?? 5,
    scoreThreshold: options.scoreThreshold,
    filter,
  });
}


