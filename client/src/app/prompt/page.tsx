'use client';

import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Database,
  FileCode,
  FolderTree,
  GitBranch,
  ListChecks,
  MessageSquareText,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { streamGithubScan } from '@/features/github-scan/stream';
import { PredefinedPrompt, PREDEFINED_PROMPTS, PromptsCard } from '@/components/PromptsCard';
import { BranchConflictDialog } from '@/components/BranchConflictDialog';
import { RunTestsInstructions } from '@/components/RunTestsInstructions';
import { prependTestCases, setActiveTestCaseId } from '@/lib/testCaseStore';
import type { TestCase } from '@/lib/types';

type StepKey = 'setup' | 'scan' | 'run' | 'generate';
type StepStatus = 'idle' | 'running' | 'done' | 'skipped' | 'error';

const STEP_LABELS: Record<StepKey, string> = {
  setup: 'Setup MCP & Branch',
  scan: 'Scan Repository',
  run: 'Start Local App',
  generate: 'Generate Test Cases',
};

const RUN_POLL_INTERVAL_MS = 1500;
const RUN_START_TIMEOUT_MS = 6 * 60 * 1000;
const RUN_TERMINAL_STATUSES = ['running', 'error', 'stopped'];

const STRUCTURE_MARK = '<<<STRUCTURE>>>';
const FLOW_MARK = '<<<FLOW>>>';

function splitScan(raw: string): { structure: string; flow: string } {
  const structureAt = raw.indexOf(STRUCTURE_MARK);
  const flowAt = raw.indexOf(FLOW_MARK);
  if (structureAt === -1 && flowAt === -1) return { structure: raw.trim(), flow: '' };

  const after = (mark: string, start: number, end: number) =>
    raw.slice(start + mark.length, end).trim();

  if (structureAt === -1) return { structure: '', flow: after(FLOW_MARK, flowAt, raw.length) };
  if (flowAt === -1) return { structure: after(STRUCTURE_MARK, structureAt, raw.length), flow: '' };

  if (structureAt < flowAt) {
    return {
      structure: after(STRUCTURE_MARK, structureAt, flowAt),
      flow: after(FLOW_MARK, flowAt, raw.length),
    };
  }
  return {
    flow: after(FLOW_MARK, flowAt, structureAt),
    structure: after(STRUCTURE_MARK, structureAt, raw.length),
  };
}

function PromptView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const repo = searchParams.get('repo')?.trim() || '';
  const branch = searchParams.get('branch')?.trim() || '';
  const [prompt, setPrompt] = useState(PREDEFINED_PROMPTS[0].prompt);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(PREDEFINED_PROMPTS[0].id);
  const [streamText, setStreamText] = useState('');
  const [structure, setStructure] = useState('');
  const [flow, setFlow] = useState('');
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'stream' | 'flow' | 'structure'>('stream');
  const [copiedSection, setCopiedSection] = useState<'stream' | 'flow' | 'structure' | 'prompt' | null>(null);
  const [steps, setSteps] = useState<Record<StepKey, StepStatus>>({
    setup: 'idle',
    scan: 'idle',
    run: 'idle',
    generate: 'idle',
  });
  const [generatedTestCases, setGeneratedTestCases] = useState<TestCase[]>([]);
  const [qdrantSave, setQdrantSave] = useState<{ saved: boolean; pointsCount?: number; error?: string } | null>(null);
  const [branchConflict, setBranchConflict] = useState<{ existingBranch: string } | null>(null);
  const [setupInfo, setSetupInfo] = useState<{ branch: string; compareUrl: string; scanId?: string } | null>(null);
  const [commitResult, setCommitResult] = useState<{
    filesWritten: string[];
    filesFailed: { path: string; error: string }[];
  } | null>(null);
  const [appUrl, setAppUrl] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [documentsMeta, setDocumentsMeta] = useState<{
    collection: string;
    pointsCount: number;
    status: string;
    error?: string;
  } | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [isGeneratingFromDocs, setIsGeneratingFromDocs] = useState(false);
  const [generatedSpec, setGeneratedSpec] = useState<{ filePath: string; code: string } | null>(null);

  const setStep = (key: StepKey, value: StepStatus) =>
    setSteps((prev) => ({ ...prev, [key]: value }));

  const abortRef = useRef<AbortController | null>(null);
  const streamAreaRef = useRef<HTMLTextAreaElement>(null);
  const pendingAnalysisRef = useRef<{ textToAnalyze: string; abort: AbortController } | null>(null);

  useEffect(() => {
    const el = streamAreaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streamText]);

  const handleSelectPreset = (preset: PredefinedPrompt) => {
    setSelectedPresetId(preset.id);
    setPrompt(preset.prompt);
  };

  const handleCopy = (text: string, section: 'stream' | 'flow' | 'structure' | 'prompt') => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const setupRepoBranch = async (mode?: 'reuse' | 'new') => {
    setStep('setup', 'running');
    try {
      const res = await fetch('/api/github/create-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, branch: branch || undefined, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStep('setup', 'done');
        setSetupInfo({ branch: data.branch, compareUrl: data.compareUrl, scanId: data.id });
        toast.success('Branch & Playwright MCP setup pushed', {
          description: data.branch,
        });
        return { ok: true as const, branch: data.branch as string, scanId: data.id as string | undefined };
      }
      if (res.status === 409 && data.conflict) {
        setBranchConflict({ existingBranch: data.existingBranch ?? data.branch ?? '' });
        return { ok: false as const, conflict: true as const };
      }
      setStep('setup', 'error');
      toast.error(data.error || 'Could not set up branch/MCP files');
      return { ok: false as const, conflict: false as const };
    } catch (err) {
      setStep('setup', 'error');
      toast.error(err instanceof Error ? err.message : 'Could not set up branch/MCP files');
      return { ok: false as const, conflict: false as const };
    }
  };

  const commitGeneratedTests = async (scanId: string | undefined, resolvedBranch: string | undefined, cases: TestCase[]) => {
    if (!scanId || !resolvedBranch || !repo.includes('/')) return;
    const [repoOwner, repoName] = repo.split('/');
    try {
      const res = await fetch('/api/github/commit-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId, owner: repoOwner, repo: repoName, branch: resolvedBranch, testCases: cases }),
      });
      const data = await res.json().catch(() => ({}));
      const filesWritten: string[] = Array.isArray(data.filesWritten) ? data.filesWritten : [];
      const filesFailed: { path: string; error: string }[] = Array.isArray(data.filesFailed) ? data.filesFailed : [];
      setCommitResult({ filesWritten, filesFailed });

      if (!res.ok) {
        toast.error(data.error || 'Could not commit generated tests to the repo');
        return;
      }
      if (filesFailed.length > 0) {
        toast.warning(`Pushed ${filesWritten.length} file(s), ${filesFailed.length} failed`);
      } else {
        toast.success(`Pushed ${filesWritten.length} file(s) to tests/ on the setup branch`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not commit generated tests to the repo');
    }
  };

  const generateTestCasesFromFlow = async (
    structureText: string,
    flowText: string,
    textToAnalyze: string,
    scanId: string | undefined,
    resolvedBranch: string | undefined,
    resolvedAppUrl: string,
  ) => {
    setStep('generate', 'running');
    setAppUrl(resolvedAppUrl);
    try {
      const res = await fetch('/api/github/generate-test-cases-from-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo,
          structure: structureText,
          flow: flowText,
          prompt: textToAnalyze,
          targetUrl: resolvedAppUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.testCases) && data.testCases.length > 0) {
        const cases = data.testCases as TestCase[];
        const qdrant = data.qdrant as { saved?: boolean; pointsCount?: number; error?: string } | undefined;
        prependTestCases(cases);
        setActiveTestCaseId(cases[0].id);
        setGeneratedTestCases(cases);
        setQdrantSave(
          qdrant?.saved
            ? { saved: true, pointsCount: qdrant.pointsCount }
            : { saved: false, error: qdrant?.error || 'Qdrant write failed' },
        );
        setStep('generate', 'done');
        if (qdrant?.saved) {
          toast.success(
            `${cases.length} test case${cases.length > 1 ? 's' : ''} generated and saved to Qdrant (${qdrant.pointsCount ?? cases.length} points)`,
          );
        } else {
          toast.success(`${cases.length} test case${cases.length > 1 ? 's' : ''} generated`);
          toast.warning(qdrant?.error || 'Could not save test cases to Qdrant');
        }
        await commitGeneratedTests(scanId, resolvedBranch, cases);
      } else {
        setStep('generate', 'error');
        toast.error(data.error || 'Could not generate test cases from the extracted flow');
      }
    } catch (err) {
      setStep('generate', 'error');
      toast.error(err instanceof Error ? err.message : 'Could not generate test cases from the extracted flow');
    }
  };

  const regenerateWithManualUrl = async () => {
    const trimmed = appUrl.trim();
    if (!trimmed || !setupInfo) return;
    setIsRegenerating(true);
    try {
      await generateTestCasesFromFlow(structure, flow, prompt, setupInfo.scanId, setupInfo.branch, trimmed);
    } finally {
      setIsRegenerating(false);
    }
  };

  const startLocalRunAndWait = async (runBranch: string, signal: AbortSignal): Promise<string> => {
    setStep('run', 'running');
    try {
      const res = await fetch('/api/github/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, branch: runBranch }),
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStep('run', 'error');
        toast.warning(data.error || 'Could not start the app locally — set the target URL manually before running tests.');
        return '';
      }

      let currentStatus: string = data.status;
      let appUrl = typeof data.url === 'string' ? data.url : '';
      const deadline = Date.now() + RUN_START_TIMEOUT_MS;
      while (!RUN_TERMINAL_STATUSES.includes(currentStatus) && Date.now() < deadline) {
        if (signal.aborted) return '';
        await new Promise((resolve) => setTimeout(resolve, RUN_POLL_INTERVAL_MS));
        const pollRes = await fetch('/api/github/run', { signal });
        const pollData = await pollRes.json().catch(() => ({}));
        currentStatus = pollData.status;
        if (typeof pollData.url === 'string' && pollData.url) appUrl = pollData.url;
      }

      if (currentStatus === 'running') {
        setStep('run', 'done');
        return appUrl;
      }
      setStep('run', 'error');
      toast.warning('Local app did not finish starting in time — set the target URL manually before running tests.');
      return appUrl;
    } catch (err) {
      if (signal.aborted) return '';
      setStep('run', 'error');
      toast.warning(err instanceof Error ? err.message : 'Could not start the app locally.');
      return '';
    }
  };

  const runScanAndGenerate = async (
    textToAnalyze: string,
    abort: AbortController,
    scanId: string | undefined,
    resolvedBranch: string | undefined,
  ) => {
    setStep('scan', 'running');
    const runPromise = resolvedBranch ? startLocalRunAndWait(resolvedBranch, abort.signal) : Promise.resolve('');
    try {
      const text = await streamGithubScan(
        { repo, branch, prompt: textToAnalyze, mode: 'structure-flow' },
        (next) => {
          setStreamText(next);
          const split = splitScan(next);
          setStructure(split.structure);
          setFlow(split.flow);
        },
        abort.signal,
      );
      setStreamText(text);
      const split = splitScan(text);
      const finalStructure = !split.structure && !split.flow && text.trim() ? text.trim() : split.structure;
      const finalFlow = !split.structure && !split.flow ? '' : split.flow;
      setStructure(finalStructure);
      setFlow(finalFlow);
      setStatus('done');
      setStep('scan', 'done');
      if (finalFlow) {
        setActiveTab('flow');
      }

      const resolvedAppUrl = await runPromise;
      await generateTestCasesFromFlow(finalStructure, finalFlow, textToAnalyze, scanId, resolvedBranch, resolvedAppUrl);
    } catch (err) {
      if (abort.signal.aborted) return;
      setStatus('error');
      setStep('scan', 'error');
      setError(err instanceof Error ? err.message : 'Scan failed');
    }
  };

  const runAnalysis = async (customPrompt?: string) => {
    const textToAnalyze = (customPrompt ?? prompt).trim();
    if (!repo.includes('/') || !textToAnalyze) return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setStreamText('');
    setStructure('');
    setFlow('');
    setError('');
    setStatus('streaming');
    setActiveTab('stream');
    setGeneratedTestCases([]);
    setQdrantSave(null);
    setSteps({ setup: 'idle', scan: 'idle', run: 'idle', generate: 'idle' });
    setSetupInfo(null);
    setCommitResult(null);

    const setupResult = await setupRepoBranch();
    if (!setupResult.ok) {
      if (setupResult.conflict) {
        pendingAnalysisRef.current = { textToAnalyze, abort };
        return;
      }
      setStatus('error');
      return;
    }

    await runScanAndGenerate(textToAnalyze, abort, setupResult.scanId, setupResult.branch);
  };

  const resolveBranchConflict = async (mode: 'reuse' | 'new') => {
    setBranchConflict(null);
    const pending = pendingAnalysisRef.current;
    pendingAnalysisRef.current = null;

    const setupResult = await setupRepoBranch(mode);
    if (!setupResult.ok) {
      setStatus('error');
      return;
    }
    if (pending) {
      await runScanAndGenerate(pending.textToAnalyze, pending.abort, setupResult.scanId, setupResult.branch);
    }
  };

  const cancelBranchConflict = () => {
    setBranchConflict(null);
    pendingAnalysisRef.current = null;
    setStep('setup', 'skipped');
    setStatus('idle');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runAnalysis();
  };

  const handleCancelScan = () => {
    abortRef.current?.abort();
    setStatus('idle');
  };

  const loadDocumentsCollection = async () => {
    if (!repo.includes('/')) {
      setDocuments([]);
      setDocumentsMeta(null);
      return;
    }
    setDocumentsLoading(true);
    try {
      const res = await fetch(`/api/qdrant/documents?repo=${encodeURIComponent(repo)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setDocuments([]);
        setDocumentsMeta({
          collection: data.collection || 'documents',
          pointsCount: 0,
          status: 'error',
          error: data.error || 'Could not load documents collection',
        });
        return;
      }
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
      setDocumentsMeta({
        collection: data.collection || 'documents',
        pointsCount: data.pointsCount ?? 0,
        status: data.status || 'unknown',
      });
    } catch (err) {
      setDocuments([]);
      setDocumentsMeta({
        collection: 'documents',
        pointsCount: 0,
        status: 'error',
        error: err instanceof Error ? err.message : 'Could not load documents collection',
      });
    } finally {
      setDocumentsLoading(false);
    }
  };

  const generateFromDocuments = async () => {
    if (!repo.includes('/')) return;
    setIsGeneratingFromDocs(true);
    try {
      const res = await fetch('/api/github/generate-playwright-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo,
          prompt: prompt.trim() || undefined,
          targetUrl: appUrl.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.testCase) {
        toast.error(data.error || 'Could not generate a Playwright test from the documents collection');
        return;
      }
      const testCase = data.testCase as TestCase;
      prependTestCases([testCase]);
      setActiveTestCaseId(testCase.id);
      setGeneratedTestCases((prev) => [testCase, ...prev]);
      if (typeof data.playwrightTestCode === 'string' && data.playwrightTestCode) {
        setGeneratedSpec({
          filePath: typeof data.filePath === 'string' ? data.filePath : 'tests/generated.spec.ts',
          code: data.playwrightTestCode,
        });
      }
      if (Array.isArray(data.documents)) {
        setDocuments(data.documents);
        setDocumentsMeta((prev) => ({
          collection: data.collection || prev?.collection || 'documents',
          pointsCount: data.documents.length,
          status: prev?.status || 'green',
        }));
      }
      toast.success(`Generated Playwright test: ${testCase.title}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate a Playwright test');
    } finally {
      setIsGeneratingFromDocs(false);
    }
  };

  const indexedRepoRef = useRef<string | null>(null);

  useEffect(() => {
    void loadDocumentsCollection();
  }, [repo]);

  // Background indexing of repo README into Kafka -> VoyageAI -> Qdrant vector store
  useEffect(() => {
    if (!repo || !repo.includes('/') || indexedRepoRef.current === `${repo}:${branch}`) {
      return;
    }
    indexedRepoRef.current = `${repo}:${branch}`;

    fetch('/api/github/index-readme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, branch: branch || undefined }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          console.log(`[Prompt Page] 📚 Indexed ${data.totalChunks} README chunks to Kafka topic "${data.topic}"`);
          window.setTimeout(() => {
            void loadDocumentsCollection();
          }, 2500);
        }
      })
      .catch((err) => {
        console.warn('[Prompt Page] Background README indexing error:', err);
      });
  }, [repo, branch]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-16">
      <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center justify-between px-4 lg:px-8 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <Link href="/repos">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Repositories
            </Link>
          </Button>
          <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              AI Test Planner & Architecture Scan
            </p>
            <h1 className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{repo || 'No repository selected'}</span>
              {branch && (
                <span className="text-[11px] font-mono font-normal text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                  {branch}
                </span>
              )}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {status !== 'idle' && (
            <div className="hidden md:flex items-center gap-1.5">
              {(Object.keys(STEP_LABELS) as StepKey[]).map((key, idx) => {
                const stepStatus = steps[key];
                return (
                  <div key={key} className="flex items-center gap-1.5">
                    {idx > 0 && <span className="w-3 h-px bg-slate-200" />}
                    <span
                      className={`text-[11px] font-mono font-semibold px-2 py-1 rounded-full border flex items-center gap-1 ${
                        stepStatus === 'running'
                          ? 'bg-amber-50 border-amber-300 text-amber-700'
                          : stepStatus === 'done'
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : stepStatus === 'skipped'
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : stepStatus === 'error'
                                ? 'bg-rose-50 border-rose-300 text-rose-700'
                                : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}
                    >
                      {stepStatus === 'running' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      )}
                      {stepStatus === 'done' && <Check className="w-3 h-3" />}
                      {STEP_LABELS[key]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <span
            className={`text-xs font-mono font-semibold px-3 py-1 rounded-full border flex items-center gap-1.5 ${status === 'streaming'
              ? 'bg-amber-50 border-amber-300 text-amber-700'
              : status === 'done'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : status === 'error'
                  ? 'bg-rose-50 border-rose-300 text-rose-700'
                  : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}
          >
            {status === 'streaming' && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
            {status === 'done' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
            {status === 'streaming'
              ? 'Analyzing Repository…'
              : status === 'done'
                ? 'Analysis Ready'
                : status === 'error'
                  ? 'Analysis Error'
                  : 'Ready'}
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 lg:p-8 space-y-8">
        {!repo.includes('/') && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm flex items-center justify-between">
            <div>
              <p className="font-semibold">No repository specified</p>
              <p className="text-amber-700 text-xs mt-0.5">
                Please select a repository from the Repositories page to run analysis against your code.
              </p>
            </div>
            <Button size="sm" variant="outline" asChild className="bg-white">
              <Link href="/repos">Go to Repositories</Link>
            </Button>
          </div>
        )}

        <PromptsCard
          repo={repo}
          selectedPresetId={selectedPresetId}
          onSelectPreset={handleSelectPreset}
        />

        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <Database className="w-4 h-4 text-slate-700" />
                  Documents collection
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  {documentsMeta
                    ? `${documentsMeta.collection} · ${documents.length} loaded${
                        documentsMeta.pointsCount !== documents.length
                          ? ` / ${documentsMeta.pointsCount} in Qdrant`
                          : ''
                      } · status ${documentsMeta.status}`
                    : 'Indexed README and code chunks from Qdrant'}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!repo.includes('/') || documentsLoading}
                onClick={() => void loadDocumentsCollection()}
                className="text-xs h-8"
              >
                {documentsLoading ? 'Loading…' : 'Refresh'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {documentsMeta?.error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                {documentsMeta.error}
              </div>
            )}
            {documentsLoading && documents.length === 0 ? (
              <p className="text-xs text-slate-400">Loading documents collection…</p>
            ) : documents.length === 0 ? (
              <p className="text-xs text-slate-400">
                No points in the documents collection yet. Index a README, then refresh.
              </p>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {documents.map((doc, index) => (
                  <div
                    key={String(doc.id ?? index)}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2"
                  >
                    <p className="font-semibold text-slate-800">
                      #{index + 1}
                      {doc.title ? ` · ${String(doc.title)}` : ''}
                    </p>
                    <dl className="grid grid-cols-1 gap-1.5">
                      {Object.entries(doc).map(([key, value]) => (
                        <div key={key} className="grid grid-cols-[140px_1fr] gap-2">
                          <dt className="font-mono text-[10px] uppercase tracking-wide text-slate-400 pt-0.5">
                            {key}
                          </dt>
                          <dd className="font-mono text-[11px] text-slate-700 whitespace-pre-wrap break-words">
                            {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            )}
            {generatedSpec && (
              <div className="pt-2 space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Generated spec · <span className="font-mono">{generatedSpec.filePath}</span>
                </p>
                <pre className="p-3 bg-slate-950 text-emerald-300 rounded-xl text-[11px] overflow-x-auto whitespace-pre leading-relaxed max-h-[320px]">
                  {generatedSpec.code}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <MessageSquareText className="w-4 h-4 text-slate-700" />
                  Describe
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Describe what you want tested. TestFlow AI will scan your repository structure and generate step-by-step user flows.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {prompt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(prompt, 'prompt')}
                    className="text-xs text-slate-500 h-8"
                  >
                    {copiedSection === 'prompt' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 mr-1" />
                    )}
                    {copiedSection === 'prompt' ? 'Copied' : 'Copy'}
                  </Button>
                )}
                {prompt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPrompt('');
                      setSelectedPresetId(null);
                    }}
                    className="text-xs text-slate-500 h-8"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  id="project-prompt"
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    setSelectedPresetId(null);
                  }}
                  placeholder="e.g. Generate tests for user signup, login with valid/invalid credentials, password reset, and cart checkout..."
                  className="min-h-[140px] font-sans text-sm field-sizing-fixed resize-y focus-visible:ring-indigo-500"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-slate-400">
                  Target repo: <span className="font-mono text-slate-600 font-semibold">{repo || 'None'}</span>
                </p>

                <div className="flex items-center gap-2">
                  {status === 'streaming' ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancelScan}
                      className="border-red-200 text-red-600 hover:bg-red-50 text-xs"
                    >
                      Cancel Scan
                    </Button>
                  ) : null}

                  <Button
                    type="button"
                    variant="outline"
                    disabled={!repo.includes('/') || isGeneratingFromDocs || status === 'streaming'}
                    onClick={() => void generateFromDocuments()}
                    className="text-xs font-semibold"
                  >
                    {isGeneratingFromDocs ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mr-2" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <FileCode className="w-3.5 h-3.5 mr-1.5" />
                        Generate Playwright Test
                      </>
                    )}
                  </Button>
                  <Button
                    type="submit"
                    disabled={!prompt.trim() || !repo.includes('/') || status === 'streaming'}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs font-semibold text-xs px-5"
                  >
                    {status === 'streaming' ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                        Scanning Repository…
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                        Analyze Repository
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Scan Results: Live Stream, Structure & Flow */}
        {(streamText || structure || flow || status === 'streaming') && (
          <Card className="border-slate-200 shadow-sm overflow-hidden animate-fadeIn">
            <CardHeader className="bg-slate-50 border-b border-slate-200 py-3.5 px-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-100 rounded-md text-indigo-600">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-900">
                      Live Repository Scan & Extracted Flows
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Real-time stream, architecture hierarchy, and generated QA scenarios
                    </CardDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-white p-1 rounded-lg border border-slate-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setActiveTab('stream')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${activeTab === 'stream'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${status === 'streaming' ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`} />
                      Live Stream {status === 'streaming' ? '(Active)' : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('flow')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${activeTab === 'flow'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      <ListChecks className="w-3.5 h-3.5" />
                      User Flows ({flow ? 'Ready' : '...'})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('structure')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${activeTab === 'structure'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      <FolderTree className="w-3.5 h-3.5" />
                      App Structure ({structure ? 'Ready' : '...'})
                    </button>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const textToCopy =
                        activeTab === 'stream'
                          ? streamText
                          : activeTab === 'flow'
                            ? flow
                            : structure;
                      handleCopy(textToCopy, activeTab);
                    }}
                    className="text-xs h-8"
                  >
                    {copiedSection === activeTab ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 mr-1" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1" /> Copy {activeTab === 'stream' ? 'Stream' : activeTab === 'flow' ? 'Flow' : 'Tree'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {activeTab === 'stream' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      {status === 'streaming' ? 'Streaming live from GitHub scan…' : 'Scan Output Terminal'}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {streamText.length} characters received
                    </span>
                  </div>

                  <Textarea
                    ref={streamAreaRef}
                    readOnly
                    value={streamText}
                    placeholder="Scan output will stream here in real-time as the AI agent inspects your repository…"
                    className="min-h-[420px] font-mono text-xs bg-slate-950 text-emerald-400 border-slate-800 field-sizing-fixed resize-y leading-relaxed p-4 selection:bg-emerald-900 rounded-xl shadow-inner"
                  />
                </div>
              )}

              {activeTab === 'flow' && (
                <div className="space-y-4">
                  {flow ? (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <pre className="font-sans text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {flow}
                      </pre>
                    </div>
                  ) : status === 'streaming' ? (
                    <div className="p-8 text-center space-y-3">
                      <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                      <p className="text-xs text-slate-500 font-medium">
                        Extracting product user flows from repository scan stream...
                      </p>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No flow extracted yet. Click Analyze Repository above.
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'structure' && (
                <div className="space-y-4">
                  {structure ? (
                    <div className="p-4 bg-slate-950 text-slate-100 rounded-xl font-mono text-xs overflow-x-auto border border-slate-800">
                      <pre className="whitespace-pre leading-relaxed">{structure}</pre>
                    </div>
                  ) : status === 'streaming' ? (
                    <div className="p-8 text-center space-y-3">
                      <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                      <p className="text-xs text-slate-500 font-medium">
                        Mapping folder architecture and page routes...
                      </p>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No structure extracted yet. Click Analyze Repository above.
                    </div>
                  )}
                </div>
              )}

              {status === 'done' && (
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {generatedTestCases.length > 0
                      ? `${generatedTestCases.length} test case${generatedTestCases.length > 1 ? 's' : ''} generated from these flows.`
                      : 'Ready to build Playwright tests with these flows.'}
                    {qdrantSave?.saved && (
                      <span className="ml-2 inline-flex items-center gap-1 text-emerald-700">
                        <Check className="w-3 h-3" />
                        Saved in Qdrant ({qdrantSave.pointsCount ?? generatedTestCases.length} points)
                      </span>
                    )}
                    {qdrantSave && !qdrantSave.saved && (
                      <span className="ml-2 text-rose-600">Qdrant save failed</span>
                    )}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      const params = new URLSearchParams();
                      if (generatedTestCases.length > 0) params.set('id', generatedTestCases[0].id);
                      if (repo) params.set('repo', repo);
                      const resolvedBranch = setupInfo?.branch || branch;
                      if (resolvedBranch) params.set('branch', resolvedBranch);
                      if (setupInfo?.scanId) params.set('scanId', setupInfo.scanId);
                      router.push(`/testcasebuilder?${params.toString()}`);
                    }}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs gap-1.5"
                  >
                    Proceed to Test Builder
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}

              {setupInfo && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-600 flex items-center gap-1.5">
                      <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                      {setupInfo.branch}
                    </span>
                    {setupInfo.compareUrl && (
                      <a
                        href={setupInfo.compareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        View branch on GitHub →
                      </a>
                    )}
                  </div>

                  {steps.run === 'error' && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                      <p className="text-xs text-amber-800">
                        The local app couldn&apos;t be auto-started, so generated steps have no target URL. If you&apos;re
                        running the app yourself (e.g. <span className="font-mono">http://localhost:4000</span>), enter
                        it below and regenerate.
                      </p>
                      <div className="flex items-center gap-2">
                        <Input
                          value={appUrl}
                          onChange={(event) => setAppUrl(event.target.value)}
                          placeholder="http://localhost:4000"
                          className="h-8 text-xs font-mono"
                        />
                        <Button
                          size="sm"
                          disabled={!appUrl.trim() || isRegenerating}
                          onClick={() => void regenerateWithManualUrl()}
                          className="text-xs shrink-0"
                        >
                          {isRegenerating ? 'Regenerating…' : 'Regenerate'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {commitResult && (
                    <div className="text-xs space-y-1">
                      <p className="text-emerald-700 font-medium">
                        Pushed {commitResult.filesWritten.length} file{commitResult.filesWritten.length === 1 ? '' : 's'} to tests/
                      </p>
                      {commitResult.filesFailed.length > 0 && (
                        <div className="text-rose-600">
                          {commitResult.filesFailed.map((f) => (
                            <p key={f.path} className="font-mono">
                              ✕ {f.path}: {f.error}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {repo.includes('/') && (
                    <RunTestsInstructions
                      owner={repo.split('/')[0]}
                      repo={repo.split('/')[1]}
                      branch={setupInfo.branch}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
      <BranchConflictDialog
        open={branchConflict !== null}
        existingBranch={branchConflict?.existingBranch ?? ''}
        onReuse={() => void resolveBranchConflict('reuse')}
        onCreateNew={() => void resolveBranchConflict('new')}
        onCancel={cancelBranchConflict}
      />
    </div>
  );
}

export default function PromptPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-sm text-slate-500 font-medium">
          Loading prompt studio…
        </div>
      }
    >
      <PromptView />
    </Suspense>
  );
}
