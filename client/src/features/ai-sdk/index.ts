import { ChatOpenRouter } from "@langchain/openrouter";

export function getOpenRouterChatModel(modelId = "anthropic/claude-sonnet-4") {
  return new ChatOpenRouter({
    model: modelId,
    apiKey: process.env.OPENROUTER_API_KEY,
    siteName: "TestFlow AI",
  });
}
