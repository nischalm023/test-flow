import { NextResponse } from "next/server";
import {
  collectionInfo,
  formatDocumentPoint,
  loadDocumentCollection,
  qdrantCollection,
  qdrantUrl,
} from "@/lib/qdrant";
import { formatRepoOverviewMarkdown, summarizeRepoDocuments } from "@/lib/repo-overview";

export const runtime = "nodejs";

/**
 * GET /api/qdrant/documents?repo=owner/name
 * Return a concise README-style overview of the repo (not every Qdrant point).
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
    const scoped = repo
      ? points.filter((point) => point.payload?.githubRepo === repo)
      : points;

    const overview = summarizeRepoDocuments(scoped.map(formatDocumentPoint), repo ?? "");

    return NextResponse.json({
      ok: true,
      url: qdrantUrl(),
      collection,
      githubRepo: repo ?? null,
      pointsCount: info?.result?.points_count ?? points.length,
      indexedVectorsCount: info?.result?.indexed_vectors_count ?? 0,
      status: info?.result?.status ?? "unknown",
      overview,
      markdown: formatRepoOverviewMarkdown(overview),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load documents collection";
    return NextResponse.json({ ok: false, error: message, collection, url: qdrantUrl() }, { status: 500 });
  }
}
