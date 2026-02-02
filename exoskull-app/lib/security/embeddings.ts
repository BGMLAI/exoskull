/**
 * Embedding Utilities with L2 Normalization
 *
 * Based on OpenClaw 2026.2.x - L2-normalized local embedding vectors
 * for accurate semantic search
 */

/**
 * L2 normalize a vector (unit vector normalization)
 * This ensures cosine similarity works correctly
 */
export function l2Normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((sum, val) => sum + val * val, 0)
  )

  if (magnitude === 0) {
    return vector
  }

  return vector.map(val => val / magnitude)
}

/**
 * Batch L2 normalize multiple vectors
 */
export function l2NormalizeBatch(vectors: number[][]): number[][] {
  return vectors.map(v => l2Normalize(v))
}

/**
 * Calculate cosine similarity between two normalized vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length')
  }

  return a.reduce((sum, val, i) => sum + val * b[i], 0)
}

/**
 * Calculate dot product (same as cosine similarity for normalized vectors)
 */
export function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0)
}

/**
 * Find top-k most similar vectors
 */
export function findTopK<T extends { embedding: number[] }>(
  query: number[],
  items: T[],
  k: number = 5
): Array<T & { similarity: number }> {
  const normalizedQuery = l2Normalize(query)

  const withSimilarity = items.map(item => ({
    ...item,
    similarity: cosineSimilarity(normalizedQuery, l2Normalize(item.embedding))
  }))

  return withSimilarity
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k)
}

/**
 * Validate embedding dimensions
 */
export function validateEmbedding(
  embedding: number[],
  expectedDim: number = 1536 // OpenAI default
): boolean {
  if (!Array.isArray(embedding)) {
    return false
  }
  if (embedding.length !== expectedDim) {
    return false
  }
  if (!embedding.every(v => typeof v === 'number' && !isNaN(v))) {
    return false
  }
  return true
}

/**
 * Average multiple embeddings (e.g., for document chunks)
 */
export function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    throw new Error('Cannot average empty array')
  }

  const dim = embeddings[0].length
  const sum = new Array(dim).fill(0)

  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      sum[i] += emb[i]
    }
  }

  const avg = sum.map(v => v / embeddings.length)
  return l2Normalize(avg) // Return normalized
}

/**
 * Quantize embedding to reduce storage (optional compression)
 */
export function quantizeEmbedding(
  embedding: number[],
  bits: 8 | 16 = 16
): Int8Array | Int16Array {
  const normalized = l2Normalize(embedding)
  const scale = bits === 8 ? 127 : 32767

  if (bits === 8) {
    return new Int8Array(normalized.map(v => Math.round(v * scale)))
  } else {
    return new Int16Array(normalized.map(v => Math.round(v * scale)))
  }
}

/**
 * Dequantize embedding back to float
 */
export function dequantizeEmbedding(
  quantized: Int8Array | Int16Array
): number[] {
  const scale = quantized instanceof Int8Array ? 127 : 32767
  return Array.from(quantized).map(v => v / scale)
}
