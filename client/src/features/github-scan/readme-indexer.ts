import { RecursiveCharacterTextSplitter } from "@/lib/chunker";
import { sendKafkaBatch } from "@/lib/kafka/producer";
import { KAFKA_TOPICS } from "@/lib/kafka/topics";
import { ReadmeChunkIndexingPayload } from "@/types/kafka";
import { pointIdFor } from "@/lib/qdrant";
import { generateNativeRepoReadme } from "./agent";

export interface GenerateAndIndexReadmeOptions {
  token?: string;
  owner: string;
  repo: string;
  branch?: string;
  userId?: string;
  existingReport?: string;
}

export interface ReadmeIndexingResult {
  success: boolean;
  totalChunks: number;
  topic: string;
  documentIds: string[];
  readmeLength: number;
  readmeAlreadyExisted?: boolean;
  error?: string;
}

/**
 * Checks if README.md exists on the selected GitHub repository.
 * - If README.md exists: indexes the actual repository README without modifying or generating.
 * - If README.md does not exist: generates a comprehensive native README.md based entirely on
 *   the codebase and indexes it to Kafka -> Qdrant.
 */
export async function generateAndIndexRepoReadme({
  token,
  owner,
  repo,
  branch,
  userId,
  existingReport,
}: GenerateAndIndexReadmeOptions): Promise<ReadmeIndexingResult> {
  const githubRepo = `${owner}/${repo}`;
  let readmeContent = "";
  let readmeAlreadyExisted = false;

  // 1. Check if README.md already exists on the selected repository
  if (token) {
    try {
      const checkResult = await generateNativeRepoReadme({
        token,
        owner,
        repo,
        branch,
      });
      readmeContent = checkResult.content;
      readmeAlreadyExisted = checkResult.exists;
    } catch (err) {
      console.warn(`[README Indexer] Warning getting README for ${githubRepo}:`, err);
    }
  }

  // 2. Fallback to existingReport only if we have no content
  if (!readmeContent.trim() && existingReport?.trim()) {
    readmeContent = existingReport.trim();
  }

  // 3. Fallback to basic clean header if completely empty
  if (!readmeContent.trim()) {
    readmeContent = `# ${githubRepo}\n\nRepository: https://github.com/${githubRepo}\n`;
  }

  // 4. Chunk README using LangChain RecursiveCharacterTextSplitter (chunkSize: 800, chunkOverlap: 150)
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 150,
  });

  const textChunks = await splitter.splitText(readmeContent);
  if (textChunks.length === 0) {
    textChunks.push(readmeContent);
  }

  const baseDocId = `${owner}_${repo}_readme`;
  const payloads: ReadmeChunkIndexingPayload[] = textChunks.map((chunk, index) => {
    const docId = `${baseDocId}_chunk_${index}`;
    return {
      documentId: docId,
      chunkIndex: index,
      totalChunks: textChunks.length,
      title: `${githubRepo} - README (Chunk ${index + 1}/${textChunks.length})`,
      content: chunk,
      source: "readme-chunk",
      chunkSize: 800,
      chunkOverlap: 150,
      userId,
      githubRepo,
      owner,
      repo,
      branch: branch || "main",
      metadata: {
        pointId: pointIdFor(docId),
        length: chunk.length,
        createdAt: new Date().toISOString(),
      },
    };
  });

  // 5. Publish chunks to Kafka topic (README_CHUNKS)
  try {
    const kafkaMessages = payloads.map((p) => ({
      key: p.documentId,
      value: p,
    }));

    await sendKafkaBatch(KAFKA_TOPICS.README_CHUNKS, kafkaMessages);
    console.log(
      `[Kafka] 🚀 Dispatched ${payloads.length} README chunks for ${githubRepo} to topic "${KAFKA_TOPICS.README_CHUNKS}" (alreadyExisted: ${readmeAlreadyExisted})`
    );

    return {
      success: true,
      totalChunks: payloads.length,
      topic: KAFKA_TOPICS.README_CHUNKS,
      documentIds: payloads.map((p) => p.documentId),
      readmeLength: readmeContent.length,
      readmeAlreadyExisted,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Kafka] ⚠️ Failed to dispatch README chunks for ${githubRepo}:`, err);
    return {
      success: false,
      totalChunks: payloads.length,
      topic: KAFKA_TOPICS.README_CHUNKS,
      documentIds: payloads.map((p) => p.documentId),
      readmeLength: readmeContent.length,
      readmeAlreadyExisted,
      error: errorMsg,
    };
  }
}
