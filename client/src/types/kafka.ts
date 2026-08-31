export interface BaseKafkaMessage<T = unknown> {
  id: string;
  timestamp: string;
  eventType: string;
  payload: T;
  metadata?: Record<string, unknown>;
}

// Indexing event payload (as defined in server/config.ts and RAG pipeline)
export interface IndexingEventPayload {
  documentId: string;
  title?: string;
  content: string;
  source?: string;
  collection?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  userId?: string;
  githubRepo?: string;
  owner?: string;
  repo?: string;
}

// Query event payload
export interface QueryEventPayload {
  queryId: string;
  query: string;
  topK?: number;
  collection?: string;
  userId?: string;
}

// Test flow execution event payload
export interface TestRunEventPayload {
  runId: string;
  repoUrl?: string;
  testSuite: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  result?: Record<string, unknown>;
}

// Test fail retry payload (max retry limit: 3)
export interface TestFailRetryPayload {
  runId: string;
  testCaseId: string;
  testCaseTitle?: string;
  testCase?: any;
  owner: string;
  repo: string;
  branch: string;
  scanId?: string;
  userId?: string;
  failedStepIndex?: number;
  failedStepAction?: string;
  failedStepSelector?: string;
  errorMessage: string;
  errorLogs?: string[];
  retryCount: number;
  maxRetries: number;
  playwrightCommand?: string;
  status: 'PENDING_HEALING' | 'HEALED' | 'FAILED';
}

// Readme and code chunk indexing event payload
export interface ReadmeChunkIndexingPayload {
  documentId: string;
  chunkIndex: number;
  totalChunks: number;
  title?: string;
  content: string;
  source?: string;
  collection?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  userId?: string;
  githubRepo?: string;
  owner?: string;
  repo?: string;
  branch?: string;
  section?: string;
  metadata?: Record<string, unknown>;
}

export type KafkaEventType =
  | 'DOCUMENT_INDEX_REQUESTED'
  | 'README_CHUNK_INDEX_REQUESTED'
  | 'QUERY_EXECUTION_REQUESTED'
  | 'TEST_RUN_TRIGGERED'
  | 'TEST_FAIL_RETRY_TRIGGERED';

export type KafkaMessageHandler<T = unknown> = (
  payload: T,
  rawMessage: {
    topic: string;
    partition: number;
    offset: string;
    key?: string | null;
    timestamp: string;
  }
) => Promise<void>;
