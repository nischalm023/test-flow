import { NextResponse } from "next/server";
import {
  collectionInfo,
  ensureCollection,
  qdrantCollection,
  qdrantTestCasesCollection,
  qdrantUrl,
  scrollPoints,
} from "@/lib/qdrant";

export const runtime = "nodejs";

export async function GET() {
  const docsCol = qdrantCollection();
  const testsCol = qdrantTestCasesCollection();

  try {
    await ensureCollection(docsCol);
    await ensureCollection(testsCol);

    const [docsInfo, testsInfo] = await Promise.all([
      collectionInfo(docsCol).catch(() => ({ result: { points_count: 0, indexed_vectors_count: 0 } })),
      collectionInfo(testsCol).catch(() => ({ result: { points_count: 0, indexed_vectors_count: 0 } })),
    ]);

    const [scrolledDocs, scrolledTests] = await Promise.all([
      scrollPoints(5, docsCol).catch(() => ({ result: { points: [] } })),
      scrollPoints(5, testsCol).catch(() => ({ result: { points: [] } })),
    ]);

    return NextResponse.json({
      ok: true,
      url: qdrantUrl(),
      collections: {
        documents: {
          name: docsCol,
          pointsCount: docsInfo.result?.points_count ?? 0,
          sample: (scrolledDocs.result?.points ?? []).map((p) => ({
            id: p.id,
            documentId: p.payload?.documentId,
            title: p.payload?.title,
            source: p.payload?.source,
            githubRepo: p.payload?.githubRepo,
          })),
        },
        generatedTests: {
          name: testsCol,
          pointsCount: testsInfo.result?.points_count ?? 0,
          sample: (scrolledTests.result?.points ?? []).map((p) => ({
            id: p.id,
            documentId: p.payload?.documentId,
            filePath: p.payload?.filePath,
            fileType: p.payload?.fileType,
            title: p.payload?.title,
            source: p.payload?.source,
            githubRepo: p.payload?.githubRepo,
          })),
        },
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        url: qdrantUrl(),
        error: err instanceof Error ? err.message : "Qdrant check failed",
      },
      { status: 200 },
    );
  }
}
