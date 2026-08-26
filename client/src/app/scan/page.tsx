'use client';

  import { Suspense } from 'react';
  import { RepoScanView } from '@/components/RepoScanView';



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
