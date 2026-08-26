'use client';

import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  FolderTree,
  GitBranch,
  ListChecks,
  MessageSquareText,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { streamGithubScan } from '@/features/github-scan/stream';
import { PredefinedPrompt, PREDEFINED_PROMPTS, PromptsCard } from '@/components/PromptsCard';

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

  const abortRef = useRef<AbortController | null>(null);
  const streamAreaRef = useRef<HTMLTextAreaElement>(null);

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
      if (!split.structure && !split.flow && text.trim()) {
        setStructure(text.trim());
      } else {
        setStructure(split.structure);
        setFlow(split.flow);
      }
      setStatus('done');
      if (split.flow) {
        setActiveTab('flow');
      }
    } catch (err) {
      if (abort.signal.aborted) return;
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Scan failed');
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runAnalysis();
  };

  const handleCancelScan = () => {
    abortRef.current?.abort();
    setStatus('idle');
  };

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
                    Ready to build Playwright tests with these flows.
                  </span>
                  <Button
                    size="sm"
                    onClick={() => router.push('/testcasebuilder')}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs gap-1.5"
                  >
                    Proceed to Test Builder
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
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
