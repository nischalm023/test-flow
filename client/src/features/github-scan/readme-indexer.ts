import { Octokit } from "octokit";
import { RecursiveCharacterTextSplitter } from "@/lib/chunker";
import { sendKafkaBatch } from "@/lib/kafka/producer";
import { KAFKA_TOPICS } from "@/lib/kafka/topics";
import { ReadmeChunkIndexingPayload } from "@/types/kafka";
import { pointIdFor } from "@/lib/qdrant";

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
 * - If README.md exists: indexes the actual repository README.
 * - If README.md does not exist: skips indexing without generating synthetic files.
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

  // 1. Fetch README.md if it exists on GitHub repository
  if (token) {
    try {
      const octokit = new Octokit({ auth: token, userAgent: "TestFlow-AI" });
      const { data } = await octokit.rest.repos.getReadme({
        owner,
        repo,
        ref: branch && branch !== "HEAD" ? branch : undefined,
      });

      if (data && typeof data.content === "string") {
        const decoded = Buffer.from(data.content, "base64").toString("utf-8");
        if (decoded.trim().length > 0) {
          readmeContent = decoded;
          readmeAlreadyExisted = true;
        }
      }
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status !== 404) {
        console.warn(`[README Indexer] Notice checking README for ${githubRepo}:`, err);
      }
    }
  }

  // If no README exists on the repository, do not index fake documents
  if (!readmeContent.trim()) {
    console.log(`[README Indexer] No existing README.md found for ${githubRepo}. Skipping index.`);
    return {
      success: true,
      totalChunks: 0,
      topic: KAFKA_TOPICS.README_CHUNKS,
      documentIds: [],
      readmeLength: 0,
      readmeAlreadyExisted: false,
    };
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

  const toPayloads = (
    chunks: string[],
    baseDocId: string,
    source: string,
    titlePrefix: string,
  ): ReadmeChunkIndexingPayload[] =>
    chunks.map((chunk, index) => {
      const docId = `${baseDocId}_chunk_${index}`;
      return {
        documentId: docId,
        chunkIndex: index,
        totalChunks: chunks.length,
        title: `${titlePrefix} (Chunk ${index + 1}/${chunks.length})`,
        content: chunk,
        source,
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

  const payloads: ReadmeChunkIndexingPayload[] = toPayloads(
    textChunks,
    `${owner}_${repo}_readme`,
    "readme-chunk",
    `${githubRepo} - README`,
  );

  const report = existingReport?.trim() || "";
  if (report && report !== readmeContent.trim()) {
    const reportChunks = await splitter.splitText(report);
    if (reportChunks.length > 0) {
      payloads.push(
        ...toPayloads(reportChunks, `${owner}_${repo}_scan`, "scan-report", `${githubRepo} - Scan`)
      );
    }
  }

  // 5. Publish chunks to Kafka topic (README_CHUNKS)
  try {
    const kafkaMessages = payloads.map((p) => ({
      key: p.documentId,
      value: p,
    }));

    const dispatchStart = Date.now();
    await sendKafkaBatch(KAFKA_TOPICS.README_CHUNKS, kafkaMessages);
    const dispatchDurationMs = Date.now() - dispatchStart;
    console.log(
      `[Kafka] 🚀 Dispatched ${payloads.length} README chunks for ${githubRepo} to topic "${KAFKA_TOPICS.README_CHUNKS}" in ${dispatchDurationMs}ms (alreadyExisted: ${readmeAlreadyExisted})`
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
