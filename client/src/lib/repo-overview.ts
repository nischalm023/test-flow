export interface RepoOverviewPort {
  service: string;
  port: string;
}

export interface RepoOverview {
  name: string;
  purpose: string;
  techStack: string[];
  ports: RepoOverviewPort[];
}

type DocumentPoint = Record<string, unknown>;

function reassembleReadme(points: DocumentPoint[]): { text: string; owner?: string; repo?: string } {
  const sorted = [...points].sort((a, b) => {
    const ai = typeof a.chunkIndex === "number" ? a.chunkIndex : 0;
    const bi = typeof b.chunkIndex === "number" ? b.chunkIndex : 0;
    return ai - bi;
  });
  const text = sorted
    .map((p) => (typeof p.content === "string" ? p.content : ""))
    .join("\n");
  const first = sorted.find((p) => typeof p.owner === "string" || typeof p.repo === "string");
  return {
    text,
    owner: typeof first?.owner === "string" ? first.owner : undefined,
    repo: typeof first?.repo === "string" ? first.repo : undefined,
  };
}

function extractSection(text: string, headings: string[]): string | null {
  const lines = text.split(/\r?\n/);
  const headingSet = headings.map((h) => h.toLowerCase());
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s*(.+)$/);
    if (match && headingSet.some((h) => match[2].trim().toLowerCase().includes(h))) {
      start = i + 1;
      level = match[1].length;
      break;
    }
  }
  if (start === -1) return null;

  const collected: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const headingMatch = lines[i].match(/^(#{1,6})\s*/);
    if (headingMatch && headingMatch[1].length <= level) break;
    collected.push(lines[i]);
  }
  return collected.join("\n").trim();
}

function extractPurpose(text: string, name: string): string {
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("!") || trimmed.startsWith("[![")) continue;
    if (trimmed.toLowerCase() === name.toLowerCase()) continue;
    return trimmed.replace(/^[-*]\s*/, "");
  }
  return "";
}

const TECH_KEYWORDS = [
  "React", "Next.js", "Node.js", "TypeScript", "JavaScript",
  "Python", "Django", "Flask", "FastAPI", "Express", "Vue", "Angular",
  "PostgreSQL", "Postgres", "MySQL", "MongoDB", "Redis", "Docker",
  "Kubernetes", "Kafka", "Qdrant", "GraphQL", "Tailwind",
  "Prisma", "Go", "Rust", "Java", "Spring", "Ruby", "Rails",
];

function extractTechStack(text: string): string[] {
  const section = extractSection(text, ["tech stack", "technologies", "built with", "stack"]);
  const found = new Set<string>();
  const haystack = section || text;

  for (const keyword of TECH_KEYWORDS) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(haystack)) {
      found.add(keyword);
    }
  }

  if (section) {
    for (const line of section.split(/\r?\n/)) {
      const match = line.match(/^[-*]\s*\**([A-Za-z0-9 .+#/]+?)\**\s*(?::.*)?$/);
      if (match) {
        const item = match[1].trim();
        if (item.length > 1 && item.length < 40) found.add(item);
      }
    }
  }

  return Array.from(found);
}

function extractPorts(text: string): RepoOverviewPort[] {
  const ports: RepoOverviewPort[] = [];
  const seen = new Set<string>();

  const add = (service: string, port: string) => {
    const key = `${service.toLowerCase()}:${port}`;
    if (!seen.has(key)) {
      seen.add(key);
      ports.push({ service, port });
    }
  };

  const section = extractSection(text, ["ports", "port"]);
  if (section) {
    for (const line of section.split(/\r?\n/)) {
      const match = line.match(/^[-*]\s*\**([A-Za-z0-9 ._/-]+?)\**\s*[:=]\s*`?(\d{2,5})`?/);
      if (match) add(match[1].trim(), match[2]);
    }
  }

  const inlineRe = /\b([A-Za-z][A-Za-z0-9 _-]{0,20}?)\s*(?:runs on|listens on|available at|exposed on)\s*(?:port\s*)?`?:?(\d{2,5})`?/gi;
  let match: RegExpExecArray | null;
  while ((match = inlineRe.exec(text))) {
    add(match[1].trim() || "Service", match[2]);
  }

  if (ports.length === 0) {
    const genericPortRe = /\bport\s*[:=]?\s*`?(\d{2,5})`?/gi;
    while ((match = genericPortRe.exec(text))) {
      add("Service", match[1]);
    }
  }

  return ports;
}

export function summarizeRepoDocuments(points: DocumentPoint[], githubRepo: string): RepoOverview {
  const { text, owner, repo } = reassembleReadme(points);
  const name = repo || githubRepo.split("/")[1] || owner || githubRepo || "";

  return {
    name,
    purpose: extractPurpose(text, name),
    techStack: extractTechStack(text),
    ports: extractPorts(text),
  };
}

export function formatRepoOverviewMarkdown(overview: RepoOverview): string {
  const lines: string[] = [];
  lines.push(`# ${overview.name || "Repository"}`);
  lines.push("");
  lines.push(overview.purpose || "No project description found in the indexed README.");
  lines.push("");
  lines.push("## Tech stack");
  lines.push(overview.techStack.length > 0 ? overview.techStack.join(", ") : "Not specified");
  lines.push("");
  lines.push("## Ports");
  if (overview.ports.length > 0) {
    for (const p of overview.ports) {
      lines.push(`- ${p.service}: ${p.port}`);
    }
  } else {
    lines.push("Not specified in the indexed README");
  }

  return lines.join("\n");
}
