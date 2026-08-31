# Playwright Test Automation

Playwright + TypeScript end-to-end test suite for the **TestFlow AI** app (`client/` Next.js frontend, `server/` API, Qdrant vector DB), with three Cursor agents — **Planner**, **Generator**, **Healer** — that plan, generate, and self-heal specs.

![TestFlow AI — Interface Scanner](docs/screenshot.png)

![Architecture overview](docs/architecture.svg)

## Stack

- Playwright 1.56+ with TypeScript
- Node 20+
- Test runner: `@playwright/test`, HTML reporter (Allure optional in CI)
- CI: GitHub Actions, sharded

## Folder structure

| Path | Purpose |
|------|---------|
| `src/pages/` | Page Object classes (one file per page) |
| `src/fixtures/` | Custom fixtures extending base `test` |
| `src/utils/` | Pure helpers (e.g. `mock-auth-api.ts` for blocking API calls) |
| `tests/` | Spec files, mirroring app URL structure |
| `tests/data/` | JSON/CSV test data |
| `specs/` | Planner output (Markdown test plans) |
| `client/` | TestFlow AI Next.js app under test |
| `server/` | API backend |
| `.agents/skills/` | Cursor agent skill definitions |
| `.github/agents/` | Agent definitions with MCP tool bindings |

## Getting started

```bash
npm install
npx playwright install
npx playwright test
```

Run a single spec or filter by tag:

```bash
npx playwright test tests/auth/login.spec.ts
npx playwright test --grep @smoke
```

View the HTML report after a run:

```bash
npx playwright show-report
```

## Agent workflow

1. **Planner** explores the TestFlow AI client (`http://localhost:4000`) and writes a numbered test plan to `specs/<feature>.md`.
2. **Generator** turns a plan scenario into page objects and a runnable spec under `tests/`, mocking API calls with `page.route()`.
3. **Healer** runs failing tests and fixes locators in `src/pages/` until the suite is green.

See [AGENTS.md](./AGENTS.md) for the full rules these agents follow (locator priority, assertion rules, coding conventions).

### MCP servers

Two MCP servers are configured for editor/agent use (`.vscode/mcp.json`, `.agents/mcp_config.json`):

| Server | Command | Purpose |
|--------|---------|---------|
| `playwright-test` | `npx playwright run-test-mcp-server` | Test planning/generation/healing (Planner, Generator, Healer) |
| `playwright` | `npx @playwright/mcp@latest` | General browser automation (navigate, click, snapshot) for ad-hoc exploration |

Enable them in Cursor/VS Code under **Settings → MCP**.

## Conventions

- Import `test`/`expect` from `src/fixtures/base.ts`, never directly from `@playwright/test`.
- Locator priority: `getByRole` → `getByLabel` → `getByPlaceholder` → `getByTestId` → `getByText`. CSS/XPath is forbidden unless approved in a PR.
- Web-first assertions only — no `page.waitForTimeout` or `waitForSelector`.
- All client API calls are mocked in tests; never hit a real backend from a spec.

## Docs

- [AGENTS.md](./AGENTS.md) — full agent rules and conventions
