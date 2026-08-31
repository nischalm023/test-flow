import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "langchain",
    "@langchain/core",
    "@langchain/anthropic",
    "@langchain/openrouter",
    "@langchain/langgraph",
    "postgres",
  ],
};

export default nextConfig;
