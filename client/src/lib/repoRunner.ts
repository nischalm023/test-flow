import { spawn, ChildProcess } from "child_process";
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "fs";
import net from "net";
import os from "os";
import path from "path";

export type RunStatus = "idle" | "cloning" | "installing" | "starting" | "running" | "error" | "stopped";

export interface RunState {
  key: string | null;
  owner: string | null;
  repo: string | null;
  branch: string | null;
  status: RunStatus;
  port: number | null;
  url: string | null;
  error: string | null;
  logs: string[];
  startedAt: number | null;
}

export type TestRunStatus = "idle" | "writing" | "installing-playwright" | "running" | "passed" | "failed" | "error";

export interface TestRunState {
  status: TestRunStatus;
  logs: string[];
  summary: { total: number; passed: number; failed: number } | null;
  error: string | null;
}

const SAFE_SEGMENT = /^[\w.-]+$/;
const SAFE_BRANCH_SEGMENT = /^[\w.-]+$/;
const MAX_LOG_LINES = 500;
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const HEALTH_CHECK_TIMEOUT_MS = 60 * 1000;

interface RunnerSingleton {
  state: RunState;
  child: ChildProcess | null;
  generation: number;
  workDir: string | null;
  testState: TestRunState;
  testChild: ChildProcess | null;
  testGeneration: number;
}

function getSingleton(): RunnerSingleton {
  const g = globalThis as unknown as { __qaStudioRunner?: RunnerSingleton };
  if (!g.__qaStudioRunner) {
    g.__qaStudioRunner = {
      state: emptyState(),
      child: null,
      generation: 0,
      workDir: null,
      testState: emptyTestState(),
      testChild: null,
      testGeneration: 0,
    };
    process.on("exit", () => {
      killChild(g.__qaStudioRunner!.child);
      killChild(g.__qaStudioRunner!.testChild);
    });
  }
  return g.__qaStudioRunner;
}

function emptyState(): RunState {
  return {
    key: null,
    owner: null,
    repo: null,
    branch: null,
    status: "idle",
    port: null,
    url: null,
    error: null,
    logs: [],
    startedAt: null,
  };
}

function emptyTestState(): TestRunState {
  return { status: "idle", logs: [], summary: null, error: null };
}

function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(`Invalid ${label}: "${value}" — only letters, numbers, dots, dashes, underscores allowed`);
  }
}

function assertSafeBranch(value: string): void {
  const segments = value.split("/");
  const ok = segments.every((s) => s !== "" && s !== "." && s !== ".." && SAFE_BRANCH_SEGMENT.test(s));
  if (!ok) {
    throw new Error(
      `Invalid branch: "${value}" — only letters, numbers, dots, dashes, underscores, and / separators allowed`,
    );
  }
}

function killChild(child: ChildProcess | null): void {
  if (!child || child.killed || child.exitCode !== null) return;
  try {
    if (child.pid) process.kill(-child.pid, "SIGTERM");
  } catch {
    // process group may already be gone
  }
  setTimeout(() => {
    try {
      if (child.pid && child.exitCode === null) process.kill(-child.pid, "SIGKILL");
    } catch {
      // already dead
    }
  }, 5000);
}

function appendLog(state: { logs: string[] }, line: string): void {
  for (const l of line.split("\n")) {
    if (!l) continue;
    state.logs.push(l);
  }
  if (state.logs.length > MAX_LOG_LINES) {
    state.logs.splice(0, state.logs.length - MAX_LOG_LINES);
  }
}

function detectPackageManager(workDir: string): "pnpm" | "yarn" | "npm" {
  if (existsSync(path.join(workDir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(workDir, "yarn.lock"))) return "yarn";
  return "npm";
}

function addDevDependencyArgs(pm: "pnpm" | "yarn" | "npm"): string[] {
  if (pm === "npm") return ["install", "-D", "@playwright/test"];
  return ["add", "-D", "@playwright/test"];
}

function startScriptInDir(dir: string): { dir: string; script: "dev" | "start" } | null {
  const pkgPath = path.join(dir, "package.json");
  if (!existsSync(pkgPath)) return null;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.scripts?.dev) return { dir, script: "dev" };
  if (pkg.scripts?.start) return { dir, script: "start" };
  return null;
}

/** Prefer the web app package (client/web/frontend) over a root package that is tests-only. */
function findStartCommand(workDir: string): { dir: string; script: "dev" | "start" } | null {
  const preferred = ["client", "web", "frontend", "app", path.join("apps", "web"), path.join("apps", "client")];
  for (const rel of preferred) {
    const found = startScriptInDir(path.join(workDir, rel));
    if (found) return found;
  }
  const root = startScriptInDir(workDir);
  if (root) return root;
  const entries = readdirSync(workDir, { withFileTypes: true }).filter(
    (e) => e.isDirectory() && e.name !== "node_modules" && !e.name.startsWith("."),
  );
  for (const entry of entries) {
    const found = startScriptInDir(path.join(workDir, entry.name));
    if (found) return found;
  }
  return null;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

interface RunStepOptions {
  target?: "app" | "test";
  extraEnv?: Record<string, string>;
  timeoutMs?: number;
  allowNonZeroExit?: boolean;
}

function runStep(
  singleton: RunnerSingleton,
  generation: number,
  cmd: string,
  args: string[],
  cwd: string,
  opts: RunStepOptions = {},
): Promise<void> {
  const { target = "app", extraEnv, timeoutMs, allowNonZeroExit } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      detached: true,
    });
    if (target === "app") singleton.child = child;
    else singleton.testChild = child;

    const logTarget = target === "app" ? singleton.state : singleton.testState;
    const currentGeneration = () => (target === "app" ? singleton.generation : singleton.testGeneration);

    let timedOut = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          killChild(child);
        }, timeoutMs)
      : null;

    child.stdout?.on("data", (chunk) => {
      if (generation !== currentGeneration()) return;
      appendLog(logTarget, redact(chunk.toString()));
    });
    child.stderr?.on("data", (chunk) => {
      if (generation !== currentGeneration()) return;
      appendLog(logTarget, redact(chunk.toString()));
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${cmd} ${args.join(" ")} timed out`));
      } else if (code !== 0 && !allowNonZeroExit) {
        reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

function redact(text: string): string {
  return text.replace(/x-access-token:[^@]+@/g, "x-access-token:***@");
}

interface PortRef {
  current: number;
}

/** Many dev servers ignore the PORT env var and announce their real bound port
 * in their startup banner instead (e.g. "- Local: http://localhost:4000"). */
function detectPortFromLog(text: string): number | null {
  const urlMatch = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::(\d{2,5}))?/i);
  if (urlMatch?.[1]) return Number(urlMatch[1]);
  const portMatch = text.match(/\b(?:port|listening on|running on)\D{0,12}(\d{2,5})\b/i);
  if (portMatch) return Number(portMatch[1]);
  return null;
}

async function waitForHealthy(portRef: PortRef, generation: number, singleton: RunnerSingleton): Promise<boolean> {
  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (generation !== singleton.generation) return false;
    const port = portRef.current;
    const ok = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ port, host: "127.0.0.1" }, () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
      socket.setTimeout(1500, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

export interface StartRunParams {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export async function startRun(params: StartRunParams): Promise<RunState> {
  const { owner, repo, branch, token } = params;
  assertSafeSegment(owner, "owner");
  assertSafeSegment(repo, "repo");
  assertSafeBranch(branch);

  const singleton = getSingleton();
  killChild(singleton.child);
  singleton.generation += 1;
  const generation = singleton.generation;

  killChild(singleton.testChild);
  singleton.testGeneration += 1;
  singleton.testState = emptyTestState();

  const key = `${owner}__${repo}__${branch.replace(/\//g, "-")}`;
  const workDir = path.join(os.tmpdir(), "qa-studio-runs", key);
  singleton.workDir = workDir;

  singleton.state = {
    ...emptyState(),
    key,
    owner,
    repo,
    branch,
    status: "cloning",
    startedAt: Date.now(),
  };
  const state = singleton.state;

  (async () => {
    try {
      const baseDir = path.dirname(workDir);
      mkdirSync(baseDir, { recursive: true });
      const cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;

      if (!existsSync(path.join(workDir, ".git"))) {
        appendLog(state, `Cloning ${owner}/${repo}@${branch}...`);
        await runStep(singleton, generation, "git", ["clone", "--branch", branch, "--depth", "1", cloneUrl, workDir], baseDir);
      } else {
        appendLog(state, `Updating existing checkout of ${owner}/${repo}@${branch}...`);
        await runStep(singleton, generation, "git", ["fetch", "origin", branch], workDir);
        await runStep(singleton, generation, "git", ["checkout", branch], workDir);
        await runStep(singleton, generation, "git", ["reset", "--hard", `origin/${branch}`], workDir);
      }
      if (generation !== singleton.generation) return;

      state.status = "installing";
      const pm = detectPackageManager(workDir);
      appendLog(state, `Installing dependencies with ${pm}...`);
      await runStep(singleton, generation, pm, ["install"], workDir, { timeoutMs: INSTALL_TIMEOUT_MS });
      if (generation !== singleton.generation) return;

      state.status = "starting";
      const startCmd = findStartCommand(workDir);
      if (!startCmd) {
        throw new Error("Could not find a \"dev\" or \"start\" script in package.json (checked root and one level of subdirectories)");
      }
      const requestedPort = await getFreePort();
      const portRef: PortRef = { current: requestedPort };
      const pm2 = detectPackageManager(startCmd.dir);
      appendLog(state, `Starting "${pm2} run ${startCmd.script}" (requesting port ${requestedPort}) in ${path.relative(workDir, startCmd.dir) || "."}...`);

      const child = spawn(pm2, ["run", startCmd.script], {
        cwd: startCmd.dir,
        env: { ...process.env, PORT: String(requestedPort) },
        detached: true,
      });
      singleton.child = child;
      const onOutput = (chunk: Buffer) => {
        if (generation !== singleton.generation) return;
        const text = chunk.toString();
        const detected = detectPortFromLog(text);
        if (detected && detected !== portRef.current) {
          portRef.current = detected;
          appendLog(state, `Detected dev server actually listening on port ${detected}.`);
        }
        appendLog(state, redact(text));
      };
      child.stdout?.on("data", onOutput);
      child.stderr?.on("data", onOutput);
      child.on("exit", (code) => {
        if (generation !== singleton.generation) return;
        if (state.status !== "stopped") {
          state.status = "error";
          state.error = `Dev server exited early with code ${code}`;
        }
      });

      const healthy = await waitForHealthy(portRef, generation, singleton);
      if (generation !== singleton.generation) return;
      if (!healthy) {
        throw new Error(`Dev server did not respond on port ${portRef.current} within ${HEALTH_CHECK_TIMEOUT_MS / 1000}s`);
      }

      state.port = portRef.current;
      state.url = `http://localhost:${portRef.current}`;
      state.status = "running";
      appendLog(state, `Ready at ${state.url}`);
    } catch (err) {
      if (generation !== singleton.generation) return;
      state.status = "error";
      state.error = err instanceof Error ? err.message : "Run failed";
      appendLog(state, `Error: ${state.error}`);
    }
  })();

  return { ...state };
}

export function getRunStatus(): RunState {
  const { state } = getSingleton();
  return { ...state };
}

export function stopRun(): RunState {
  const singleton = getSingleton();
  singleton.generation += 1;
  killChild(singleton.child);
  singleton.child = null;
  singleton.state.status = "stopped";
  singleton.state.url = null;
  appendLog(singleton.state, "Stopped by user.");
  return { ...singleton.state };
}

export interface RunnerFile {
  path: string;
  content: string;
}

export function writeFiles(files: RunnerFile[]): void {
  const { workDir } = getSingleton();
  if (!workDir) {
    throw new Error("No active project workspace — start the project first.");
  }
  for (const file of files) {
    const dest = path.join(workDir, file.path);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, file.content, "utf8");
  }
}

export async function runTests(files: RunnerFile[]): Promise<TestRunState> {
  const singleton = getSingleton();
  if (singleton.state.status !== "running" || !singleton.workDir) {
    throw new Error("Start the project first (Install & Run Project) before running tests.");
  }
  const workDir = singleton.workDir;
  const baseUrl = singleton.state.url;

  killChild(singleton.testChild);
  singleton.testGeneration += 1;
  const generation = singleton.testGeneration;
  singleton.testState = emptyTestState();
  const testState = singleton.testState;
  testState.status = "writing";

  (async () => {
    try {
      writeFiles(files);
      appendLog(testState, `Wrote ${files.length} files.`);
      if (generation !== singleton.testGeneration) return;

      testState.status = "installing-playwright";
      const pm = detectPackageManager(workDir);
      appendLog(testState, `Adding @playwright/test as a dev dependency via ${pm}...`);
      await runStep(singleton, generation, pm, addDevDependencyArgs(pm), workDir, {
        target: "test",
        timeoutMs: INSTALL_TIMEOUT_MS,
      });
      if (generation !== singleton.testGeneration) return;

      appendLog(testState, "Installing the chromium browser (first run on this machine may take a while)...");
      await runStep(singleton, generation, "npx", ["playwright", "install", "chromium"], workDir, {
        target: "test",
        timeoutMs: INSTALL_TIMEOUT_MS,
      });
      if (generation !== singleton.testGeneration) return;

      testState.status = "running";
      const resultsPath = path.join(workDir, ".qa-studio-results.json");
      appendLog(testState, `Running npx playwright test against ${baseUrl}...`);
      await runStep(singleton, generation, "npx", ["playwright", "test", "--reporter=line,json"], workDir, {
        target: "test",
        extraEnv: { PLAYWRIGHT_JSON_OUTPUT_NAME: resultsPath },
        allowNonZeroExit: true,
      });
      if (generation !== singleton.testGeneration) return;

      if (!existsSync(resultsPath)) {
        throw new Error("Playwright did not produce a results file — the run likely errored before any test executed.");
      }
      const report = JSON.parse(readFileSync(resultsPath, "utf8"));
      const stats = report.stats || {};
      const passed = (stats.expected || 0) + (stats.flaky || 0);
      const failed = stats.unexpected || 0;
      const total = passed + failed + (stats.skipped || 0);
      testState.summary = { total, passed, failed };
      testState.status = failed > 0 ? "failed" : "passed";
      appendLog(testState, `Done: ${passed}/${total} passed.`);
    } catch (err) {
      if (generation !== singleton.testGeneration) return;
      testState.status = "error";
      testState.error = err instanceof Error ? err.message : "Test run failed";
      appendLog(testState, `Error: ${testState.error}`);
    }
  })();

  return { ...testState };
}

export function getTestRunStatus(): TestRunState {
  return { ...getSingleton().testState };
}
