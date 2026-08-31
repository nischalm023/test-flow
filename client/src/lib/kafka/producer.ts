import { Producer, RecordMetadata } from "kafkajs";
import { kafka } from "./client";
import { BaseKafkaMessage } from "@/types/kafka";

let producerInstance: Producer | null = null;
let isConnecting = false;

export async function getKafkaProducer(): Promise<Producer> {
  if (producerInstance) {
    return producerInstance;
  }

  if (isConnecting) {
    // Wait until connected
    while (isConnecting && !producerInstance) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (producerInstance) return producerInstance;
  }

  isConnecting = true;
  try {
    const producer = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });

    await producer.connect();
    producerInstance = producer;
    return producerInstance;
  } catch (error) {
    console.error("[Kafka Producer] Connection failed:", error);
    throw error;
  } finally {
    isConnecting = false;
  }
}

/**
 * Publish a single message or structured event to a Kafka topic
 */
export async function sendKafkaMessage<T = unknown>(
  topic: string,
  payload: T | BaseKafkaMessage<T>,
  key?: string
): Promise<RecordMetadata[]> {
  const producer = await getKafkaProducer();

  const messageValue = typeof payload === "string" ? payload : JSON.stringify(payload);

  try {
    const result = await producer.send({
      topic,
      messages: [
        {
          key: key || (typeof payload === "object" && payload && "id" in payload ? String((payload as { id: unknown }).id) : undefined),
          value: messageValue,
          timestamp: Date.now().toString(),
        },
      ],
    });
    return result;
  } catch (error) {
    console.error(`[Kafka Producer] Error publishing to topic "${topic}":`, error);
    throw error;
  }
}

/**
 * Publish a batch of messages to a Kafka topic
 */
export async function sendKafkaBatch(
  topic: string,
  messages: Array<{ key?: string; value: unknown }>
): Promise<RecordMetadata[]> {
  const producer = await getKafkaProducer();

  try {
    const result = await producer.send({
      topic,
      messages: messages.map((m) => ({
        key: m.key,
        value: typeof m.value === "string" ? m.value : JSON.stringify(m.value),
        timestamp: Date.now().toString(),
      })),
    });
    return result;
  } catch (error) {
    console.error(`[Kafka Producer] Error publishing batch to topic "${topic}":`, error);
    throw error;
  }
}

/**
 * Disconnect the producer cleanly
 */
export async function disconnectKafkaProducer(): Promise<void> {
  if (producerInstance) {
    await producerInstance.disconnect();
    producerInstance = null;
  }
}
