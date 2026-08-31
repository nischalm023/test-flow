import { NextResponse } from "next/server";
import {
  collectionInfo,
  formatDocumentPoint,
  loadDocumentCollection,
  qdrantCollection,
  qdrantUrl,
} from "@/lib/qdrant";

export const runtime = "nodejs";

/**
 * GET /api/qdrant/documents?repo=owner/name
 * Return every point in the documents collection (full payload).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const repo = searchParams.get("repo")?.trim() || undefined;
  const collection = qdrantCollection();

  try {
    const [points, info] = await Promise.all([
      loadDocumentCollection(repo),
      collectionInfo(collection).catch(() => null),
    ]);

    return NextResponse.json({
      ok: true,
      url: qdrantUrl(),
      collection,
      githubRepo: repo ?? null,
      pointsCount: info?.result?.points_count ?? points.length,
      indexedVectorsCount: info?.result?.indexed_vectors_count ?? 0,
      status: info?.result?.status ?? "unknown",
      documents: points.map(formatDocumentPoint),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load documents collection";
    return NextResponse.json({ ok: false, error: message, collection, url: qdrantUrl() }, { status: 500 });
  }
}
