import { createKafkaConsumer, ensureTopicsExist, KAFKA_CONSUMER_GROUPS, KAFKA_TOPICS } from "../lib/kafka";
import { IndexingEventPayload, QueryEventPayload, ReadmeChunkIndexingPayload, TestRunEventPayload } from "../types/kafka";
import { embedTexts } from "../lib/embeddings";
import { collectionInfo, pointIdFor, qdrantCollection, upsertPoints } from "../lib/qdrant";

/**
 * Execute an async operation with up to `maxRetries` (default: 3) attempts
 * and exponential backoff delay before failing.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    backoffFactor?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 800;
  const backoffFactor = options.backoffFactor ?? 2;
  const opName = options.operationName ?? "database/vector operation";

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[Worker Retry] ⚠️ Attempt ${attempt}/${maxRetries} failed for ${opName}: ${errorMsg}`
      );

      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
        console.log(`[Worker Retry] ⏳ Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`[Worker Retry] ❌ All ${maxRetries} retry attempts failed for ${opName}.`);
  throw lastError;
}

async function main() {
  console.log("==========================================");
  console.log("🚀 Starting TestFlow Kafka Worker Process");
  console.log("==========================================");

  // 1. Ensure required topics exist in Kafka broker before consuming
  try {
    await ensureTopicsExist([
      { topic: KAFKA_TOPICS.INDEXING_QUEUE, numPartitions: 3, replicationFactor: 1 },
      { topic: KAFKA_TOPICS.README_CHUNKS, numPartitions: 3, replicationFactor: 1 },
      { topic: KAFKA_TOPICS.QUERY_QUEUE, numPartitions: 3, replicationFactor: 1 },
      { topic: KAFKA_TOPICS.TEST_EVENTS, numPartitions: 3, replicationFactor: 1 },
      { topic: KAFKA_TOPICS.TEST_FAIL_RETRY, numPartitions: 3, replicationFactor: 1 },
    ]);
  } catch (err) {
    console.error("⚠️ Warning: Topic verification failed (broker might still be initializing):", err);
  }

  // 2. Initialize consumer with consumer group ID
  const consumerService = createKafkaConsumer(KAFKA_CONSUMER_GROUPS.DEFAULT_CLIENT_GROUP);

  // 3. Register Topic Event Handlers

  // Handler for README / Code Document Chunks (with 3x retry on VoyageAI and Qdrant save)
  consumerService.registerHandler<ReadmeChunkIndexingPayload>(
    KAFKA_TOPICS.README_CHUNKS,
    async (payload, meta) => {
      console.log(
        `[Worker] 📥 Received README_CHUNK on partition ${meta.partition}, offset ${meta.offset}: [${payload?.chunkIndex + 1}/${payload?.totalChunks}] ${payload?.documentId}`
      );

      if (!payload?.documentId || !payload?.content) {
        console.warn("[Worker] Skipping README chunk with missing documentId/content");
        return;
      }

      const collection = payload.collection || qdrantCollection();
      const docId = payload.documentId;
      const pointId = pointIdFor(docId);

      // Step A: Generate Embedding with 3x retry
      const [vector] = await withRetry(
        () => embedTexts([payload.content]),
        {
          maxRetries: 3,
          initialDelayMs: 1000,
          operationName: `Embedding generation for chunk ${docId}`,
        }
      );

      // Step B: Upsert into Qdrant Vector Store with 3x retry
      await withRetry(
        () =>
          upsertPoints(
            [
              {
                id: pointId,
                vector,
                payload: {
                  documentId: payload.documentId,
                  chunkIndex: payload.chunkIndex,
                  totalChunks: payload.totalChunks,
                  title: payload.title,
                  source: payload.source ?? "readme-chunk",
                  content: payload.content,
                  chunkSize: payload.chunkSize ?? 800,
                  chunkOverlap: payload.chunkOverlap ?? 150,
                  userId: payload.userId,
                  githubRepo:
                    payload.githubRepo ||
                    (payload.owner && payload.repo ? `${payload.owner}/${payload.repo}` : undefined),
                  owner: payload.owner,
                  repo: payload.repo,
                  branch: payload.branch,
                  metadata: payload.metadata,
                },
              },
            ],
            collection
          ),
        {
          maxRetries: 3,
          initialDelayMs: 1000,
          operationName: `Qdrant upsert for chunk ${docId}`,
        }
      );

      const info = await collectionInfo(collection).catch(() => ({ result: { points_count: 0 } }));
      console.log(
        `[Worker] ✅ Saved README chunk [${payload.chunkIndex + 1}/${payload.totalChunks}] to Qdrant collection "${collection}" (${info.result?.points_count ?? "?"} total points)`
      );
    }
  );

  // General Indexing Event Handler (with 3x retry on VoyageAI and Qdrant save)
  consumerService.registerHandler<IndexingEventPayload>(
    KAFKA_TOPICS.INDEXING_QUEUE,
    async (payload, meta) => {
      console.log(`[Worker] 📥 Received INDEXING message on partition ${meta.partition}, offset ${meta.offset}:`, {
        documentId: payload?.documentId,
        title: payload?.title,
        source: payload?.source,
      });

      if (!payload?.documentId || !payload?.content) {
        console.warn("[Worker] Skipping indexing message with missing documentId/content");
        return;
      }

      const collection = payload.collection || qdrantCollection();
      const pointId = pointIdFor(payload.documentId);

      const [vector] = await withRetry(
        () => embedTexts([payload.content]),
        {
          maxRetries: 3,
          initialDelayMs: 1000,
          operationName: `Embedding generation for document ${payload.documentId}`,
        }
      );

      await withRetry(
        () =>
          upsertPoints(
            [
              {
                id: pointId,
                vector,
                payload: {
                  documentId: payload.documentId,
                  userId: payload.userId,
                  githubRepo:
                    payload.githubRepo ||
                    (payload.owner && payload.repo ? `${payload.owner}/${payload.repo}` : undefined),
                  owner: payload.owner,
                  repo: payload.repo,
                  title: payload.title,
                  source: payload.source ?? "kafka",
                  content: payload.content,
                },
              },
            ],
            collection
          ),
        {
          maxRetries: 3,
          initialDelayMs: 1000,
          operationName: `Qdrant upsert for document ${payload.documentId}`,
        }
      );

      const info = await collectionInfo(collection).catch(() => ({ result: { points_count: 0 } }));
      console.log(`[Worker] ✅ Saved to Qdrant collection "${collection}" (${info.result?.points_count ?? "?"} points): ${payload.documentId}`);
    }
  );

  consumerService.registerHandler<QueryEventPayload>(
    KAFKA_TOPICS.QUERY_QUEUE,
    async (payload, meta) => {
      console.log(`[Worker] 📥 Received QUERY message on partition ${meta.partition}, offset ${meta.offset}:`, {
        queryId: payload?.queryId,
        query: payload?.query,
      });

      // TODO: Call RAG retrieval / Claude LLM generation
      console.log(`[Worker] ✅ Handled query: ${payload?.queryId}`);
    }
  );

  consumerService.registerHandler<TestRunEventPayload>(
    KAFKA_TOPICS.TEST_EVENTS,
    async (payload, meta) => {
      console.log(`[Worker] 📥 Received TEST RUN message on partition ${meta.partition}, offset ${meta.offset}:`, {
        runId: payload?.runId,
        status: payload?.status,
        testSuite: payload?.testSuite,
      });
    }
  );

  consumerService.registerHandler<any>(
    KAFKA_TOPICS.TEST_FAIL_RETRY,
    async (payload, meta) => {
      console.log(`[Worker] 📥 Received TEST_FAIL_RETRY event on partition ${meta.partition}, offset ${meta.offset}:`, {
        runId: payload?.runId,
        testCaseId: payload?.testCaseId,
        retryCount: payload?.retryCount,
        maxRetries: payload?.maxRetries ?? 3,
        owner: payload?.owner,
        repo: payload?.repo,
        branch: payload?.branch,
        errorMessage: payload?.errorMessage,
      });
      console.log(`[Worker] 🔄 Processing Claude self-healing for test: ${payload?.testCaseTitle || payload?.testCaseId}`);
    }
  );

  // 4. Start consuming from topics
  await consumerService.start([
    KAFKA_TOPICS.INDEXING_QUEUE,
    KAFKA_TOPICS.README_CHUNKS,
    KAFKA_TOPICS.QUERY_QUEUE,
    KAFKA_TOPICS.TEST_EVENTS,
    KAFKA_TOPICS.TEST_FAIL_RETRY,
  ]);

  // 5. Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.log(`\n[Worker] Received ${signal}. Shutting down worker gracefully...`);
    await consumerService.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal worker error:", err);
  process.exit(1);
});
