export type GithubScanBody = {
  repo: string;
  branch?: string;
  prompt?: string;
  mode?: 'report' | 'structure-flow' | 'suggest-prompts';
};

export async function streamGithubScan(
  body: GithubScanBody,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch('/api/github/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(errText || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  console.log(reader, "red")
  const decoder = new TextDecoder();
  let next = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    next += decoder.decode(value, { stream: true });
    onChunk(next);
  }
  return next;
}
