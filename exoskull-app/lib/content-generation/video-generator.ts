import { logger } from "@/lib/logger";

/**
 * Video Generator
 *
 * Multi-provider video generation with cost optimization.
 * Providers:
 * - Kling AI: ~$0.07/5s — best price/quality ratio (default)
 * - Minimax Video: ~$0.10/5s — backup
 * - Runway Gen-3: ~$0.50/5s — premium only
 *
 * Usage: social media reels, explainer clips, product demos
 */

// ============================================================================
// TYPES
// ============================================================================

export type VideoProvider = "kling" | "minimax" | "runway";
export type VideoQuality = "standard" | "premium";

export interface VideoRequest {
  prompt: string;
  provider?: VideoProvider;
  quality?: VideoQuality;
  durationSeconds?: number;
  imageUrl?: string; // Image-to-video
  aspectRatio?: "16:9" | "9:16" | "1:1";
}

export interface VideoResult {
  url: string;
  provider: VideoProvider;
  cost: number;
  durationSeconds: number;
  status: "completed" | "processing" | "failed";
  taskId?: string;
}

// ============================================================================
// KLING AI (~$0.07/5s)
// ============================================================================

async function generateKling(req: VideoRequest): Promise<VideoResult> {
  const apiKey = process.env.KLING_API_KEY;
  if (!apiKey) throw new Error("KLING_API_KEY not set");

  const duration = req.durationSeconds || 5;

  const response = await fetch(
    "https://api.klingai.com/v1/videos/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: req.prompt,
        duration: Math.min(duration, 10),
        aspect_ratio: req.aspectRatio || "16:9",
        mode: req.quality === "premium" ? "professional" : "standard",
        ...(req.imageUrl ? { image_url: req.imageUrl } : {}),
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Kling API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const taskId = data.data?.task_id || data.task_id;

  // Poll for completion (max 5 min)
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const pollRes = await fetch(
      `https://api.klingai.com/v1/videos/generations/${taskId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );

    const pollData = await pollRes.json();
    const status = pollData.data?.status || pollData.status;

    if (status === "completed" || status === "succeed") {
      const videoUrl =
        pollData.data?.video_url ||
        pollData.data?.works?.[0]?.resource?.resource;
      return {
        url: videoUrl || "",
        provider: "kling",
        cost: Math.ceil(duration / 5) * 0.07,
        durationSeconds: duration,
        status: "completed",
        taskId,
      };
    }

    if (status === "failed") {
      throw new Error(
        `Kling generation failed: ${pollData.data?.error || "unknown"}`,
      );
    }
  }

  return {
    url: "",
    provider: "kling",
    cost: 0,
    durationSeconds: duration,
    status: "processing",
    taskId,
  };
}

// ============================================================================
// MINIMAX VIDEO (~$0.10/5s)
// ============================================================================

async function generateMinimax(req: VideoRequest): Promise<VideoResult> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error("MINIMAX_API_KEY not set");

  const duration = req.durationSeconds || 5;

  const response = await fetch("https://api.minimax.chat/v1/video_generation", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "video-01",
      prompt: req.prompt,
      ...(req.imageUrl ? { first_frame_image: req.imageUrl } : {}),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Minimax error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const taskId = data.task_id;

  // Poll for completion
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const pollRes = await fetch(
      `https://api.minimax.chat/v1/query/video_generation?task_id=${taskId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );
    const pollData = await pollRes.json();

    if (pollData.status === "Success") {
      return {
        url: pollData.file_id || "",
        provider: "minimax",
        cost: Math.ceil(duration / 5) * 0.1,
        durationSeconds: duration,
        status: "completed",
        taskId,
      };
    }

    if (pollData.status === "Fail") {
      throw new Error("Minimax generation failed");
    }
  }

  return {
    url: "",
    provider: "minimax",
    cost: 0,
    durationSeconds: duration,
    status: "processing",
    taskId,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

function selectProvider(quality: VideoQuality): VideoProvider {
  return quality === "premium" ? "kling" : "kling"; // Kling is default for both
}

/**
 * Generate a video with automatic provider selection
 */
export async function generateVideo(req: VideoRequest): Promise<VideoResult> {
  const provider = req.provider || selectProvider(req.quality || "standard");

  logger.info("[VideoGen:start]", {
    provider,
    quality: req.quality,
    duration: req.durationSeconds,
    hasImage: !!req.imageUrl,
  });

  try {
    switch (provider) {
      case "kling":
        return await generateKling(req);
      case "minimax":
        return await generateMinimax(req);
      default:
        return await generateKling(req);
    }
  } catch (err) {
    // Fallback chain: kling → minimax
    if (provider === "kling") {
      logger.warn("[VideoGen:klingFailed:fallbackMinimax]", err);
      try {
        return await generateMinimax(req);
      } catch {
        throw err; // Original error
      }
    }
    throw err;
  }
}

/**
 * Estimate video generation cost
 */
export function estimateVideoCost(
  durationSeconds: number,
  provider: VideoProvider = "kling",
): number {
  const segments = Math.ceil(durationSeconds / 5);
  const costPerSegment =
    provider === "kling" ? 0.07 : provider === "minimax" ? 0.1 : 0.5;
  return segments * costPerSegment;
}
