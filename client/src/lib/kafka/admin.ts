import { Admin, ITopicConfig } from "kafkajs";
import { kafka } from "./client";

let adminInstance: Admin | null = null;

export async function getKafkaAdmin(): Promise<Admin> {
  if (adminInstance) return adminInstance;

  const admin = kafka.admin();
  await admin.connect();
  adminInstance = admin;
  return adminInstance;
}

/**
 * Ensure required topics exist in Kafka broker with specified partition count
 */
export async function ensureTopicsExist(
  topics: Array<string | ITopicConfig>,
  defaultPartitions: number = 3,
  replicationFactor: number = 1
): Promise<boolean> {
  const admin = await getKafkaAdmin();

  try {
    const existingTopics = await admin.listTopics();

    const topicConfigs: ITopicConfig[] = topics.map((t) => {
      if (typeof t === "string") {
        return {
          topic: t,
          numPartitions: defaultPartitions,
          replicationFactor,
        };
      }
      return t;
    });

    const topicsToCreate = topicConfigs.filter(
      (tc) => !existingTopics.includes(tc.topic)
    );

    if (topicsToCreate.length > 0) {
      console.log(`[Kafka Admin] Creating topics: ${topicsToCreate.map((t) => t.topic).join(", ")}`);
      await admin.createTopics({
        topics: topicsToCreate,
        waitForLeaders: true,
      });
      console.log(`[Kafka Admin] Topics created successfully.`);
    } else {
      console.log(`[Kafka Admin] All topics already exist.`);
    }

    return true;
  } catch (error) {
    console.error("[Kafka Admin] Failed to ensure topics:", error);
    throw error;
  }
}

/**
 * Check connectivity and retrieve Kafka metadata
 */
export async function checkKafkaHealth(): Promise<{ status: "connected" | "error"; topics: string[]; error?: string }> {
  try {
    const admin = await getKafkaAdmin();
    const topics = await admin.listTopics();
    return {
      status: "connected",
      topics,
    };
  } catch (error: any) {
    return {
      status: "error",
      topics: [],
      error: error?.message || String(error),
    };
  }
}

/**
 * Disconnect the admin client
 */
export async function disconnectKafkaAdmin(): Promise<void> {
  if (adminInstance) {
    await adminInstance.disconnect();
    adminInstance = null;
  }
}
