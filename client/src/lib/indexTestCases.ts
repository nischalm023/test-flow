import type { TestCase } from "@/lib/types";
import type { GeneratedFile } from "@/lib/playwrightCodegen";
import { embedTexts } from "@/lib/embeddings";
import {
  collectionInfo,
  pointIdFor,
  qdrantTestCasesCollection,
  upsertPoints,
} from "@/lib/qdrant";

export type TestCaseQdrantMeta = {
  userId?: string;
  githubRepo?: string;
  owner?: string;
  repo?: string;
  collection?: string;
};

function testCaseToText(tc: TestCase): string {
  const steps = tc.steps
    .map(
      (s) =>
        `${s.order}. ${s.action} ${s.targetDescription} ${s.targetSelector} ${s.value ?? ""} ${s.expectedValue ?? ""}`,
    )
    .join("\n");
  return [tc.title, tc.description, tc.category, tc.priority, tc.targetUrl, steps]
    .filter(Boolean)
    .join("\n");
}

export function normalizeGithubRepo(meta?: TestCaseQdrantMeta): {
  githubRepo?: string;
  owner?: string;
  repo?: string;
} {
  const raw = (meta?.githubRepo || "").trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  const [fromOwner, fromRepo] = raw.split("/");
  const owner = meta?.owner?.trim() || fromOwner || undefined;
  const repo = meta?.repo?.trim() || fromRepo || undefined;
  const githubRepo = owner && repo ? `${owner}/${repo}` : undefined;
  return { githubRepo, owner, repo };
}

/**
 * Index generated TestCase objects into the separate generated_tests collection
 */
export async function indexTestCasesToQdrant(
  testCases: TestCase[],
  meta?: string | TestCaseQdrantMeta,
) {
  if (testCases.length === 0) {
    return { saved: true as const, collection: qdrantTestCasesCollection(), pointsCount: 0, indexed: 0 };
  }

  const resolved = typeof meta === "string" ? { userId: meta } : (meta ?? {});
  const { githubRepo, owner, repo } = normalizeGithubRepo(resolved);
  const userId = resolved.userId || undefined;
  const collection = resolved.collection || qdrantTestCasesCollection();
  const texts = testCases.map(testCaseToText);
  const vectors = await embedTexts(texts);

  await upsertPoints(
    testCases.map((tc, i) => ({
      id: pointIdFor(tc.id),
      vector: vectors[i],
      payload: {
        documentId: tc.id,
        userId,
        githubRepo,
        owner,
        repo,
        title: tc.title,
        description: tc.description,
        source: "generated-test-case",
        category: tc.category,
        priority: tc.priority,
        targetUrl: tc.targetUrl,
        content: texts[i],
      },
    })),
    collection,
  );

  const info = await collectionInfo(collection);
  return {
    saved: true as const,
    collection,
    pointsCount: info.result?.points_count ?? testCases.length,
    indexed: testCases.length,
  };
}

export interface IndexGeneratedTestFilesOptions {
  owner: string;
  repo: string;
  branch: string;
  files: GeneratedFile[];
  userId?: string;
  collection?: string;
}

/**
 * Index generated test spec files (*.spec.ts, page objects, fixtures) into the separate generated_tests collection
 */
export async function indexGeneratedTestFilesToQdrant({
  owner,
  repo,
  branch,
  files,
  userId,
  collection = qdrantTestCasesCollection(),
}: IndexGeneratedTestFilesOptions) {
  if (!files || files.length === 0) {
    return { saved: true as const, collection, pointsCount: 0, indexed: 0 };
  }

  const githubRepo = `${owner}/${repo}`;
  const texts = files.map(
    (f) => `File: ${f.path}\nRepository: ${githubRepo}\nBranch: ${branch}\n\n${f.content}`
  );
  const vectors = await embedTexts(texts);

  const points = files.map((file, i) => {
    const isSpec = file.path.startsWith("tests/");
    const isPage = file.path.startsWith("src/pages/");
    const fileType = isSpec ? "spec" : isPage ? "page-object" : "fixture";

    return {
      id: pointIdFor(`${owner}_${repo}_${branch}_${file.path}`),
      vector: vectors[i],
      payload: {
        documentId: `${owner}_${repo}_${file.path}`,
        filePath: file.path,
        fileType,
        isTestSpec: isSpec,
        githubRepo,
        owner,
        repo,
        branch,
        title: `${githubRepo} - ${file.path}`,
        source: "generated-test-file",
        content: file.content,
        userId,
        createdAt: new Date().toISOString(),
      },
    };
  });

  await upsertPoints(points, collection);

  const info = await collectionInfo(collection);
  console.log(
    `[Qdrant] 🧪 Saved ${files.length} generated test file(s) for ${githubRepo} to collection "${collection}" (${info.result?.points_count ?? "?"} total points)`
  );

  return {
    saved: true as const,
    collection,
    pointsCount: info.result?.points_count ?? files.length,
    indexed: files.length,
    filePaths: files.map((f) => f.path),
  };
}
