const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

export function getGeminiApiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY
  );
}

export function embeddingProvider(): "gemini" | "voyage" {
  if (getGeminiApiKey()) return "gemini";
  if (process.env.VOYAGE_API_KEY) return "voyage";
  return "gemini";
}

export function embeddingDimensions(): number {
  const provider = embeddingProvider();
  if (provider === "gemini") {
    const customDim = process.env.EMBEDDING_DIMENSIONS ? Number(process.env.EMBEDDING_DIMENSIONS) : undefined;
    // text-embedding-004 is 768 dimensions by default
    return customDim && customDim !== 1024 ? customDim : 768;
  }
  return Number(process.env.EMBEDDING_DIMENSIONS) || 1024;
}

export function embeddingModel(): string {
  const provider = embeddingProvider();
  if (provider === "gemini") {
    const custom = process.env.GEMINI_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL;
    return custom && !custom.includes("voyage") ? custom : "gemini-embedding-001";
  }
  return process.env.EMBEDDING_MODEL || "voyage-4";
}

/**
 * Generate text embeddings using Gemini API (gemini-embedding-001) with batching
 */
async function embedWithGemini(texts: string[], apiKey: string): Promise<number[][]> {
  const modelName = embeddingModel();
  const fullModelName = modelName.startsWith("models/") ? modelName : `models/${modelName}`;
  const url = `${GEMINI_BASE_URL}/${encodeURIComponent(modelName)}:batchEmbedContents?key=${apiKey}`;
  const dimensions = embeddingDimensions();

  // Gemini batchEmbedContents accepts up to 100 requests per call
  const BATCH_SIZE = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const requests = batch.map((text) => ({
      model: fullModelName,
      content: {
        parts: [{ text: text.slice(0, 10000) }],
      },
      outputDimensionality: dimensions,
    }));

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini embeddings failed (${res.status}): ${body.slice(0, 400)}`);
    }

    const data = (await res.json()) as {
      embeddings?: Array<{ values: number[] }>;
    };

    const rows = data.embeddings ?? [];
    for (const row of rows) {
      allEmbeddings.push(row.values);
    }
  }

  return allEmbeddings;
}

/**
 * Generate text embeddings using VoyageAI API (fallback)
 */
async function embedWithVoyage(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: texts,
      model: embeddingModel(),
      output_dimension: embeddingDimensions(),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Voyage embeddings failed (${res.status}): ${body.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    data?: Array<{ embedding: number[]; index: number }>;
  };
  const rows = data.data ?? [];
  return [...rows].sort((a, b) => a.index - b.index).map((row) => row.embedding);
}

/**
 * Main export: Generate vector embeddings for an array of strings.
 * Defaults to GEMINI_API_KEY (text-embedding-004), falls back to VOYAGE_API_KEY.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const geminiKey = getGeminiApiKey();
  if (geminiKey) {
    return embedWithGemini(texts, geminiKey);
  }

  const voyageKey = process.env.VOYAGE_API_KEY;
  if (voyageKey) {
    return embedWithVoyage(texts, voyageKey);
  }

  throw new Error("Neither GEMINI_API_KEY nor VOYAGE_API_KEY is set in environment variables.");
}
