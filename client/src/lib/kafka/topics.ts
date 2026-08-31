export const KAFKA_TOPICS = {
  INDEXING_QUEUE: process.env.KAFKA_INDEXING_TOPIC || "indexing-queue",
  README_CHUNKS: process.env.KAFKA_README_CHUNKS_TOPIC || "readme-chunks",
  QUERY_QUEUE: process.env.KAFKA_QUERY_TOPIC || "query-queue",
  TEST_EVENTS: process.env.KAFKA_TEST_EVENTS_TOPIC || "test-events",
  TEST_FAIL_RETRY: process.env.KAFKA_TEST_FAIL_RETRY_TOPIC || "test-fail-retry",
} as const;

export const KAFKA_CONSUMER_GROUPS = {
  INDEXING_GROUP: process.env.KAFKA_INDEXING_GROUP_ID || "indexing-workers",
  QUERY_GROUP: process.env.KAFKA_QUERY_GROUP_ID || "query-workers",
  DEFAULT_CLIENT_GROUP: process.env.KAFKA_CLIENT_GROUP_ID || "nextjs-client-group",
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
export type KafkaConsumerGroup = (typeof KAFKA_CONSUMER_GROUPS)[keyof typeof KAFKA_CONSUMER_GROUPS];
