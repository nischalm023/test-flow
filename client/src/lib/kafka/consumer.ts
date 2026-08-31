import { Consumer, KafkaMessage } from "kafkajs";
import { kafka } from "./client";
import { KafkaBatchHandler, KafkaMessageHandler, KafkaMessageMeta } from "@/types/kafka";

export class KafkaConsumerService {
  private consumer: Consumer;
  private isRunning: boolean = false;
  private handlers: Map<string, KafkaMessageHandler<any>> = new Map();
  private batchHandlers: Map<string, KafkaBatchHandler<any>> = new Map();

  constructor(groupId: string) {
    this.consumer = kafka.consumer({
      groupId,
      sessionTimeout: 60_000,
      heartbeatInterval: 3_000,
      maxWaitTimeInMs: 1_000,
      retry: {
        initialRetryTime: 300,
        retries: 5,
      },
    });
  }

  public registerHandler<T = unknown>(topic: string, handler: KafkaMessageHandler<T>): void {
    this.handlers.set(topic, handler);
  }

  public registerBatchHandler<T = unknown>(topic: string, handler: KafkaBatchHandler<T>): void {
    this.batchHandlers.set(topic, handler);
  }

  public async start(topics: string[], fromBeginning: boolean = false): Promise<void> {
    if (this.isRunning) {
      console.warn("[Kafka Consumer] Consumer is already running.");
      return;
    }

    try {
      console.log(`[Kafka Consumer] Connecting consumer...`);
      await this.consumer.connect();

      for (const topic of topics) {
        console.log(`[Kafka Consumer] Subscribing to topic: ${topic}`);
        await this.consumer.subscribe({ topic, fromBeginning });
      }

      this.isRunning = true;

      await this.consumer.run({
        autoCommit: true,
        eachBatchAutoResolve: true,
        eachBatch: async ({ batch, heartbeat, isRunning, isStale }) => {
          if (!isRunning() || isStale()) return;

          const items = batch.messages.map((message) => ({
            payload: parseMessageValue(message),
            meta: {
              topic: batch.topic,
              partition: batch.partition,
              offset: message.offset,
              key: message.key ? message.key.toString() : null,
              timestamp: message.timestamp,
            } satisfies KafkaMessageMeta,
          }));

          if (items.length === 0) return;

          try {
            const batchHandler = this.batchHandlers.get(batch.topic);
            if (batchHandler) {
              await batchHandler(items, heartbeat);
              await heartbeat();
              return;
            }

            const handler = this.handlers.get(batch.topic);
            if (!handler) {
              console.warn(`[Kafka Consumer] No handler registered for topic "${batch.topic}". Message ignored.`);
              return;
            }

            for (const item of items) {
              if (!isRunning() || isStale()) return;
              await handler(item.payload, item.meta);
              await heartbeat();
            }
          } catch (handlerError) {
            console.error(
              `[Kafka Consumer] Batch failed on topic "${batch.topic}" (first offset ${items[0]?.meta.offset}):`,
              handlerError
            );
            throw handlerError;
          }
        },
      });

      console.log(`[Kafka Consumer] Successfully started listening to [${topics.join(", ")}]`);
    } catch (error) {
      console.error("[Kafka Consumer] Failed to start consumer:", error);
      this.isRunning = false;
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      console.log("[Kafka Consumer] Disconnecting consumer...");
      await this.consumer.disconnect();
      this.isRunning = false;
      console.log("[Kafka Consumer] Disconnected successfully.");
    } catch (error) {
      console.error("[Kafka Consumer] Error disconnecting consumer:", error);
    }
  }

  public getRawConsumer(): Consumer {
    return this.consumer;
  }
}

function parseMessageValue(message: KafkaMessage): unknown {
  const rawValue = message.value ? message.value.toString() : null;
  if (!rawValue) return null;
  try {
    return JSON.parse(rawValue);
  } catch {
    return rawValue;
  }
}

export function createKafkaConsumer(groupId: string): KafkaConsumerService {
  return new KafkaConsumerService(groupId);
}
