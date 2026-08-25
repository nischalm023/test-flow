'use client';

import { useEffect, useState } from 'react';
import { GitFork, Lock, Scan, Sparkles, Star } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export type GithubRepo = {
  id: number;
  name: string;
  full_name?: string;
  html_url: string;
  description: string | null;
  private: boolean;
  stargazers_count: number;
};

type GithubRepoListProps = {
  onScanRepo?: (repo: GithubRepo) => void;
  scanningRepoId?: number | null;
};

export function GithubRepoList({ onScanRepo, scanningRepoId }: GithubRepoListProps) {
  const user = useAuthStore((state) => state.user);
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!user?.githubLogin) return;

    let cancelled = false;
    setStatus('loading');

    async function load() {
      try {
        const res = await fetch('/api/github/repos');
        const data = (await res.json()) as { repos?: GithubRepo[] };
        if (cancelled) return;
        if (!res.ok) {
          setStatus('error');
          setRepos([]);
          return;
        }
        setRepos(data.repos || []);
        setStatus('idle');
      } catch {
        if (cancelled) return;
        setStatus('error');
        setRepos([]);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.githubLogin]);

  if (!user?.githubLogin) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">GitHub not connected</CardTitle>
          <CardDescription>
            Sign in with GitHub to view and manage your repositories.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Your repositories</h3>
          <p className="text-sm text-muted-foreground">
            @{user.githubLogin}
            {status === 'idle' && repos.length > 0 && ` · ${repos.length} repos`}
          </p>
        </div>
      </div>

      {status === 'loading' && (
        <p className="text-sm text-muted-foreground">Loading repositories…</p>
      )}

      {status === 'error' && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-6 text-sm text-amber-800">
            Could not load repositories. Sign in with GitHub again.
          </CardContent>
        </Card>
      )}

      {status === 'idle' && repos.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No repositories found.
          </CardContent>
        </Card>
      )}

      {status === 'idle' && repos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {repos.map((repo) => (
            <Card key={repo.id} className="flex flex-col gap-4 py-4 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="gap-2 px-4 pb-0">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-semibold leading-snug truncate">
                    {repo.name}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
                    {repo.private && (
                      <Lock className="w-3.5 h-3.5" aria-label="Private repository" />
                    )}
                    <span className="flex items-center gap-0.5 text-xs">
                      <Star className="w-3.5 h-3.5" />
                      {repo.stargazers_count}
                    </span>
                  </div>
                </div>
                <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                  {repo.description || 'No description provided.'}
                </CardDescription>
              </CardHeader>

              <CardContent className="px-4 pt-0">
                <a
                  href={repo.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors truncate max-w-full"
                >
                  <GitFork className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{repo.full_name || repo.name}</span>
                </a>
              </CardContent>

              <CardFooter className="px-4 pt-0 gap-2 mt-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={scanningRepoId === repo.id}
                  onClick={() => onScanRepo?.(repo)}
                >
                  <Scan className="w-4 h-4" />
                  {scanningRepoId === repo.id ? 'Scanning…' : 'Scan'}
                </Button>
                <Button type="button" size="sm" className="flex-1" disabled>
                  <Sparkles className="w-4 h-4" />
                  Create Test
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
