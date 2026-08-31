'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Play, Square, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type RunStatus = 'idle' | 'cloning' | 'installing' | 'starting' | 'running' | 'error' | 'stopped';

interface RunState {
  status: RunStatus;
  port: number | null;
  url: string | null;
  error: string | null;
  logs: string[];
}

const STEP_ORDER: { key: RunStatus; label: string }[] = [
  { key: 'cloning', label: 'Cloning' },
  { key: 'installing', label: 'Installing dependencies' },
  { key: 'starting', label: 'Starting dev server' },
  { key: 'running', label: 'Running' },
];

const ACTIVE_STATUSES: RunStatus[] = ['cloning', 'installing', 'starting'];

function stepState(stepKey: RunStatus, current: RunStatus): 'done' | 'active' | 'pending' {
  const order = STEP_ORDER.map((s) => s.key);
  const stepIdx = order.indexOf(stepKey);
  const currentIdx = order.indexOf(current);
  if (current === 'error' || current === 'stopped' || current === 'idle') return 'pending';
  if (currentIdx > stepIdx) return 'done';
  if (currentIdx === stepIdx) return 'active';
  return 'pending';
}

function normalizeState(data: any): RunState {
  if (!data || typeof data !== 'object') {
    return { status: 'idle', port: null, url: null, error: null, logs: [] };
  }
  return {
    status: data.status || 'idle',
    port: data.port ?? null,
    url: data.url ?? null,
    error: data.error ?? null,
    logs: Array.isArray(data.logs) ? data.logs : [],
  };
}

export function ProjectRunnerPanel({ repo, branch }: { repo: string; branch: string }) {
  const [state, setState] = useState<RunState>({ status: 'idle', port: null, url: null, error: null, logs: [] });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/github/run');
      const data = await res.json();
      const next = normalizeState(data);
      setState(next);
      return next;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    void fetchStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ACTIVE_STATUSES.includes(state.status)) {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchStatus, 1500);
      }
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ block: 'end' });
  }, [state.logs?.length]);

  const handleStart = async () => {
    setState({ status: 'cloning', port: null, url: null, error: null, logs: [] });
    try {
      const res = await fetch('/api/github/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, branch }),
      });
      const data = await res.json();
      const next = normalizeState(data);
      setState(next);
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchStatus, 1500);
      }
    } catch (err) {
      setState((prev) => ({ ...prev, status: 'error', error: err instanceof Error ? err.message : 'Failed to start' }));
    }
  };

  const handleStop = async () => {
    const res = await fetch('/api/github/run/stop', { method: 'POST' });
    const data = await res.json();
    setState(normalizeState(data));
  };

  const isBusy = ACTIVE_STATUSES.includes(state.status);

  return (
    <Card className="border-slate-200 shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Terminal className="w-4 h-4 text-slate-700" />
              Live Project Runner
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Clone, install, and start <span className="font-mono">{repo}</span>{' '}
              <span className="font-mono text-indigo-600">({branch})</span> locally.
            </CardDescription>
          </div>
          {state.status === 'running' ? (
            <Button size="sm" variant="outline" onClick={handleStop} className="text-xs border-rose-200 text-rose-600 hover:bg-rose-50">
              <Square className="w-3.5 h-3.5 mr-1.5" />
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={handleStart} disabled={isBusy} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white">
              {isBusy ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />
              ) : (
                <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
              )}
              Install & Run Project
            </Button>
          )}
        </div>
      </CardHeader>

      {state.status !== 'idle' && (
        <CardContent className="space-y-4">
          <div className="flex items-center gap-1.5">
            {STEP_ORDER.map((step, idx) => {
              const s = stepState(step.key, state.status);
              return (
                <div key={step.key} className="flex items-center gap-1.5">
                  {idx > 0 && <span className="w-3 h-px bg-slate-200" />}
                  <span
                    className={`text-[11px] font-mono font-semibold px-2 py-1 rounded-full border ${
                      s === 'active'
                        ? 'bg-amber-50 border-amber-300 text-amber-700'
                        : s === 'done'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {state.status === 'error' && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
              {state.error || 'Run failed'}
            </div>
          )}

          {state.status === 'running' && state.url && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
              <span className="text-xs text-emerald-800 font-mono">{state.url}</span>
              <a
                href={state.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
              >
                Open <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 max-h-56 overflow-y-auto">
            <pre className="font-mono text-[11px] text-emerald-400 whitespace-pre-wrap leading-relaxed">
              {state.logs && state.logs.length > 0 ? state.logs.join('\n') : 'Waiting for output…'}
            </pre>
            <div ref={logsEndRef} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
