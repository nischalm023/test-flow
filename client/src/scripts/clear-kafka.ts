import { getKafkaAdmin, disconnectKafkaAdmin } from "../lib/kafka/admin";
import { KAFKA_TOPICS } from "../lib/kafka/topics";

async function main() {
  console.log("🧹 Clearing all messages by purging Kafka topics...");
  try {
    const admin = await getKafkaAdmin();
    const existing = await admin.listTopics();
    const targetTopics = Object.values(KAFKA_TOPICS).filter((t) => existing.includes(t));

    if (targetTopics.length === 0) {
      console.log("ℹ️ No target topics found to delete.");
    } else {
      console.log(`🗑️ Deleting topics: ${targetTopics.join(", ")}`);
      await admin.deleteTopics({
        topics: targetTopics,
        timeout: 10000,
      });
      console.log("✅ Successfully cleared all messages & purged topics!");
      console.log("ℹ️ Topics will be automatically re-created on next worker start.");
    }
  } catch (err) {
    console.error("❌ Failed to clear Kafka topics:", err);
  } finally {
    await disconnectKafkaAdmin();
    process.exit(0);
  }
}

main();
