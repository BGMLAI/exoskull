/**
 * Unified Chunking Pipeline
 *
 * Intelligent text splitting for embedding storage.
 * Supports multiple strategies:
 * - semantic: sentence-aware splitting (default for prose)
 * - paragraph: split on double newlines (for articles, docs)
 * - markdown: split on headings + paragraphs (for .md files)
 * - code: split on function/class boundaries (for source code)
 * - fixed: fixed-size character chunks (fallback)
 *
 * Features:
 * - Content hashing for deduplication
 * - Overlap between chunks for context continuity
 * - Metadata per chunk (position, section heading, etc.)
 * - Token estimation for embedding API limits
 */

import { createHash } from "crypto";

// ============================================================================
// CONFIG
// ============================================================================

/** Default chunk settings tuned for text-embedding-3-small */
export const CHUNK_DEFAULTS = {
  maxChunkSize: 1500, // characters (~375 tokens)
  minChunkSize: 100, // discard tiny chunks
  overlap: 200, // character overlap between adjacent chunks
  maxTokensPerChunk: 500, // safety limit for embedding API
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type ChunkStrategy =
  | "semantic"
  | "paragraph"
  | "markdown"
  | "code"
  | "fixed";

export interface ChunkOptions {
  /** Chunking strategy. Auto-detected if not specified. */
  strategy?: ChunkStrategy;
  /** Max characters per chunk */
  maxChunkSize?: number;
  /** Min characters per chunk (smaller chunks are merged with neighbors) */
  minChunkSize?: number;
  /** Character overlap between adjacent chunks */
  overlap?: number;
  /** Source metadata to attach to every chunk */
  sourceType?: string;
  sourceId?: string;
  sourceName?: string;
}

export interface TextChunk {
  /** Chunk text content */
  content: string;
  /** SHA-256 hash of normalized content (for dedup) */
  contentHash: string;
  /** 0-based index of this chunk */
  index: number;
  /** Total number of chunks */
  totalChunks: number;
  /** Character offset in the original text */
  startOffset: number;
  /** Character end offset */
  endOffset: number;
  /** Estimated token count (~4 chars/token) */
  estimatedTokens: number;
  /** Optional section heading this chunk belongs to */
  sectionHeading?: string;
  /** Metadata from options */
  metadata: {
    sourceType?: string;
    sourceId?: string;
    sourceName?: string;
    strategy: ChunkStrategy;
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Chunk text with automatic strategy detection.
 * Returns array of chunks with metadata and content hashes.
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {},
): TextChunk[] {
  if (!text || text.trim().length === 0) return [];

  const strategy = options.strategy || detectStrategy(text);
  const maxSize = options.maxChunkSize || CHUNK_DEFAULTS.maxChunkSize;
  const minSize = options.minChunkSize || CHUNK_DEFAULTS.minChunkSize;
  const overlap = options.overlap || CHUNK_DEFAULTS.overlap;

  let rawChunks: RawChunk[];

  switch (strategy) {
    case "markdown":
      rawChunks = chunkMarkdown(text, maxSize);
      break;
    case "code":
      rawChunks = chunkCode(text, maxSize);
      break;
    case "paragraph":
      rawChunks = chunkByParagraph(text, maxSize);
      break;
    case "semantic":
      rawChunks = chunkSemantic(text, maxSize, overlap);
      break;
    case "fixed":
    default:
      rawChunks = chunkFixed(text, maxSize, overlap);
      break;
  }

  // Filter tiny chunks, merge with neighbors
  rawChunks = mergeSmallChunks(rawChunks, minSize, maxSize);

  // Build final chunks with metadata
  const totalChunks = rawChunks.length;
  return rawChunks.map((raw, index) => ({
    content: raw.content,
    contentHash: hashContent(raw.content),
    index,
    totalChunks,
    startOffset: raw.startOffset,
    endOffset: raw.endOffset,
    estimatedTokens: estimateTokens(raw.content),
    sectionHeading: raw.sectionHeading,
    metadata: {
      sourceType: options.sourceType,
      sourceId: options.sourceId,
      sourceName: options.sourceName,
      strategy,
    },
  }));
}

/**
 * Deduplicate chunks by content hash.
 * Useful when processing overlapping sources.
 */
export function deduplicateChunks(chunks: TextChunk[]): TextChunk[] {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    if (seen.has(chunk.contentHash)) return false;
    seen.add(chunk.contentHash);
    return true;
  });
}

/**
 * Estimate token count for text (~4 chars per token for English).
 * Rough but sufficient for budget/limit checks.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Hash content for deduplication (SHA-256 of normalized text).
 */
export function hashContent(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ").toLowerCase();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

// ============================================================================
// STRATEGY DETECTION
// ============================================================================

/**
 * Auto-detect the best chunking strategy based on content.
 */
function detectStrategy(text: string): ChunkStrategy {
  // Markdown: has headings (# or ##)
  if (/^#{1,6}\s/m.test(text) && text.includes("\n")) {
    return "markdown";
  }

  // Code: high density of code indicators
  const codeIndicators = [
    /^(import|export|const|let|var|function|class|def|async|pub|fn|struct)\s/m,
    /[{};]\s*$/m,
    /^\s*(\/\/|#|\/\*|\*)/m,
    /=>\s*\{/,
    /\bif\s*\(/,
  ];
  const codeScore = codeIndicators.filter((r) => r.test(text)).length;
  if (codeScore >= 3) return "code";

  // Paragraph: has clear paragraph breaks
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 50);
  if (paragraphs.length >= 3) return "paragraph";

  // Default: semantic (sentence-aware)
  return "semantic";
}

// ============================================================================
// CHUNKING STRATEGIES
// ============================================================================

interface RawChunk {
  content: string;
  startOffset: number;
  endOffset: number;
  sectionHeading?: string;
}

/**
 * Semantic chunking: split at sentence boundaries with overlap.
 */
function chunkSemantic(
  text: string,
  maxSize: number,
  overlap: number,
): RawChunk[] {
  // Split into sentences (handles ., !, ?, and newlines)
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const chunks: RawChunk[] = [];
  let currentContent = "";
  let currentStart = 0;
  let globalOffset = 0;

  for (const sentence of sentences) {
    if (
      currentContent.length + sentence.length > maxSize &&
      currentContent.length > 0
    ) {
      // Emit current chunk
      chunks.push({
        content: currentContent.trim(),
        startOffset: currentStart,
        endOffset: globalOffset,
      });

      // Start next chunk with overlap from the end of current
      const overlapText = getOverlapFromEnd(currentContent, overlap);
      currentStart = globalOffset - overlapText.length;
      currentContent = overlapText;
    }
    currentContent += sentence;
    globalOffset += sentence.length;
  }

  // Emit final chunk
  if (currentContent.trim().length > 0) {
    chunks.push({
      content: currentContent.trim(),
      startOffset: currentStart,
      endOffset: globalOffset,
    });
  }

  return chunks;
}

/**
 * Paragraph chunking: split on double newlines, merge small paragraphs.
 */
function chunkByParagraph(text: string, maxSize: number): RawChunk[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: RawChunk[] = [];
  let current = "";
  let currentStart = 0;
  let offset = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      offset += para.length + 2;
      continue;
    }

    if (current.length + trimmed.length + 2 > maxSize && current.length > 0) {
      chunks.push({
        content: current.trim(),
        startOffset: currentStart,
        endOffset: offset,
      });
      current = "";
      currentStart = offset;
    }

    current += (current ? "\n\n" : "") + trimmed;
    offset += para.length + 2;
  }

  if (current.trim().length > 0) {
    chunks.push({
      content: current.trim(),
      startOffset: currentStart,
      endOffset: offset,
    });
  }

  return chunks;
}

/**
 * Markdown chunking: split on headings, preserve structure.
 */
function chunkMarkdown(text: string, maxSize: number): RawChunk[] {
  const sections: Array<{ heading: string; content: string; offset: number }> =
    [];
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let lastIndex = 0;
  let lastHeading = "";
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      sections.push({
        heading: lastHeading,
        content: text.slice(lastIndex, match.index).trim(),
        offset: lastIndex,
      });
    }
    lastHeading = match[2];
    lastIndex = match.index;
  }

  if (lastIndex < text.length) {
    sections.push({
      heading: lastHeading,
      content: text.slice(lastIndex).trim(),
      offset: lastIndex,
    });
  }

  const chunks: RawChunk[] = [];
  let current = "";
  let currentHeading = "";
  let currentStart = 0;

  for (const section of sections) {
    if (!section.content) continue;

    if (
      current.length + section.content.length > maxSize &&
      current.length > 0
    ) {
      chunks.push({
        content: current.trim(),
        startOffset: currentStart,
        endOffset: section.offset,
        sectionHeading: currentHeading,
      });
      current = "";
      currentStart = section.offset;
      currentHeading = section.heading;
    }

    if (section.content.length > maxSize) {
      if (current.length > 0) {
        chunks.push({
          content: current.trim(),
          startOffset: currentStart,
          endOffset: section.offset,
          sectionHeading: currentHeading,
        });
        current = "";
      }

      const subChunks = chunkByParagraph(section.content, maxSize);
      for (const sub of subChunks) {
        chunks.push({
          ...sub,
          startOffset: section.offset + sub.startOffset,
          endOffset: section.offset + sub.endOffset,
          sectionHeading: section.heading,
        });
      }
      currentStart = section.offset + section.content.length;
      currentHeading = section.heading;
    } else {
      if (!currentHeading) currentHeading = section.heading;
      current += (current ? "\n\n" : "") + section.content;
    }
  }

  if (current.trim().length > 0) {
    chunks.push({
      content: current.trim(),
      startOffset: currentStart,
      endOffset: text.length,
      sectionHeading: currentHeading,
    });
  }

  return chunks;
}

/**
 * Code chunking: split on function/class boundaries.
 */
function chunkCode(text: string, maxSize: number): RawChunk[] {
  const boundaries =
    /^(?=\s*(?:export\s+)?(?:function|class|const\s+\w+\s*=|def\s|pub\s+fn|impl\s|interface\s|type\s+\w+\s*=))/gm;
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boundaries.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    lastIndex = match.index;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  const chunks: RawChunk[] = [];
  let current = "";
  let currentStart = 0;
  let offset = 0;

  for (const part of parts) {
    if (current.length + part.length > maxSize && current.length > 0) {
      chunks.push({
        content: current.trim(),
        startOffset: currentStart,
        endOffset: offset,
      });
      current = "";
      currentStart = offset;
    }

    if (part.length > maxSize) {
      if (current.length > 0) {
        chunks.push({
          content: current.trim(),
          startOffset: currentStart,
          endOffset: offset,
        });
        current = "";
      }

      const lineChunks = chunkFixed(part, maxSize, 100);
      for (const lc of lineChunks) {
        chunks.push({
          ...lc,
          startOffset: offset + lc.startOffset,
          endOffset: offset + lc.endOffset,
        });
      }
      currentStart = offset + part.length;
    } else {
      current += part;
    }
    offset += part.length;
  }

  if (current.trim().length > 0) {
    chunks.push({
      content: current.trim(),
      startOffset: currentStart,
      endOffset: offset,
    });
  }

  return chunks;
}

/**
 * Fixed-size chunking: simple character-based split (fallback).
 */
function chunkFixed(
  text: string,
  maxSize: number,
  overlap: number,
): RawChunk[] {
  if (text.length <= maxSize) {
    return [{ content: text.trim(), startOffset: 0, endOffset: text.length }];
  }

  const chunks: RawChunk[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxSize;

    if (end < text.length) {
      const breakPoint = text.lastIndexOf("\n", end);
      if (breakPoint > start + maxSize / 2) {
        end = breakPoint + 1;
      } else {
        const spaceBreak = text.lastIndexOf(" ", end);
        if (spaceBreak > start + maxSize / 2) {
          end = spaceBreak + 1;
        }
      }
    } else {
      end = text.length;
    }

    chunks.push({
      content: text.slice(start, end).trim(),
      startOffset: start,
      endOffset: Math.min(end, text.length),
    });

    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Split text into sentences.
 */
function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+|(?<=\n)\s*/);
  return parts.filter((p) => p.length > 0);
}

/**
 * Get overlap text from the end of a string.
 */
function getOverlapFromEnd(text: string, overlapSize: number): string {
  if (text.length <= overlapSize) return text;

  const start = text.length - overlapSize;
  const sentenceStart = text.indexOf(". ", start);
  if (sentenceStart > start && sentenceStart < text.length - 50) {
    return text.slice(sentenceStart + 2);
  }

  const wordStart = text.indexOf(" ", start);
  if (wordStart > start) {
    return text.slice(wordStart + 1);
  }

  return text.slice(start);
}

/**
 * Merge small chunks with their neighbors.
 */
function mergeSmallChunks(
  chunks: RawChunk[],
  minSize: number,
  maxSize: number,
): RawChunk[] {
  if (chunks.length <= 1) return chunks;

  const merged: RawChunk[] = [];
  let current: RawChunk | null = null;

  for (const chunk of chunks) {
    if (!current) {
      current = { ...chunk };
      continue;
    }

    if (
      chunk.content.length < minSize &&
      current.content.length + chunk.content.length <= maxSize
    ) {
      current.content += "\n" + chunk.content;
      current.endOffset = chunk.endOffset;
      if (chunk.sectionHeading && !current.sectionHeading) {
        current.sectionHeading = chunk.sectionHeading;
      }
    } else {
      merged.push(current);
      current = { ...chunk };
    }
  }

  if (current) {
    if (current.content.length < minSize && merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (prev.content.length + current.content.length <= maxSize * 1.2) {
        prev.content += "\n" + current.content;
        prev.endOffset = current.endOffset;
      } else {
        merged.push(current);
      }
    } else {
      merged.push(current);
    }
  }

  return merged;
}
