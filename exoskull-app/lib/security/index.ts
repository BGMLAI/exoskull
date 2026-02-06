/**
 * Security Module Index
 *
 * ExoSkull security features based on OpenClaw 2026.2.x
 */

// SSRF Protection
export {
  checkSSRF,
  safeFetch,
  validateMediaUrl,
  isInternalUrl,
  type SSRFCheckResult,
} from "./ssrf-guard";

// Safety Guardrails
export {
  SAFETY_GUARDRAILS,
  sanitizeUserInput,
  containsSensitiveData,
  maskSensitiveData,
  checkRateLimit,
} from "./safety-guardrails";

// Gateway Timestamps
export {
  addGatewayTimestamp,
  calculateProcessingTime,
  createTimestampedMessage,
  formatTimestamp,
  isStaleTimestamp,
  type TimestampedMessage,
} from "./timestamps";

// Embedding Utilities
export {
  l2Normalize,
  l2NormalizeBatch,
  cosineSimilarity,
  dotProduct,
  findTopK,
  validateEmbedding,
  averageEmbeddings,
  quantizeEmbedding,
  dequantizeEmbedding,
} from "./embeddings";

// Webhook HMAC Verification
export { verifyMetaSignature } from "./webhook-hmac";
