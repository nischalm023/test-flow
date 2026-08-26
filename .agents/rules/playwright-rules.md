---
description: Core Playwright TypeScript rules and Cursor agent workflow
alwaysApply: true
---

# Project Rules for AI Agents 
You are working in a Playwright TypeScript automation project.
Follow these rules for every code change.

## Cursor agents

This repo includes three Playwright agents. Use the one that matches the task:

| Agent | Skill | When to use |
|-------|-------|-------------|
| **Planner** | `.agents/skills/playwright-test-planner/` | Explore the app and write a numbered test plan to `specs/*.md` |
| **Generator** | `.agents/skills/playwright-test-generator/` | Turn a plan scenario into a runnable spec under `tests/` |
| **Healer** | `.agents/skills/playwright-test-healer/` | Debug and fix failing Playwright tests |

Agent definitions (with Playwright MCP tools) also live in `.github/agents/`.

### MCP server

The `playwright-test` MCP server is configured in:

- `.vscode/mcp.json` — Cursor / VS Code
- `.agents/mcp_config.json` — Cursor agents

It runs via `npx playwright run-test-mcp-server`. Enable it in Cursor under **Settings → MCP** before using Planner, Generator, or Healer browser tools.

### Agent workflow

1. **Planner** — reads `tests/seed.spec.ts`, explores the EventFlow client at `http://localhost:4000`, saves a plan to `specs/<feature>.md`
2. **Generator** — reads the plan scenario by number, creates page objects and specs, mocks API calls with `page.route()`, runs `npx playwright test <path>`
3. **Healer** — runs failing tests, fixes locators in `src/pages/`, re-runs until green

### EventFlow client (auth)

The app under test lives in `client/` (Next.js on port **4000**). Auth pages:

| Route | Page object | API endpoint (mock only) |
|-------|-------------|--------------------------|
| `/login` | `src/pages/LoginPage.ts` | `POST **/auth/login` |
| `/register` | `src/pages/RegisterPage.ts` | `POST **/auth/register` |

**API mocking is mandatory.** Never hit the real backend (`localhost:3000`). Use helpers from `src/utils/mock-auth-api.ts`. Test plan: `specs/auth-login-register.md`. Test data: `tests/data/auth.json`.

## Stack

- Playwright 1.56+ with TypeScript
- Node 20+
- Test runner: `@playwright/test`
- Reporter: HTML (Allure optional in CI)
- CI: GitHub Actions, sharded

## Folder structure

- `src/pages/` — Page Object classes (one file per page)
- `src/fixtures/` — Custom fixtures extending base test
- `src/utils/` — Pure helpers, no test logic
- `tests/` — Spec files, mirror app URL structure
- `tests/data/` — JSON/CSV test data
- `specs/` — Planner output (Markdown plans)
- `.agents/skills/` — Cursor agent skill definitions
- `.github/agents/` — Agent definitions with MCP tool bindings

## Coding conventions

- Import `test` and `expect` from `src/fixtures/base.ts`, never from `@playwright/test` directly
- Use `test.describe` per feature area
- One logical assertion group per test
- Use `test.step` for readability when a flow has more than 3 actions
- File names: kebab-case (`add-to-cart.spec.ts`)

## Locator priority (STRICT — do not deviate)

1. `getByRole` with accessible name
2. `getByLabel` for form fields
3. `getByPlaceholder` when no label exists
4. `getByTestId` (attribute is `data-test-id`)
5. `getByText` only for genuinely static UI copy
6. CSS / XPath — forbidden unless approved in PR

## Page Object contract

- One class per page, extends `BasePage`
- Constructor takes `page: Page` only
- All locators declared as `readonly` in constructor
- Action methods return `Promise<void>` OR the next page object
- No `expect()` calls inside page objects — assertions belong in tests
- No business logic in tests — put it in page objects or helpers

## Assertion rules

- Web-first assertions only (`expect(locator).toBeVisible()`)
- No `page.waitForTimeout` — ever
- No `waitForSelector` — use locator auto-waiting
- Custom timeouts only when justified in a code comment

## When adding a new test

- Mirror the app URL structure inside `tests/`
- Reuse existing page objects — do not create parallel infra
- Load test data from `tests/data/`, not inline
- Tag tests with `@smoke`, `@regression`, or `@critical` as appropriate

## Scanned / user repositories (Create Test)

- "Create Test" (`client/src/app/api/github/create-test/route.ts`) writes Playwright + MCP
  setup into a *user's* scanned GitHub repository via the GitHub API — never into this
  repository's own working tree.
- All writes target a new branch (`qa-studio/playwright-setup`) on the target repo, never
  its default branch. The route checks the branch doesn't already exist first and fails
  (409) rather than overwriting it.
- Do not modify this repo's own `playwright.config.ts`, `tests/`, `.agents/`, or `.vscode/`
  files as a side effect of a scan/create-test operation.

## Forbidden

- Do not skip or comment out failing tests to make CI green
- Do not use `page.evaluate` unless there is no MCP tool alternative
- Do not commit `.env`, credentials, `storage-state.json`, or auth tokens
- Do not modify `playwright.config.ts` without asking
- Do not add new npm dependencies without asking
- Do not use `page.pause()` in committed code

## When you (the agent) are unsure

- Ask a clarifying question before generating code
- Prefer a smaller, focused change over a big refactor
- If a required file does not exist, ask before creating it
