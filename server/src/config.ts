import "dotenv/config";

export const config = {
  port: Number(process.env.PORT) || 8000,

  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
  },

  qdrant: {
    url: process.env.QDRANT_URL || "http://127.0.0.1:6333",
    collection: process.env.QDRANT_COLLECTION || "documents",
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || "127.0.0.1:9092").split(","),
    clientId: process.env.KAFKA_CLIENT_ID || "testflow-rag",
    indexingTopic: process.env.KAFKA_INDEXING_TOPIC || "indexing-queue",
    queryTopic: process.env.KAFKA_QUERY_TOPIC || "query-queue",
    indexingGroupId: process.env.KAFKA_INDEXING_GROUP_ID || "indexing-workers",
    queryGroupId: process.env.KAFKA_QUERY_GROUP_ID || "query-workers",
  },

  // Claude chat + Voyage embeddings (Anthropic's recommended embedding provider)
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    chatModel: process.env.CHAT_MODEL || "claude-sonnet-4-20250514",
    embeddingApiKey: process.env.VOYAGE_API_KEY,
    // voyage-4 -> 1024 dims (default); voyage-4-large also supports 2048/512/256
    embeddingModel: process.env.EMBEDDING_MODEL || "voyage-4",
    embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS) || 1024,
  },

  chunking: {
    chunkSize: Number(process.env.CHUNK_SIZE) || 1000,
    chunkOverlap: Number(process.env.CHUNK_OVERLAP) || 200,
  },

  retrieval: {
    topK: Number(process.env.RETRIEVAL_TOP_K) || 4,
    rrfK: Number(process.env.RRF_K) || 60,
    finalK: Number(process.env.RETRIEVAL_FINAL_K) || 5,
  },
};
