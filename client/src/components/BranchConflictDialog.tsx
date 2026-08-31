'use client';

import { GitBranch } from 'lucide-react';

type BranchConflictDialogProps = {
  open: boolean;
  existingBranch: string;
  onReuse: () => void;
  onCreateNew: () => void;
  onCancel: () => void;
};

export function BranchConflictDialog({
  open,
  existingBranch,
  onReuse,
  onCreateNew,
  onCancel,
}: BranchConflictDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scaleUp">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Setup branch already exists</h3>
              <p className="text-xs text-slate-500 font-mono">{existingBranch}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-sm font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-slate-600">
          A Playwright setup branch already exists on this repo. Write into it, or create a new
          branch instead?
        </p>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <button
            onClick={onReuse}
            className="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Write into same branch
          </button>
          <button
            onClick={onCreateNew}
            className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            Create a new branch
          </button>
        </div>
      </div>
    </div>
  );
}
