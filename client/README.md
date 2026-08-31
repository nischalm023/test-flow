# QA Studio

QA Studio is an AI-powered testing workbench that connects to a GitHub repository, scans and understands its codebase, and turns that understanding into a runnable Playwright end-to-end test suite — which it can then run and commit straight back to the repo.

You sign in with GitHub, pick one of your repositories, and QA Studio takes it from there: reading the code, indexing it for retrieval, generating test cases, executing them against a locally running instance of the app, and opening a dedicated branch with the resulting tests.

## How it works

Once a repository is selected, the core flow (`/prompt`) walks through four steps:

1. **Setup MCP & Branch** — creates (or reuses) a `qa-studio/playwright-setup` branch on the target repo and commits the MCP config and Playwright agent skills it needs.
2. **Scan Repository** — a LangChain agent (Anthropic / OpenRouter, with model fallback) explores the repo's files over the GitHub API, reports on its stack and structure, and generates a README summary that is chunked, embedded, and indexed into Qdrant for retrieval-augmented context.
3. **Start Local App** — clones/runs the target repo locally to get a live URL the generated tests can point at.
4. **Generate Test Cases** — using the indexed repo context and a user prompt describing a flow, an LLM produces structured test steps (click, type, assert, navigate, etc.), which are compiled into Playwright spec files and can be committed back to the repo.

Beyond that flow, dedicated tabs let you refine the results:

| Tab | Route | Purpose |
|-----|-------|---------|
| GitHub Repositories | `/repos` | Browse your GitHub repos and branches, kick off a scan |
| Interface Scanner | `/scanner` | Inspect a page's DOM/elements directly |
| Test Case Builder | `/testcasebuilder` | Manually build or edit a test case step by step |
| Test Repository | `/testsuite` | Browse and manage the generated/saved test suite |
| Live Execution | `/testcaserunner` | Run a test case interactively and watch it execute |

## Tech stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **AI / agents:** LangChain (`langchain`, `@langchain/anthropic`, `@langchain/openrouter`), Zod for structured output
- **GitHub integration:** Octokit (repo scanning, branch/commit management)
- **Data:** PostgreSQL via Drizzle ORM (users, repo scans), Qdrant (vector search over indexed READMEs and test cases), Redis
- **Messaging:** Kafka (`kafkajs`) for async indexing and test-run/retry pipelines, with a standalone consumer worker
- **State:** Zustand, TanStack Query

## Getting started

### Prerequisites

- Node.js and [pnpm](https://pnpm.io)
- Docker (for Postgres, Qdrant, Redis, Kafka)
- A GitHub OAuth app (for repo access) and an LLM API key (Anthropic and/or OpenRouter)

### 1. Start backing services

From the repo root:

```bash
docker compose up -d
```

This brings up Postgres (`localhost:5432`), pgAdmin (`localhost:5050`), Qdrant (`localhost:6333`), Redis (`localhost:6379`), Kafka (`localhost:9092`), and Kafka UI (`localhost:8080`).

### 2. Configure environment

Copy the example env file and fill in the values you need:

```bash
cp .env.example .env
```

Key variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth app credentials |
| `GITHUB_TOKEN` | Fallback token for server-side GitHub API calls |
| `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` | LLM providers used for scanning and test generation |
| `CHAT_MODEL` / `OPENROUTER_MODEL` | Override default chat models |
| `GEMINI_API_KEY` / `VOYAGE_API_KEY` | Embedding providers (used for README/test-case indexing) |
| `QDRANT_URL`, `QDRANT_COLLECTION`, `QDRANT_TEST_CASES_COLLECTION` | Qdrant connection and collection names |
| `KAFKA_BROKER(S)`, `KAFKA_*_TOPIC`, `KAFKA_*_GROUP_ID` | Kafka connection and topic/consumer-group names |
| `BETTER_AUTH_SECRET` | Session/auth secret |

### 3. Install dependencies and set up the database

```bash
pnpm install
pnpm db:push
```

### 4. Run the app

```bash
pnpm dev
```

The app runs at [http://localhost:4000](http://localhost:4000).

### 5. (Optional) Run the Kafka consumer worker

Async indexing and test-retry processing run in a separate worker process:

```bash
pnpm worker:kafka
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start the Next.js dev server (port 4000) |
| `pnpm build` / `pnpm start` | Production build and start |
| `pnpm lint` | Run ESLint |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:push` / `pnpm db:studio` | Drizzle schema workflows |
| `pnpm worker:kafka` | Run the Kafka consumer worker |
