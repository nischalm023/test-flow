'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GitBranch,
  GitFork,
  Loader2,
  Lock,
  RefreshCw,
  Scan,
  Sparkles,
  Star,
} from 'lucide-react';
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

type BranchResponse = {
  branches: string[];
  defaultBranch?: string;
  error?: string;
};

function RepoCard({
  repo,
  scanningRepoId,
  onScan,
  onCreateTest,
  isCreatingTest,
  testSuccess,
  testError,
}: {
  repo: GithubRepo;
  scanningRepoId?: number | null;
  onScan: (repo: GithubRepo, branch: string) => void;
  onCreateTest: (repo: GithubRepo, branch: string) => void;
  isCreatingTest: boolean;
  testSuccess?: boolean;
  testError?: string | null;
}) {
  const fullName = repo.full_name || repo.name;
  const [selectedBranch, setSelectedBranch] = useState<string>('');

  // Fetch branches with useQuery (cached for 5 minutes)
  const {
    data: branchData,
    isLoading: isBranchesLoading,
    isRefetching: isBranchesRefetching,
    refetch: refetchBranches,
  } = useQuery<BranchResponse>({
    queryKey: ['github-branches', fullName],
    queryFn: async () => {
      const res = await fetch(`/api/github/branch?repo=${encodeURIComponent(fullName)}`);
      if (!res.ok) {
        return { branches: ['main'], defaultBranch: 'main' };
      }
      return (await res.json()) as BranchResponse;
    },
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 5 * 60 * 1000,    // 5 min
  });

  const branches = branchData?.branches || ['main'];
  const activeBranch = selectedBranch || branchData?.defaultBranch || branches[0] || 'main';

  return (
    <Card className="flex flex-col gap-3 py-4 shadow-xs hover:shadow-md transition-shadow border-slate-200 bg-white">
      <CardHeader className="gap-2 px-4 pb-0">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-snug truncate text-slate-900">
            {repo.name}
          </CardTitle>
          <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
            {repo.private && (
              <Lock className="w-3.5 h-3.5" aria-label="Private repository" />
            )}
            <span className="flex items-center gap-0.5 text-xs text-slate-500 font-medium">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              {repo.stargazers_count}
            </span>
          </div>
        </div>
        <CardDescription className="line-clamp-2 min-h-[2.5rem] text-xs text-slate-500">
          {repo.description || 'No description provided.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="px-4 py-0 space-y-2.5">
        <a
          href={repo.html_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors truncate max-w-full"
        >
          <GitFork className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{fullName}</span>
        </a>

        {/* Shadcn-Styled Branch Selector Dropdown */}
        <div className="pt-1">
          <label className="text-[11px] font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <GitBranch className="w-3 h-3 text-slate-400" />
              Target Branch:
            </span>
            <button
              type="button"
              onClick={() => void refetchBranches()}
              title="Refresh branches"
              className="text-slate-400 hover:text-slate-700 transition-colors p-0.5"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${isBranchesRefetching ? 'animate-spin' : ''}`} />
            </button>
          </label>

          <div className="relative">
            <select
              value={activeBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              disabled={isBranchesLoading}
              className="w-full h-8 text-xs font-mono bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-md px-2.5 py-1 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors cursor-pointer appearance-none pr-7"
            >
              {isBranchesLoading ? (
                <option value="">Loading branches…</option>
              ) : (
                branches.map((b) => (
                  <option key={b} value={b}>
                    {b} {b === branchData?.defaultBranch ? '(default)' : ''}
                  </option>
                ))
              )}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
              {isBranchesLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <GitBranch className="w-3 h-3" />
              )}
            </div>
          </div>
        </div>

        {testError && (
          <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
            {testError}
          </p>
        )}
      </CardContent>

      <CardFooter className="px-4 pt-1 gap-2 mt-auto">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 text-xs h-8"
          disabled={scanningRepoId === repo.id}
          onClick={() => onScan(repo, activeBranch)}
        >
          <Scan className="w-3.5 h-3.5 mr-1" />
          {scanningRepoId === repo.id ? 'Scanning…' : 'Scan'}
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1 text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white"
          disabled={isCreatingTest}
          onClick={() => onCreateTest(repo, activeBranch)}
        >
          {isCreatingTest ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              Creating…
            </>
          ) : testSuccess ? (
            '✓ Ready'
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              Create Test
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function GithubRepoList({ scanningRepoId }: GithubRepoListProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [activeCreatingRepoId, setActiveCreatingRepoId] = useState<number | null>(null);
  const [testErrors, setTestErrors] = useState<Record<number, string | null>>({});

  // 1. Fetch Repositories Query (staleTime: 5 min, gcTime: 5 min)
  const { data: repos = [], status } = useQuery<GithubRepo[]>({
    queryKey: ['github-repos', user?.githubLogin],
    queryFn: async () => {
      const res = await fetch('/api/github/repos');
      if (!res.ok) throw new Error('Failed to load repositories');
      const data = (await res.json()) as { repos?: GithubRepo[] };
      return data.repos ?? [];
    },
    enabled: !!user?.githubLogin,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 5 * 60 * 1000,    // 5 minutes
  });

  // 2. Create Test Case Mutation (useMutation)

  // 3. Scan Navigation with Branch
  const handleScan = (repo: GithubRepo, branch: string) => {
    const fullName = repo.full_name || repo.name;
    const branchParam = branch ? `&branch=${encodeURIComponent(branch)}` : '';
    router.push(`/scan?repo=${encodeURIComponent(fullName)}${branchParam}`);
  };

  // 4. Trigger Create Test Mutation
  const handleCreateTest = (repo: GithubRepo, branch: string) => {
    const fullName = repo.full_name || repo.name;
    router.push(`/prompt?repo=${encodeURIComponent(fullName)}&branch=${encodeURIComponent(branch)}`);
  };

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
          <p className="text-sm text-slate-500">
            @{user.githubLogin}
            {status === 'success' && repos.length > 0 && ` · ${repos.length} repos`}
          </p>
        </div>
      </div>

      {status === 'pending' && (
        <div className="p-8 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
          Loading repositories…
        </div>
      )}

      {status === 'error' && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-6 text-sm text-amber-800">
            Could not load repositories. Sign in with GitHub again.
          </CardContent>
        </Card>
      )}

      {status === 'success' && repos.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-sm text-slate-500">
            No repositories found.
          </CardContent>
        </Card>
      )}

      {status === 'success' && repos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {repos.map((repo) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              scanningRepoId={scanningRepoId}
              onScan={handleScan}
              onCreateTest={handleCreateTest}
              isCreatingTest={activeCreatingRepoId === repo.id}
              // testSuccess={createTestMutation.isSuccess && activeCreatingRepoId === repo.id}
              testError={testErrors[repo.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
