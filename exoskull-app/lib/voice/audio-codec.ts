/**
 * Audio Codec Utilities
 *
 * Handles conversion between Twilio Media Streams format (mulaw 8kHz)
 * and Gemini Live API format (PCM16 16kHz input, 24kHz output).
 *
 * Conversions:
 * - mulawToPcm16(): Twilio mulaw 8kHz -> PCM16 linear
 * - pcm16ToMulaw(): PCM16 linear -> Twilio mulaw 8kHz
 * - resample(): Change sample rate (linear interpolation)
 *
 * ITU G.711 mulaw codec implementation.
 */

// ============================================================================
// MULAW DECODE TABLE (mulaw -> 16-bit linear PCM)
// ============================================================================

const MULAW_DECODE_TABLE = new Int16Array(256);

// Build decode table at module load
(function buildMulawDecodeTable() {
  const MULAW_BIAS = 33;
  const MULAW_CLIP = 32635;

  for (let i = 0; i < 256; i++) {
    // Complement to obtain normal u-law value
    const mulaw = ~i;

    // Extract sign, exponent, mantissa
    const sign = mulaw & 0x80;
    const exponent = (mulaw >> 4) & 0x07;
    const mantissa = mulaw & 0x0f;

    // Compute magnitude
    let magnitude = ((mantissa << 3) + MULAW_BIAS) << exponent;
    magnitude -= MULAW_BIAS;

    // Apply sign
    MULAW_DECODE_TABLE[i] = sign !== 0 ? -magnitude : magnitude;
  }
})();

// ============================================================================
// MULAW ENCODE TABLE (16-bit linear PCM -> mulaw)
// ============================================================================

const MULAW_MAX = 0x1fff; // Max encodable value (8191)
const MULAW_BIAS = 33;

/**
 * Encode a single 16-bit PCM sample to mulaw byte.
 */
function encodeMulawSample(pcm16: number): number {
  // Get sign
  const sign = pcm16 < 0 ? 0x80 : 0;
  let magnitude = Math.abs(pcm16);

  // Clip to max
  if (magnitude > MULAW_MAX) magnitude = MULAW_MAX;

  // Add bias
  magnitude += MULAW_BIAS;

  // Find exponent (position of highest bit)
  let exponent = 7;
  for (
    let expMask = 0x4000;
    (magnitude & expMask) === 0 && exponent > 0;
    exponent--, expMask >>= 1
  ) {
    // loop
  }

  // Extract mantissa
  const mantissa = (magnitude >> (exponent + 3)) & 0x0f;

  // Compose mulaw byte (complement)
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Decode mulaw bytes to PCM16 (signed 16-bit little-endian).
 * Each mulaw byte becomes 2 bytes (Int16).
 */
export function mulawToPcm16(mulawData: Buffer): Buffer {
  const pcm16 = Buffer.alloc(mulawData.length * 2);

  for (let i = 0; i < mulawData.length; i++) {
    const sample = MULAW_DECODE_TABLE[mulawData[i]];
    pcm16.writeInt16LE(sample, i * 2);
  }

  return pcm16;
}

/**
 * Encode PCM16 (signed 16-bit little-endian) to mulaw bytes.
 * Every 2 bytes (Int16) become 1 mulaw byte.
 */
export function pcm16ToMulaw(pcm16Data: Buffer): Buffer {
  const sampleCount = Math.floor(pcm16Data.length / 2);
  const mulaw = Buffer.alloc(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const sample = pcm16Data.readInt16LE(i * 2);
    mulaw[i] = encodeMulawSample(sample);
  }

  return mulaw;
}

/**
 * Resample PCM16 audio using linear interpolation.
 *
 * @param pcm16Data - Input PCM16 buffer (signed 16-bit LE)
 * @param fromRate - Source sample rate (e.g., 8000)
 * @param toRate - Target sample rate (e.g., 16000)
 * @returns Resampled PCM16 buffer
 */
export function resample(
  pcm16Data: Buffer,
  fromRate: number,
  toRate: number,
): Buffer {
  if (fromRate === toRate) return pcm16Data;

  const inputSamples = Math.floor(pcm16Data.length / 2);
  const ratio = fromRate / toRate;
  const outputSamples = Math.ceil(inputSamples / ratio);
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const srcPos = i * ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;

    // Read samples (clamp to bounds)
    const s0 = srcIdx < inputSamples ? pcm16Data.readInt16LE(srcIdx * 2) : 0;
    const s1 =
      srcIdx + 1 < inputSamples ? pcm16Data.readInt16LE((srcIdx + 1) * 2) : s0;

    // Linear interpolation
    const sample = Math.round(s0 + (s1 - s0) * frac);

    // Clamp to Int16 range
    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }

  return output;
}

/**
 * Full conversion: Twilio mulaw 8kHz -> Gemini PCM16 16kHz
 */
export function twilioToGemini(mulawData: Buffer): Buffer {
  const pcm16_8k = mulawToPcm16(mulawData);
  return resample(pcm16_8k, 8000, 16000);
}

/**
 * Full conversion: Gemini PCM16 24kHz -> Twilio mulaw 8kHz
 */
export function geminiToTwilio(pcm16_24k: Buffer): Buffer {
  const pcm16_8k = resample(pcm16_24k, 24000, 8000);
  return pcm16ToMulaw(pcm16_8k);
}
