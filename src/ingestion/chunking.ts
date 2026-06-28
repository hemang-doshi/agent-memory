export interface TextChunk {
  index: number;
  total: number;
  content: string;
  startOffset: number;
  endOffset: number;
}

export interface ChunkTextOptions {
  maxChunkChars?: number;
  overlapChars?: number;
}

const DEFAULT_MAX_CHUNK_CHARS = 12_000;
const DEFAULT_OVERLAP_CHARS = 400;

function normalizeChunkOptions(options: ChunkTextOptions = {}): {
  maxChunkChars: number;
  overlapChars: number;
} {
  const maxChunkChars = Math.floor(options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS);
  const overlapChars = Math.floor(options.overlapChars ?? DEFAULT_OVERLAP_CHARS);

  if (!Number.isFinite(maxChunkChars) || maxChunkChars <= 0) {
    throw new Error("maxChunkChars must be a positive number.");
  }

  if (!Number.isFinite(overlapChars) || overlapChars < 0) {
    throw new Error("overlapChars must be zero or a positive number.");
  }

  if (overlapChars >= maxChunkChars) {
    throw new Error("overlapChars must be smaller than maxChunkChars.");
  }

  return { maxChunkChars, overlapChars };
}

export function chunkText(text: string, options: ChunkTextOptions = {}): TextChunk[] {
  const { maxChunkChars, overlapChars } = normalizeChunkOptions(options);
  if (text.length <= maxChunkChars) {
    return [{ index: 0, total: 1, content: text, startOffset: 0, endOffset: text.length }];
  }

  const chunks: Array<Omit<TextChunk, "total">> = [];
  let startOffset = 0;

  while (startOffset < text.length) {
    const targetEnd = Math.min(startOffset + maxChunkChars, text.length);
    let endOffset = targetEnd;

    if (targetEnd < text.length) {
      const lineBreak = text.lastIndexOf("\n", targetEnd);
      const minimumUsefulBreak = startOffset + Math.floor(maxChunkChars * 0.5);
      if (lineBreak >= minimumUsefulBreak) {
        endOffset = lineBreak + 1;
      }
    }

    if (endOffset <= startOffset) {
      endOffset = targetEnd;
    }

    chunks.push({
      index: chunks.length,
      content: text.slice(startOffset, endOffset),
      startOffset,
      endOffset
    });

    if (endOffset >= text.length) {
      break;
    }

    startOffset = Math.max(endOffset - overlapChars, startOffset + 1);
  }

  return chunks.map((chunk) => ({ ...chunk, total: chunks.length }));
}
