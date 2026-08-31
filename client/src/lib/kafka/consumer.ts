import { Consumer, EachMessagePayload } from "kafkajs";
import { kafka } from "./client";
import { KafkaMessageHandler } from "@/types/kafka";

export interface ConsumerConfigOptions {
  groupId: string;
  topics: string[];
  fromBeginning?: boolean;
  handlers?: Record<string, KafkaMessageHandler<any>>;
}

export class KafkaConsumerService {
  private consumer: Consumer;
  private isRunning: boolean = false;
  private handlers: Map<string, KafkaMessageHandler<any>> = new Map();

  constructor(groupId: string) {
    this.consumer = kafka.consumer({
      groupId,
      retry: {
        initialRetryTime: 300,
        retries: 5,
      },
    });
  }

  /**
   * Register a handler for a specific topic
   */
  public registerHandler<T = unknown>(topic: string, handler: KafkaMessageHandler<T>): void {
    this.handlers.set(topic, handler);
  }

  /**
   * Connect consumer, subscribe to topics, and start polling messages
   */
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
        eachMessage: async (payload: EachMessagePayload) => {
          const { topic, partition, message } = payload;
          const offset = message.offset;
          const key = message.key ? message.key.toString() : null;
          const rawValue = message.value ? message.value.toString() : null;
          const timestamp = message.timestamp;

          let parsedPayload: unknown = null;
          if (rawValue) {
            try {
              parsedPayload = JSON.parse(rawValue);
            } catch {
              parsedPayload = rawValue;
            }
          }

          const handler = this.handlers.get(topic);
          if (handler) {
            try {
              await handler(parsedPayload, {
                topic,
                partition,
                offset,
                key,
                timestamp,
              });
            } catch (handlerError) {
              console.error(
                `[Kafka Consumer] Error processing message on topic "${topic}" (offset: ${offset}):`,
                handlerError
              );
              // In production, dispatch to a Dead-Letter-Queue (DLQ) here
            }
          } else {
            console.warn(`[Kafka Consumer] No handler registered for topic "${topic}". Message ignored.`);
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

  /**
   * Graceful shutdown of the consumer
   */
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

/**
 * Factory helper to create a configured consumer service
 */
export function createKafkaConsumer(groupId: string): KafkaConsumerService {
  return new KafkaConsumerService(groupId);
}
