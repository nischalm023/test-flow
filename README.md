#  Playwright Automation


End-to-end test suite for the **Testflow** Next.js app, built with Playwright + TypeScript. Includes Cursor/VS Code agent definitions (Planner, Generator, Healer) wired to the `playwright-test` MCP server.

## Prerequisites

- Node.js 20+
- npm (for this repo's test runner) and [pnpm](https://pnpm.io) (for the `client/` app)

## 1. Install dependencies

```bash
npm install
```

Install the Playwright browsers (Chromium, Firefox, WebKit):

```bash
npx playwright install
```

Then install the `client/` app dependencies:

```bash
cd client && pnpm install && cd ..
```

## 2. Run the client app

Tests drive the EventFlow client at `http://localhost:4000`. Playwright starts it automatically via the `webServer` config in [playwright.config.ts](playwright.config.ts), so you normally don't need to start it manually. To run it yourself for manual testing:

```bash
cd client && pnpm dev
```

> All API calls in tests are mocked with `page.route()` (see `src/utils/mock-auth-api.ts`) — tests never hit a real backend on port 3000.

## 3. Run tests

```bash
npx playwright test
```

Useful variants:

```bash
npx playwright test --ui          # interactive UI mode
npx playwright test tests/auth    # run a single folder/spec
npx playwright show-report        # open the last HTML report
```

## 4. MCP server setup (Playwright agents)

This repo ships three Cursor/VS Code agents — **Planner**, **Generator**, **Healer** (see [AGENTS.md](AGENTS.md)) — that use the `playwright-test` MCP server for browser tools.

The server is already configured to run via `npx playwright run-test-mcp-server` in:

- [.vscode/mcp.json](.vscode/mcp.json) — Cursor / VS Code
- [.agents/mcp_config.json](.agents/mcp_config.json) — Cursor agents

To use it:

1. Open this repo in Cursor or VS Code.
2. Enable the server under **Settings → MCP** (it should appear as `playwright-test`).
3. Invoke an agent (Planner, Generator, or Healer) — it will use the MCP server's browser tools automatically.

No manual install is required beyond `npm install`, since `npx` resolves `playwright` from the local `@playwright/test` dependency.

## Folder structure

| Path | Purpose |
|------|---------|
| `client/` | EventFlow Next.js app under test (port 4000) |
| `src/pages/` | Page Object classes |
| `src/fixtures/` | Custom Playwright fixtures |
| `src/utils/` | Helpers (e.g. API mocking) |
| `tests/` | Spec files, mirroring app URL structure |
| `tests/data/` | JSON/CSV test data |
| `specs/` | Planner-generated test plans |
| `.agents/`, `.github/agents/` | Agent + MCP config for Planner/Generator/Healer |

See [AGENTS.md](AGENTS.md) for coding conventions, locator priorities, and the full agent workflow.
