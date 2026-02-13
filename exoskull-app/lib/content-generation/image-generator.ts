/**
 * Image Generator
 *
 * Multi-provider image generation with cost optimization.
 * Providers:
 * - Flux (via Replicate): ~$0.003/image — bulk/social media
 * - DALL-E 3 (OpenAI): ~$0.04/image — premium content
 * - Kimi Vision (Moonshot): included in API — analysis only
 *
 * Auto-routes based on quality requirements and budget.
 */

// ============================================================================
// TYPES
// ============================================================================

export type ImageProvider = "flux" | "dalle3" | "kimi";
export type ImageQuality = "draft" | "standard" | "premium";
export type ImageSize = "square" | "landscape" | "portrait" | "story";

export interface ImageRequest {
  prompt: string;
  provider?: ImageProvider;
  quality?: ImageQuality;
  size?: ImageSize;
  style?: string;
  negativePrompt?: string;
  count?: number;
}

export interface ImageResult {
  url: string;
  provider: ImageProvider;
  cost: number;
  width: number;
  height: number;
  prompt: string;
  revisedPrompt?: string;
}

// ============================================================================
// SIZE MAPPING
// ============================================================================

const SIZE_MAP: Record<
  ImageSize,
  { width: number; height: number; dalleSize: string }
> = {
  square: { width: 1024, height: 1024, dalleSize: "1024x1024" },
  landscape: { width: 1792, height: 1024, dalleSize: "1792x1024" },
  portrait: { width: 1024, height: 1792, dalleSize: "1024x1792" },
  story: { width: 1080, height: 1920, dalleSize: "1024x1792" },
};

// ============================================================================
// PROVIDER IMPLEMENTATIONS
// ============================================================================

/**
 * Generate with Flux via Replicate (~$0.003/image)
 */
async function generateFlux(req: ImageRequest): Promise<ImageResult> {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) throw new Error("REPLICATE_API_TOKEN not set");

  const size = SIZE_MAP[req.size || "square"];

  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "black-forest-labs/flux-1.1-pro",
      input: {
        prompt: req.prompt,
        width: size.width,
        height: size.height,
        num_inference_steps: req.quality === "premium" ? 50 : 28,
        guidance_scale: 3.5,
        ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Flux API error: ${response.status} ${errText}`);
  }

  const prediction = await response.json();

  // Poll for completion (max 60s)
  let result = prediction;
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    if (result.status === "succeeded") break;
    if (result.status === "failed")
      throw new Error(`Flux generation failed: ${result.error}`);

    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${result.id}`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    );
    result = await pollRes.json();
  }

  if (result.status !== "succeeded") {
    throw new Error("Flux generation timed out");
  }

  const outputUrl = Array.isArray(result.output)
    ? result.output[0]
    : result.output;

  return {
    url: outputUrl,
    provider: "flux",
    cost: 0.003,
    width: size.width,
    height: size.height,
    prompt: req.prompt,
  };
}

/**
 * Generate with DALL-E 3 (~$0.04/image standard, $0.08 HD)
 */
async function generateDalle3(req: ImageRequest): Promise<ImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const size = SIZE_MAP[req.size || "square"];
  const isHD = req.quality === "premium";

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: req.prompt,
      n: 1,
      size: size.dalleSize,
      quality: isHD ? "hd" : "standard",
      style: req.style || "vivid",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DALL-E 3 error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const image = data.data[0];

  return {
    url: image.url,
    provider: "dalle3",
    cost: isHD ? 0.08 : 0.04,
    width: size.width,
    height: size.height,
    prompt: req.prompt,
    revisedPrompt: image.revised_prompt,
  };
}

// ============================================================================
// AUTO-ROUTER
// ============================================================================

/**
 * Auto-select provider based on quality and budget
 */
function selectProvider(quality: ImageQuality): ImageProvider {
  switch (quality) {
    case "draft":
      return "flux";
    case "standard":
      return "flux";
    case "premium":
      return "dalle3";
    default:
      return "flux";
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate an image with automatic provider selection
 */
export async function generateImage(req: ImageRequest): Promise<ImageResult> {
  const provider = req.provider || selectProvider(req.quality || "standard");

  console.info("[ImageGen:start]", {
    provider,
    quality: req.quality,
    size: req.size,
    promptLength: req.prompt.length,
  });

  try {
    let result: ImageResult;

    switch (provider) {
      case "flux":
        result = await generateFlux(req);
        break;
      case "dalle3":
        result = await generateDalle3(req);
        break;
      default:
        result = await generateFlux(req);
    }

    console.info("[ImageGen:success]", {
      provider: result.provider,
      cost: result.cost,
      url: result.url.slice(0, 80),
    });

    return result;
  } catch (err) {
    // Fallback: if premium fails, try standard
    if (provider === "dalle3") {
      console.warn("[ImageGen:dalle3Failed:fallbackToFlux]", err);
      return generateFlux(req);
    }
    throw err;
  }
}

/**
 * Generate multiple images (batch)
 */
export async function generateBatch(
  requests: ImageRequest[],
): Promise<ImageResult[]> {
  const results = await Promise.allSettled(
    requests.map((r) => generateImage(r)),
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<ImageResult> => r.status === "fulfilled",
    )
    .map((r) => r.value);
}

/**
 * Estimate cost for image generation
 */
export function estimateCost(requests: ImageRequest[]): {
  totalCost: number;
  breakdown: Array<{
    provider: ImageProvider;
    count: number;
    costPerImage: number;
  }>;
} {
  const breakdown = new Map<
    ImageProvider,
    { count: number; costPerImage: number }
  >();

  for (const req of requests) {
    const provider = req.provider || selectProvider(req.quality || "standard");
    const costPerImage =
      provider === "dalle3" ? (req.quality === "premium" ? 0.08 : 0.04) : 0.003;

    const existing = breakdown.get(provider) || { count: 0, costPerImage };
    existing.count += req.count || 1;
    breakdown.set(provider, existing);
  }

  const result = Array.from(breakdown.entries()).map(([provider, data]) => ({
    provider,
    ...data,
  }));

  return {
    totalCost: result.reduce((s, r) => s + r.count * r.costPerImage, 0),
    breakdown: result,
  };
}
