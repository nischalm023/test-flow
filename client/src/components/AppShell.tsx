'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';

export type StudioTab = 'scanner' | 'builder' | 'runner' | 'suite' | 'repos';

const TAB_ROUTES: Record<StudioTab, string> = {
  scanner: '/scanner',
  builder: '/testcasebuilder',
  runner: '/testcaserunner',
  suite: '/testsuite',
  repos: '/repos',
};

const TAB_TITLES: Record<StudioTab, string> = {
  scanner: 'Interface Scanner & Target Inspector',
  builder: 'Test Case Builder & Step Sequencer',
  runner: 'Live Execution & Interactive Browser',
  suite: 'Test Repository & QA Analytics',
  repos: 'GitHub Repositories & Projects',
};

interface AppShellProps {
  activeTab: StudioTab;
  activeTestCaseId?: string;
  scannedCount?: number;
  testCasesCount: number;
  hasActiveTestToRun: boolean;
  activeUrl?: string;
  toastMessage?: string | null;
  overlay?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  activeTab,
  activeTestCaseId,
  scannedCount = 0,
  testCasesCount,
  hasActiveTestToRun,
  activeUrl,
  toastMessage,
  overlay,
  children,
}: AppShellProps) {
  const router = useRouter();

  const handleTabSelect = (tab: StudioTab) => {
    if (tab === activeTab) return;
    const query = tab === 'runner' && activeTestCaseId ? `?id=${activeTestCaseId}` : '';
    router.push(`${TAB_ROUTES[tab]}${query}`);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden">
      <Navbar
        activeTab={activeTab}
        onSelectTab={handleTabSelect}
        scannedCount={scannedCount}
        testCasesCount={testCasesCount}
        hasActiveTestToRun={hasActiveTestToRun}
        activeUrl={activeUrl}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-8 shrink-0 z-10 shadow-xs">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              {TAB_TITLES[activeTab]}
            </h2>
            <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-full border border-emerald-200 uppercase tracking-wide flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Engine Online
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Source:</span>
              <span className="font-mono text-slate-800 font-semibold max-w-[200px] lg:max-w-xs truncate bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
                {activeUrl || 'app.cloudscale.io/login'}
              </span>
            </div>
            {activeTab !== 'scanner' && (
              <button
                onClick={() => router.push('/scanner')}
                className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-medium rounded-lg text-xs transition-colors"
              >
                Change Source
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-[#F8FAFC]">
          <div className="max-w-7xl mx-auto space-y-6">{children}</div>
        </main>
      </div>

      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 bg-slate-900 text-slate-100 text-xs font-semibold rounded-xl shadow-lg border border-slate-700 animate-slideUp flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}

      {overlay}
    </div>
  );
}
