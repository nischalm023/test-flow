'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  FolderGit2,
  ChevronDown,
  Zap,
  Database,
  Layers,
  Play,
  Edit3,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { TestCase } from '@/lib/types';

interface RepoSummary {
  name: string;
  owner: string;
  repo: string;
  testCasesCount: number;
  testFilesCount: number;
  documentChunksCount: number;
  totalPoints: number;
}

interface RepoTestCaseSelectorProps {
  currentRepo?: string;
  currentTestCaseId?: string;
  mode: 'builder' | 'runner';
  onSelectTestCase: (testCase: TestCase, repo: string) => void;
  onSelectRepo?: (repo: string) => void;
}

export function RepoTestCaseSelector({
  currentRepo = '',
  currentTestCaseId = '',
  mode,
  onSelectTestCase,
  onSelectRepo,
}: RepoTestCaseSelectorProps) {
  const router = useRouter();
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>(currentRepo);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loadingRepos, setLoadingRepos] = useState<boolean>(false);
  const [loadingCases, setLoadingCases] = useState<boolean>(false);
  const [cacheSource, setCacheSource] = useState<'redis-hset' | 'qdrant' | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // 1. Fetch available repos from Qdrant
  useEffect(() => {
    let mounted = true;
    const fetchRepos = async () => {
      setLoadingRepos(true);
      try {
        const res = await fetch('/api/qdrant/repos');
        const data = await res.json();
        if (mounted && data.ok && Array.isArray(data.repos)) {
          setRepos(data.repos);
          if (!selectedRepo && data.repos.length > 0) {
            const initial = currentRepo || data.repos[0].name;
            setSelectedRepo(initial);
            onSelectRepo?.(initial);
          }
        }
      } catch (err) {
        console.error('Failed to load repos:', err);
      } finally {
        if (mounted) setLoadingRepos(false);
      }
    };
    fetchRepos();
    return () => {
      mounted = false;
    };
  }, []);

  // Update selectedRepo when currentRepo prop changes
  useEffect(() => {
    if (currentRepo && currentRepo !== selectedRepo) {
      setSelectedRepo(currentRepo);
    }
  }, [currentRepo]);

  // 2. Fetch test cases whenever selectedRepo changes
  const loadRepoTestCases = async (repoName: string, refresh: boolean = false) => {
    if (!repoName) return;
    setLoadingCases(true);
    try {
      const url = `/api/qdrant/test-cases?repo=${encodeURIComponent(repoName)}${
        refresh ? '&refresh=true' : ''
      }`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.ok) {
        setTestCases(data.testCases || []);
        setCacheSource(data.source || (data.cached ? 'redis-hset' : 'qdrant'));
        setLatencyMs(data.latencyMs ?? null);

        // If active test case is found in the fetched cases, or if no test case is active, select the first
        if (data.testCases && data.testCases.length > 0) {
          const matched = data.testCases.find((tc: TestCase) => tc.id === currentTestCaseId);
          if (matched) {
            onSelectTestCase(matched, repoName);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load test cases for repo:', err);
    } finally {
      setLoadingCases(false);
    }
  };

  useEffect(() => {
    if (selectedRepo) {
      loadRepoTestCases(selectedRepo, false);
    }
  }, [selectedRepo]);

  const handleRepoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRepo = e.target.value;
    setSelectedRepo(newRepo);
    onSelectRepo?.(newRepo);
  };

  const handleTestCaseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const tc = testCases.find((c) => c.id === selectedId);
    if (tc) {
      onSelectTestCase(tc, selectedRepo);
    }
  };

  const activeTestCase = testCases.find((tc) => tc.id === currentTestCaseId);

  return (
    <div className="p-3.5 bg-white border border-slate-200/90 rounded-xl shadow-xs mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        {/* Repo Picker */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-100 flex items-center gap-1.5 font-bold">
            <FolderGit2 className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider">Repository:</span>
          </div>

          <select
            value={selectedRepo}
            onChange={handleRepoChange}
            disabled={loadingRepos}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs transition-all"
          >
            {repos.length === 0 ? (
              <option value="">{loadingRepos ? 'Loading repos...' : 'No repos found'}</option>
            ) : (
              repos.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name} ({r.testCasesCount > 0 ? `${r.testCasesCount} tests` : `${r.totalPoints} pts`})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Test Case Picker for selected repo */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100 flex items-center gap-1.5 font-bold">
            <Layers className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider">Test Case:</span>
          </div>

          <select
            value={currentTestCaseId || activeTestCase?.id || ''}
            onChange={handleTestCaseChange}
            disabled={loadingCases || testCases.length === 0}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs transition-all max-w-[240px] truncate"
          >
            {loadingCases ? (
              <option value="">Loading test cases...</option>
            ) : testCases.length === 0 ? (
              <option value="">No tests found for this repo</option>
            ) : (
              testCases.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  [{tc.category || 'Test'}] {tc.title}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Cache Source Pill */}
        {cacheSource === 'redis-hset' ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-semibold">
            <Zap className="w-3 h-3 text-emerald-600 fill-emerald-500 animate-pulse" />
            <span>Redis (HSET)</span>
            {latencyMs !== null && <span className="font-mono text-[10px]">({latencyMs}ms)</span>}
          </span>
        ) : cacheSource === 'qdrant' ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg text-[11px] font-semibold">
            <Database className="w-3 h-3 text-blue-600" />
            <span>Qdrant</span>
            {latencyMs !== null && <span className="font-mono text-[10px]">({latencyMs}ms)</span>}
          </span>
        ) : null}

        <button
          onClick={() => {
            if (selectedRepo) loadRepoTestCases(selectedRepo, true);
          }}
          disabled={loadingCases}
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          title="Refresh test cases from Qdrant"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingCases ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {/* Mode Switcher: Builder <-> Runner */}
      <div className="flex items-center gap-2">
        {mode === 'builder' ? (
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (currentTestCaseId) params.set('id', currentTestCaseId);
              if (selectedRepo) params.set('repo', selectedRepo);
              router.push(`/testcaserunner?${params.toString()}`);
            }}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-lg shadow-xs transition-all flex items-center gap-1.5"
          >
            <Play className="w-3 h-3 fill-white" />
            <span>Switch to Runner</span>
          </button>
        ) : (
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (currentTestCaseId) params.set('id', currentTestCaseId);
              if (selectedRepo) params.set('repo', selectedRepo);
              router.push(`/testcasebuilder?${params.toString()}`);
            }}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold rounded-lg transition-all flex items-center gap-1.5"
          >
            <Edit3 className="w-3 h-3" />
            <span>Switch to Builder</span>
          </button>
        )}
      </div>
    </div>
  );
}
