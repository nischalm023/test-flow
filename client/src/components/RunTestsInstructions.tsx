'use client';

import { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';

type RunTestsInstructionsProps = {
  owner: string;
  repo: string;
  branch: string;
};

export function RunTestsInstructions({ owner, repo, branch }: RunTestsInstructionsProps) {
  const [copied, setCopied] = useState(false);

  const command = [
    `git clone -b ${branch} https://github.com/${owner}/${repo}.git`,
    `cd ${repo}`,
    `npm install`,
    `npx playwright test --headed --project=chromium --workers=1`,
  ].join('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <Terminal className="w-3.5 h-3.5" />
          Run these tests locally
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="font-mono text-[11px] text-emerald-400 whitespace-pre-wrap leading-relaxed">{command}</pre>
    </div>
  );
}
