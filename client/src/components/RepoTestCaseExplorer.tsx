'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Database,
  Zap,
  RefreshCw,
  Play,
  Edit3,
  Code,
  FolderGit2,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  Search,
  SlidersHorizontal,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { TestCase } from '@/lib/types';

export interface RepoSummary {
  name: string;
  owner: string;
  repo: string;
  testCasesCount: number;
  testFilesCount: number;
  documentChunksCount: number;
  totalPoints: number;
}

interface RepoTestCaseExplorerProps {
  initialRepo?: string;
  onSelectTestCaseToRun?: (testCase: TestCase, repo: string) => void;
  onSelectTestCaseToEdit?: (testCase: TestCase, repo: string) => void;
  onOpenCodeExport?: (testCase: TestCase) => void;
}

export function RepoTestCaseExplorer({
  initialRepo,
  onSelectTestCaseToRun,
  onSelectTestCaseToEdit,
  onOpenCodeExport,
}: RepoTestCaseExplorerProps) {
  const router = useRouter();
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>(initialRepo || '');
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loadingRepos, setLoadingRepos] = useState<boolean>(true);
  const [loadingCases, setLoadingCases] = useState<boolean>(false);
  const [cacheSource, setCacheSource] = useState<'redis-hset' | 'qdrant' | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // 1. Fetch available repos from Qdrant
  const fetchRepos = async () => {
    setLoadingRepos(true);
    try {
      const res = await fetch('/api/qdrant/repos');
      const data = await res.json();
      if (data.ok && Array.isArray(data.repos)) {
        setRepos(data.repos);
        if (!selectedRepo && data.repos.length > 0) {
          setSelectedRepo(data.repos[0].name);
        }
      }
    } catch (err) {
      console.error('Failed to fetch repos from Qdrant:', err);
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, []);

  // 2. Fetch test cases for selected repo (Hits Redis HSET first, then Qdrant)
  const fetchTestCases = async (repoName: string, forceRefresh: boolean = false) => {
    if (!repoName) return;
    setLoadingCases(true);
    try {
      const url = `/api/qdrant/test-cases?repo=${encodeURIComponent(repoName)}${
        forceRefresh ? '&refresh=true' : ''
      }`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.ok) {
        setTestCases(data.testCases || []);
        setCacheSource(data.source || (data.cached ? 'redis-hset' : 'qdrant'));
        setLatencyMs(data.latencyMs ?? null);
      } else {
        setTestCases([]);
        setCacheSource(null);
      }
    } catch (err) {
      console.error('Failed to fetch test cases:', err);
      setTestCases([]);
    } finally {
      setLoadingCases(false);
    }
  };

  useEffect(() => {
    if (selectedRepo) {
      fetchTestCases(selectedRepo, false);
    }
  }, [selectedRepo]);

  const toggleStepDetails = (id: string) => {
    setExpandedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filter test cases
  const filteredCases = testCases.filter((tc) => {
    const matchesCategory = categoryFilter === 'all' || tc.category === categoryFilter;
    const matchesPriority = priorityFilter === 'all' || tc.priority === priorityFilter;
    const matchesSearch =
      !searchQuery ||
      tc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tc.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tc.targetUrl.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesPriority && matchesSearch;
  });

  const passedCount = testCases.filter((tc) => tc.status === 'passed').length;
  const failedCount = testCases.filter((tc) => tc.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Header & Repository Showcase Selector */}
      <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl shadow-md shadow-blue-500/20">
                <FolderGit2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span> Test Case Hub</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    HSET Caching Active
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Browse AI-generated test suites indexed in Qdrant Vector DB with Redis Hash caching.
                </p>
              </div>
            </div>
          </div>

          {/* Cache Status Badge & Refresh */}
          <div className="flex items-center flex-wrap gap-2.5">
            {cacheSource === 'redis-hset' ? (
              <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs">
                <Zap className="w-3.5 h-3.5 text-emerald-600 fill-emerald-500 animate-pulse" />
                <span>Redis Cache Hit (HSET)</span>
                {latencyMs !== null && (
                  <span className="text-[10px] font-mono bg-emerald-200/60 px-1.5 py-0.2 rounded text-emerald-900">
                    {latencyMs}ms
                  </span>
                )}
              </div>
            ) : cacheSource === 'qdrant' ? (
              <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs">
                <Database className="w-3.5 h-3.5 text-blue-600" />
                <span>Qdrant Vector DB</span>
                {latencyMs !== null && (
                  <span className="text-[10px] font-mono bg-blue-200/60 px-1.5 py-0.2 rounded text-blue-900">
                    {latencyMs}ms
                  </span>
                )}
              </div>
            ) : null}

            <button
              onClick={() => {
                fetchRepos();
                if (selectedRepo) fetchTestCases(selectedRepo, true);
              }}
              disabled={loadingCases || loadingRepos}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="Invalidate Redis cache and pull freshly indexed data from Qdrant"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCases ? 'animate-spin text-blue-600' : ''}`} />
              <span>Refresh from Qdrant</span>
            </button>
          </div>
        </div>

        {/* Repositories Quick-Pill Bar */}
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Select Repository from Qdrant:
          </span>

          {loadingRepos ? (
            <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
              <span>Scanning Qdrant collections for repositories...</span>
            </div>
          ) : repos.length === 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              No repositories currently found in Qdrant. Generate test cases or index a repo to see it here!
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {repos.map((r) => {
                const isSelected = selectedRepo === r.name;
                return (
                  <button
                    key={r.name}
                    onClick={() => setSelectedRepo(r.name)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 border ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/25 scale-[1.02]'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <FolderGit2 className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-slate-500'}`} />
                    <span>{r.name}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                        isSelected ? 'bg-blue-800 text-blue-100' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {r.testCasesCount > 0 ? `${r.testCasesCount} tests` : `${r.totalPoints} pts`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Repo Stats Summary */}
        {selectedRepo && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[10px] uppercase font-bold text-slate-400">Total Test Cases</span>
              <p className="text-xl font-bold text-slate-900 mt-0.5">{testCases.length}</p>
            </div>
            <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200">
              <span className="text-[10px] uppercase font-bold text-emerald-600">Passed</span>
              <p className="text-xl font-bold text-emerald-800 mt-0.5">{passedCount}</p>
            </div>
            <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-200">
              <span className="text-[10px] uppercase font-bold text-rose-600">Failed</span>
              <p className="text-xl font-bold text-rose-800 mt-0.5">{failedCount}</p>
            </div>
            <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-200">
              <span className="text-[10px] uppercase font-bold text-indigo-600">Storage Target</span>
              <p className="text-xs font-mono font-bold text-indigo-900 mt-1 truncate">
                testcases:{selectedRepo}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search test cases by title, target, or keyword..."
            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs transition-all"
          >
            <option value="all">All Categories</option>
            <option value="E2E">E2E Flow</option>
            <option value="Functional">Functional</option>
            <option value="Smoke">Smoke</option>
            <option value="Negative / Edge Case">Negative / Error</option>
            <option value="Accessibility">Accessibility</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs transition-all"
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Test Cases Showcase Grid */}
      {loadingCases ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">
            Querying Redis HSET Cache & Qdrant for {selectedRepo}...
          </p>
        </div>
      ) : filteredCases.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-3">
          <Layers className="w-8 h-8 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">No test cases found for {selectedRepo}</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Try adjusting your search filters, or scan & index this repository from the prompt builder to generate tests.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCases.map((tc) => {
            const isExpanded = !!expandedSteps[tc.id];
            return (
              <div
                key={tc.id}
                className="p-5 bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl shadow-xs hover:shadow-md transition-all space-y-3.5 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-mono">
                        {tc.category || 'Functional'}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          tc.priority === 'critical'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : tc.priority === 'high'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {tc.priority || 'medium'}
                      </span>
                    </div>

                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        tc.status === 'passed'
                          ? 'bg-emerald-50 text-emerald-700'
                          : tc.status === 'failed'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {tc.status === 'passed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                      {tc.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-rose-600" />}
                      {tc.status === 'ready' && <Clock className="w-3.5 h-3.5 text-slate-400" />}
                      {tc.status ? tc.status.charAt(0).toUpperCase() + tc.status.slice(1) : 'Ready'}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 leading-snug">{tc.title}</h3>
                  {tc.description && (
                    <p className="text-xs text-slate-500 line-clamp-2">{tc.description}</p>
                  )}
                  {tc.targetUrl && (
                    <p className="text-[11px] font-mono text-blue-600 truncate">{tc.targetUrl}</p>
                  )}

                  {/* Steps preview & Accordion Toggle */}
                  <div className="pt-2">
                    <button
                      onClick={() => toggleStepDetails(tc.id)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                    >
                      <span>{tc.steps?.length || 0} Test Steps</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {isExpanded && tc.steps && tc.steps.length > 0 && (
                      <div className="mt-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5 max-h-48 overflow-y-auto">
                        {tc.steps.map((step, sIdx) => (
                          <div key={step.id || sIdx} className="text-[11px] font-mono text-slate-700 flex items-start gap-2">
                            <span className="text-slate-400 font-bold">{step.order || sIdx + 1}.</span>
                            <span className="font-bold text-indigo-600 uppercase">[{step.action}]</span>
                            <span className="text-slate-600 truncate">{step.targetDescription || step.targetSelector}</span>
                            {step.value && <span className="text-emerald-700">("{step.value}")</span>}
                            {step.expectedValue && <span className="text-amber-700">[Assert: {step.expectedValue}]</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-slate-400 truncate">
                    ID: {tc.id}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {onOpenCodeExport && (
                      <button
                        onClick={() => onOpenCodeExport(tc)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Export Playwright Code"
                      >
                        <Code className="w-4 h-4" />
                      </button>
                    )}

                    {/* Builder Navigation */}
                    <button
                      onClick={() => {
                        if (onSelectTestCaseToEdit) {
                          onSelectTestCaseToEdit(tc, selectedRepo);
                        } else {
                          const params = new URLSearchParams();
                          params.set('id', tc.id);
                          if (selectedRepo) params.set('repo', selectedRepo);
                          router.push(`/testcasebuilder?${params.toString()}`);
                        }
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Builder</span>
                    </button>

                    {/* Runner Navigation */}
                    <button
                      onClick={() => {
                        if (onSelectTestCaseToRun) {
                          onSelectTestCaseToRun(tc, selectedRepo);
                        } else {
                          const params = new URLSearchParams();
                          params.set('id', tc.id);
                          if (selectedRepo) params.set('repo', selectedRepo);
                          router.push(`/testcaserunner?${params.toString()}`);
                        }
                      }}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Run Test</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
