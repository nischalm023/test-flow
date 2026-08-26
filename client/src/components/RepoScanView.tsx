'use client';

import { useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Scan } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useStreamedQuery } from '@/features/github-scan/useStreamedQuery';
import { streamGithubScan } from '@/features/github-scan/stream';

export function RepoScanView() {
  const searchParams = useSearchParams();
  const repo = searchParams.get('repo')?.trim() || '';
  const branch = searchParams.get('branch')?.trim() || '';

  const areaRef = useRef<HTMLTextAreaElement>(null);

  const { status, isFetching, displayText } = useStreamedQuery(
    ['github-scan', repo, branch],
    async (onChunk) => {
      if (!repo || !repo.includes('/')) {
        throw new Error('Missing repo. Go back and click Scan on a repository.');
      }
      return streamGithubScan({ repo, branch }, (chunk) => {
        onChunk(chunk);
        // Auto-scroll
        const el = areaRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },
    {
      enabled: !!repo && repo.includes('/'),
      staleTime: 5 * 60 * 1000, // data considered fresh for 5 minutes
      gcTime: 5 * 60 * 1000,    // cache removed after 5 minutes of inactivity
      retry: false,
    }
  );

  const displayStatus =
    status === 'error'
      ? 'Error'
      : isFetching
        ? 'Streaming…'
        : status === 'success'
          ? 'Done'
          : 'Idle';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <main className="max-w-4xl mx-auto p-4 lg:p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Scan className="w-4 h-4" />
                Repository details
              </CardTitle>
              <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full border bg-slate-50 text-slate-600">
                {displayStatus}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {status === 'error' && (
              <p className="text-sm text-red-600 mb-3 px-1">
                Could not scan repository. Please try again.
              </p>
            )}
            <Textarea
              ref={areaRef}
              readOnly
              value={displayText}
              placeholder="Scan output will stream here…"
              className="min-h-[70vh] font-mono text-sm field-sizing-fixed resize-y"
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}