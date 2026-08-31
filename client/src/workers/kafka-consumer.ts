import { createKafkaConsumer, ensureTopicsExist, KAFKA_CONSUMER_GROUPS, KAFKA_TOPICS } from "../lib/kafka";
import { IndexingEventPayload, QueryEventPayload, ReadmeChunkIndexingPayload, TestRunEventPayload } from "../types/kafka";
import { embedTexts } from "../lib/embeddings";
import { collectionInfo, pointIdFor, QdrantPoint, qdrantCollection, upsertPoints } from "../lib/qdrant";

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
    heartbeat?: () => Promise<void>;
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
        await options.heartbeat?.();
        await new Promise((resolve) => setTimeout(resolve, delay));
        await options.heartbeat?.();
      }
    }
  }

  console.error(`[Worker Retry] ❌ All ${maxRetries} retry attempts failed for ${opName}.`);
  throw lastError;
}

async function embedAndUpsertBatch(
  points: Array<{ documentId: string; content: string; payload: Record<string, unknown>; collection: string }>,
  heartbeat: () => Promise<void>,
  operationName: string,
): Promise<{ count: number; embedDurationMs: number; dbDurationMs: number; totalDurationMs: number }> {
  if (points.length === 0) return { count: 0, embedDurationMs: 0, dbDurationMs: 0, totalDurationMs: 0 };

  const startBatchTime = Date.now();

  // 1. Measure Embedding Generation Time
  const embedStart = Date.now();
  const vectors = await withRetry(() => embedTexts(points.map((p) => p.content)), {
    maxRetries: 3,
    initialDelayMs: 1000,
    operationName,
    heartbeat,
  });
  const embedDurationMs = Date.now() - embedStart;
  await heartbeat();

  if (vectors.length !== points.length) {
    throw new Error(`${operationName}: expected ${points.length} embeddings, got ${vectors.length}`);
  }

  const byCollection = new Map<string, QdrantPoint[]>();
  for (let i = 0; i < points.length; i++) {
    const item = points[i];
    const list = byCollection.get(item.collection) ?? [];
    list.push({
      id: pointIdFor(item.documentId),
      vector: vectors[i],
      payload: item.payload,
    });
    byCollection.set(item.collection, list);
  }

  // 2. Measure Database Upsert Time
  let totalDbDurationMs = 0;
  for (const [collection, collectionPoints] of byCollection) {
    const dbStart = Date.now();
    await withRetry(() => upsertPoints(collectionPoints, collection), {
      maxRetries: 3,
      initialDelayMs: 1000,
      operationName: `Qdrant batch upsert (${collectionPoints.length} points) into ${collection}`,
      heartbeat,
    });
    const dbDurationMs = Date.now() - dbStart;
    totalDbDurationMs += dbDurationMs;
    await heartbeat();

    const info = await collectionInfo(collection).catch(() => ({ result: { points_count: 0 } }));
    console.log(
      `[Worker] 💾 Database saved ${collectionPoints.length} point(s) to "${collection}" in ${dbDurationMs}ms (${info.result?.points_count ?? "?"} total in collection)`
    );
  }

  const totalDurationMs = Date.now() - startBatchTime;
  const avgPerChunk = (totalDurationMs / points.length).toFixed(1);
  console.log(
    `[Worker] ⏱️ Batch Process Timing: ${points.length} item(s) in ${totalDurationMs}ms (🧠 Embedding: ${embedDurationMs}ms | 💾 DB Save: ${totalDbDurationMs}ms | ⚡ Avg: ${avgPerChunk}ms/chunk)`
  );

  return {
    count: points.length,
    embedDurationMs,
    dbDurationMs: totalDbDurationMs,
    totalDurationMs,
  };
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

  consumerService.registerBatchHandler<ReadmeChunkIndexingPayload>(
    KAFKA_TOPICS.README_CHUNKS,
    async (items, heartbeat) => {
      const batchStartTime = Date.now();
      const valid = items.filter((item) => item.payload?.documentId && item.payload?.content);
      const firstTimestamp = items[0]?.meta?.timestamp ? Number(items[0]?.meta?.timestamp) : null;
      const kafkaLagMs = firstTimestamp ? Math.max(0, batchStartTime - firstTimestamp) : null;
      const lagStr = kafkaLagMs !== null ? ` | ⏱️ Queue Lag: ${kafkaLagMs}ms` : "";

      console.log(
        `[Worker] 📥 [README_CHUNKS] Batch received: ${valid.length} chunk(s) on partition ${items[0]?.meta.partition} offsets ${items[0]?.meta.offset}-${items[items.length - 1]?.meta.offset}${lagStr}`
      );
      if (valid.length === 0) return;

      const timing = await embedAndUpsertBatch(
        valid.map(({ payload }) => ({
          documentId: payload.documentId,
          content: payload.content,
          collection: payload.collection || qdrantCollection(),
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
        })),
        heartbeat,
        `Embedding generation for ${valid.length} README chunk(s)`,
      );

      const totalBatchTime = Date.now() - batchStartTime;
      console.log(
        `[Worker] 🏁 [README_CHUNKS] Finished consuming & saving ${valid.length} chunk(s) into database in ${totalBatchTime}ms (Embedding: ${timing.embedDurationMs}ms | DB Upsert: ${timing.dbDurationMs}ms)`
      );
    }
  );

  consumerService.registerBatchHandler<IndexingEventPayload>(
    KAFKA_TOPICS.INDEXING_QUEUE,
    async (items, heartbeat) => {
      const batchStartTime = Date.now();
      const valid = items.filter((item) => item.payload?.documentId && item.payload?.content);
      const firstTimestamp = items[0]?.meta?.timestamp ? Number(items[0]?.meta?.timestamp) : null;
      const kafkaLagMs = firstTimestamp ? Math.max(0, batchStartTime - firstTimestamp) : null;
      const lagStr = kafkaLagMs !== null ? ` | ⏱️ Queue Lag: ${kafkaLagMs}ms` : "";

      console.log(`[Worker] 📥 [INDEXING_QUEUE] Batch received: ${valid.length} document(s)${lagStr}`);
      if (valid.length === 0) return;

      const timing = await embedAndUpsertBatch(
        valid.map(({ payload }) => ({
          documentId: payload.documentId,
          content: payload.content,
          collection: payload.collection || qdrantCollection(),
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
        })),
        heartbeat,
        `Embedding generation for ${valid.length} indexing document(s)`,
      );

      const totalBatchTime = Date.now() - batchStartTime;
      console.log(
        `[Worker] 🏁 [INDEXING_QUEUE] Finished consuming & saving ${valid.length} document(s) into database in ${totalBatchTime}ms (Embedding: ${timing.embedDurationMs}ms | DB Upsert: ${timing.dbDurationMs}ms)`
      );
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
