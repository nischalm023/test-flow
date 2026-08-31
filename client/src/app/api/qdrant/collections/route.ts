import { NextResponse } from "next/server";
import {
  collectionInfo,
  createCollection,
  deleteCollection,
  listCollections,
  qdrantUrl,
} from "@/lib/qdrant";
import { embeddingDimensions } from "@/lib/embeddings";

export const runtime = "nodejs";

/**
 * GET /api/qdrant/collections
 * List all collections with point counts and vector dimensions
 */
export async function GET() {
  try {
    const names = await listCollections();
    const details = await Promise.all(
      names.map(async (name) => {
        const info = await collectionInfo(name).catch(() => null);
        return {
          name,
          status: info?.result?.status ?? "unknown",
          pointsCount: info?.result?.points_count ?? 0,
          indexedVectorsCount: info?.result?.indexed_vectors_count ?? 0,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      url: qdrantUrl(),
      totalCollections: names.length,
      collections: details,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list collections";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/qdrant/collections
 * Create a new collection in Qdrant
 * Body: { name: string, dimensions?: number, distance?: "Cosine" | "Euclid" | "Dot" }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    dimensions?: number;
    distance?: "Cosine" | "Euclid" | "Dot";
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json(
      { error: "Collection name is required" },
      { status: 400 }
    );
  }

  const dimensions = body.dimensions ?? embeddingDimensions();
  const distance = body.distance ?? "Cosine";

  try {
    await createCollection(name, { dimensions, distance });
    const info = await collectionInfo(name).catch(() => null);

    return NextResponse.json({
      ok: true,
      message: `Collection "${name}" created successfully`,
      collection: {
        name,
        dimensions,
        distance,
        status: info?.result?.status ?? "green",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create collection";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/qdrant/collections?name=<collection_name>
 * Delete a collection by name
 */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name")?.trim();

  if (!name) {
    return NextResponse.json(
      { error: "Collection name query parameter is required" },
      { status: 400 }
    );
  }

  try {
    await deleteCollection(name);
    return NextResponse.json({
      ok: true,
      message: `Collection "${name}" deleted successfully`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete collection";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
