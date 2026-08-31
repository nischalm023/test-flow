import { Document } from "@langchain/core/documents";

export interface TextSplitterParams {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
  keepSeparator?: boolean;
}

/**
 * RecursiveCharacterTextSplitter: Splits text recursively using a list of separators
 * (e.g. paragraphs, newlines, spaces, characters) to create semantically coherent chunks
 * adhering to chunkSize and chunkOverlap limits.
 */
export class RecursiveCharacterTextSplitter {
  public chunkSize: number;
  public chunkOverlap: number;
  public separators: string[];
  public keepSeparator: boolean;

  constructor(params: TextSplitterParams = {}) {
    this.chunkSize = params.chunkSize ?? 800;
    this.chunkOverlap = params.chunkOverlap ?? 150;
    this.separators = params.separators ?? ["\n\n", "\n", " ", ""];
    this.keepSeparator = params.keepSeparator ?? false;

    if (this.chunkOverlap >= this.chunkSize) {
      throw new Error("chunkOverlap must be less than chunkSize");
    }
  }

  public async splitText(text: string): Promise<string[]> {
    return this._splitText(text, this.separators);
  }

  public async createDocuments(
    texts: string[],
    metadatas: Array<Record<string, unknown>> = []
  ): Promise<Document[]> {
    const documents: Document[] = [];
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const metadata = metadatas[i] || {};
      const chunks = await this.splitText(text);
      for (let j = 0; j < chunks.length; j++) {
        documents.push(
          new Document({
            pageContent: chunks[j],
            metadata: {
              ...metadata,
              chunkIndex: j,
              totalChunks: chunks.length,
            },
          })
        );
      }
    }
    return documents;
  }

  public async splitDocuments(documents: Document[]): Promise<Document[]> {
    const selectedTexts = documents.map((doc) => doc.pageContent);
    const selectedMetas = documents.map((doc) => doc.metadata);
    return this.createDocuments(selectedTexts, selectedMetas);
  }

  private _splitText(text: string, separators: string[]): string[] {
    const finalChunks: string[] = [];
    let separator = separators[separators.length - 1];
    let newSeparators: string[] = [];

    for (let i = 0; i < separators.length; i++) {
      const s = separators[i];
      if (s === "") {
        separator = s;
        break;
      }
      if (text.includes(s)) {
        separator = s;
        newSeparators = separators.slice(i + 1);
        break;
      }
    }

    const splits = separator === "" ? Array.from(text) : text.split(separator);
    const goodSplits: string[] = [];

    for (const s of splits) {
      if (s.length < this.chunkSize) {
        goodSplits.push(s);
      } else {
        if (goodSplits.length > 0) {
          const mergedChunks = this._mergeSplits(goodSplits, separator);
          finalChunks.push(...mergedChunks);
          goodSplits.length = 0;
        }
        if (newSeparators.length === 0) {
          finalChunks.push(s);
        } else {
          const otherChunks = this._splitText(s, newSeparators);
          finalChunks.push(...otherChunks);
        }
      }
    }

    if (goodSplits.length > 0) {
      const mergedChunks = this._mergeSplits(goodSplits, separator);
      finalChunks.push(...mergedChunks);
    }

    return finalChunks.filter((c) => c.trim().length > 0);
  }

  private _mergeSplits(splits: string[], separator: string): string[] {
    const docs: string[] = [];
    const currentDoc: string[] = [];
    let total = 0;

    for (const d of splits) {
      const _len = d.length;
      if (
        total + _len + (currentDoc.length > 0 ? separator.length : 0) >
        this.chunkSize
      ) {
        if (currentDoc.length > 0) {
          const doc = currentDoc.join(separator);
          if (doc.trim()) {
            docs.push(doc.trim());
          }
          while (
            total > this.chunkOverlap ||
            (total + _len + (currentDoc.length > 0 ? separator.length : 0) >
              this.chunkSize &&
              total > 0)
          ) {
            const popped = currentDoc.shift();
            if (popped) {
              total -= popped.length + (currentDoc.length > 0 ? separator.length : 0);
            } else {
              break;
            }
          }
        }
      }
      currentDoc.push(d);
      total += _len + (currentDoc.length > 1 ? separator.length : 0);
    }

    const doc = currentDoc.join(separator);
    if (doc.trim()) {
      docs.push(doc.trim());
    }

    return docs;
  }
}

/**
 * Helper to chunk markdown/code text into standard 800-character chunks with 150 overlap.
 */
export async function chunkTextContent(
  text: string,
  options?: { chunkSize?: number; chunkOverlap?: number }
): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: options?.chunkSize ?? 800,
    chunkOverlap: options?.chunkOverlap ?? 150,
  });
  return splitter.splitText(text);
}
