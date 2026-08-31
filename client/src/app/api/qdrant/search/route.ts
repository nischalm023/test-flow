import { NextResponse } from "next/server";
import { retrieveSimilarChunks } from "@/lib/qdrant";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    query?: string;
    repo?: string;
    owner?: string;
    name?: string;
    source?: string;
    limit?: number;
    scoreThreshold?: number;
  };

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
  }

  const githubRepo =
    body.repo?.trim() ||
    (body.owner && body.name ? `${body.owner}/${body.name}` : undefined);

  try {
    const results = await retrieveSimilarChunks(query, {
      githubRepo,
      source: body.source,
      limit: body.limit ?? 5,
      scoreThreshold: body.scoreThreshold,
    });

    return NextResponse.json({
      query,
      count: results.length,
      results: results.map((r) => ({
        id: r.id,
        score: r.score,
        documentId: r.payload?.documentId,
        title: r.payload?.title,
        chunkIndex: r.payload?.chunkIndex,
        totalChunks: r.payload?.totalChunks,
        content: r.payload?.content,
        githubRepo: r.payload?.githubRepo,
        source: r.payload?.source,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
