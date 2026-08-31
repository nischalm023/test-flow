import { Kafka, logLevel } from "kafkajs";

const parseBrokers = (): string[] => {
  const brokersEnv = process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER || "localhost:9092";
  return brokersEnv
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
};

const clientId = process.env.KAFKA_CLIENT_ID || "nextjs-testflow-client";

// Global cache for Next.js hot-reload development singleton
declare global {
  // eslint-disable-next-line no-var
  var __kafkaClientInstance: Kafka | undefined;
}

export const kafka =
  globalThis.__kafkaClientInstance ||
  new Kafka({
    clientId,
    brokers: parseBrokers(),
    logLevel: process.env.NODE_ENV === "production" ? logLevel.ERROR : logLevel.WARN,
    retry: {
      initialRetryTime: 300,
      retries: 8,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__kafkaClientInstance = kafka;
}