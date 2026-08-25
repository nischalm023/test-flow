'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import type { User } from '@/types';

export function GithubComplete() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    async function complete() {
      try {
        const res = await fetch('/api/auth/github/session');
        const data = (await res.json()) as {
          user?: User | null;
          accessToken?: string;
        };

        if (cancelled) return;

        if (data.user && data.accessToken) {
          setAuth(data.user, data.accessToken);
          toast.success('Logged in with GitHub');
          router.push('/');
          return;
        }

        toast.error('GitHub login failed');
        router.push('/login');
      } catch {
        if (cancelled) return;
        toast.error('GitHub login failed');
        router.push('/login');
      }
    }

    void complete();
    return () => {
      cancelled = true;
    };
  }, [router, setAuth]);

  return (
    <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
      Completing GitHub sign-in...
    </p>
  );
}
