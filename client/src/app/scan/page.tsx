'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

function RepoScanView() {
  const searchParams = useSearchParams();
  const repo = searchParams.get('repo')?.trim() || '';
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = areaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  useEffect(() => {
    if (!repo || !repo.includes('/')) {
      setStatus('error');
      setText('Missing repo. Go back and click Scan on a repository.');
      return;
    }

    const abort = new AbortController();
    setText('');
    setStatus('streaming');

    (async () => {
      try {
        const res = await fetch('/api/github/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repo }),
          signal: abort.signal,
        });
        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => res.statusText);
          throw new Error(errText || `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let next = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          next += decoder.decode(value, { stream: true });
          setText(next);
        }
        setStatus('done');
      } catch (err) {
        if (abort.signal.aborted) return;
        setStatus('error');
        setText((prev) => prev || (err instanceof Error ? err.message : 'Scan failed'));
      }
    })();

    return () => abort.abort();
  }, [repo]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="outline" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">GitHub scan</p>
            <h1 className="text-sm font-bold truncate">{repo || 'Repository'}</h1>
          </div>
        </div>
        <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full border bg-slate-50 text-slate-600">
          {status === 'streaming' ? 'Streaming…' : status === 'done' ? 'Done' : status === 'error' ? 'Error' : 'Idle'}
        </span>
      </header>

      <main className="max-w-4xl mx-auto p-4 lg:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scan className="w-4 h-4" />
              Repository details
            </CardTitle>
            <CardDescription>
              Claude scans the repo and streams a summary here. If Claude hits a rate or token limit, OpenRouter is used instead.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              ref={areaRef}
              readOnly
              value={text}
              placeholder="Scan output will stream here…"
              className="min-h-[70vh] font-mono text-sm field-sizing-fixed resize-y"
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-sm text-slate-500">
          Loading scan…
        </div>
      }
    >
      <RepoScanView />
    </Suspense>
  );
}
