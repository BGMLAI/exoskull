/**
 * Social Media Engine
 *
 * Cross-channel content generation, scheduling, and optimization.
 * Channels: LinkedIn, X (Twitter), Instagram, YouTube, Facebook, TikTok
 *
 * Features:
 * - Consistent brand voice across channels
 * - Platform-specific formatting
 * - Content calendar management
 * - A/B testing suggestions
 * - Industry trend monitoring
 */

import { aiChat } from "@/lib/ai";
import { getServiceSupabase } from "@/lib/supabase/service";

// ============================================================================
// TYPES
// ============================================================================

export type SocialChannel =
  | "linkedin"
  | "x"
  | "instagram"
  | "youtube"
  | "facebook"
  | "tiktok";

export interface ContentRequest {
  topic: string;
  channels: SocialChannel[];
  tone?:
    | "professional"
    | "casual"
    | "inspiring"
    | "educational"
    | "controversial";
  audience?: string;
  cta?: string;
  hashtags?: boolean;
  language?: string;
  brandVoice?: string;
  includeImage?: boolean;
}

export interface ChannelContent {
  channel: SocialChannel;
  text: string;
  hashtags: string[];
  mediaPrompt?: string;
  bestTime?: string;
  characterCount: number;
  format: string;
}

export interface ContentPlan {
  topic: string;
  channels: ChannelContent[];
  imagePrompt?: string;
  videoPrompt?: string;
  scheduleSuggestion?: string;
  estimatedReach?: string;
}

// ============================================================================
// CHANNEL SPECS
// ============================================================================

const CHANNEL_SPECS: Record<
  SocialChannel,
  { maxChars: number; format: string; bestTimes: string[] }
> = {
  linkedin: {
    maxChars: 3000,
    format:
      "Professional, paragraph-based with line breaks. Hook in first line. End with question or CTA.",
    bestTimes: ["Tue 8-10am", "Wed 12pm", "Thu 8-10am"],
  },
  x: {
    maxChars: 280,
    format:
      "Concise, punchy. Thread if needed (mark as 1/N). Conversational tone.",
    bestTimes: ["Mon-Fri 8am", "Mon-Fri 12pm", "Wed 9am"],
  },
  instagram: {
    maxChars: 2200,
    format:
      "Visual-first caption. Emoji usage ok. Story-telling. 20-30 hashtags at end.",
    bestTimes: ["Mon 11am", "Tue 10am", "Wed 11am", "Fri 10-11am"],
  },
  youtube: {
    maxChars: 5000,
    format:
      "Video description. First 2 lines are hook. Include timestamps. Keywords for SEO.",
    bestTimes: ["Thu 3-4pm", "Fri 12pm", "Sat 9-11am"],
  },
  facebook: {
    maxChars: 63206,
    format: "Engaging, shareable. Question format works well. Medium length.",
    bestTimes: ["Mon-Fri 9am-12pm", "Wed 11am-1pm"],
  },
  tiktok: {
    maxChars: 2200,
    format:
      "Trendy, short captions. Hook viewers in 1 sec. Use trending sounds reference.",
    bestTimes: ["Tue 9am", "Thu 12pm", "Fri 5am"],
  },
};

// ============================================================================
// CONTENT GENERATION
// ============================================================================

/**
 * Generate content adapted for multiple channels
 */
export async function generateMultiChannelContent(
  req: ContentRequest,
): Promise<ContentPlan> {
  const channelInstructions = req.channels
    .map((ch) => {
      const spec = CHANNEL_SPECS[ch];
      return `${ch.toUpperCase()} (max ${spec.maxChars} chars): ${spec.format}`;
    })
    .join("\n");

  const result = await aiChat(
    [
      {
        role: "system",
        content: `You are an expert social media strategist and copywriter. Generate content for multiple platforms simultaneously.

CRITICAL RULES:
- Each platform gets UNIQUE content (not copy-paste!)
- Adapt tone, length, format to each platform
- Include hooks that stop scrolling
- Use proven engagement frameworks (AIDA, PAS, storytelling)
- ${req.brandVoice ? `Brand voice: ${req.brandVoice}` : "Professional but human"}
- Language: ${req.language || "pl"}

Respond in JSON format:
{
  "channels": [
    {
      "channel": "linkedin",
      "text": "...",
      "hashtags": ["..."],
      "mediaPrompt": "describe ideal image for this post",
      "format": "post|carousel|article"
    }
  ],
  "imagePrompt": "universal image prompt for all channels",
  "videoPrompt": "short video concept if applicable",
  "scheduleSuggestion": "when to post across channels"
}`,
      },
      {
        role: "user",
        content: `Topic: ${req.topic}
Channels: ${channelInstructions}
Tone: ${req.tone || "professional"}
${req.audience ? `Target audience: ${req.audience}` : ""}
${req.cta ? `Call to action: ${req.cta}` : ""}
${req.hashtags !== false ? "Include relevant hashtags" : "No hashtags"}

Generate engaging content for each channel.`,
      },
    ],
    { forceModel: "claude-sonnet-4-5", maxTokens: 4000 },
  );

  // Parse AI response
  try {
    const jsonMatch = result.content?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      const channels: ChannelContent[] = (parsed.channels || []).map(
        (ch: Record<string, unknown>) => ({
          channel: ch.channel as SocialChannel,
          text: String(ch.text || ""),
          hashtags: (ch.hashtags as string[]) || [],
          mediaPrompt: ch.mediaPrompt as string,
          characterCount: String(ch.text || "").length,
          format: String(ch.format || "post"),
          bestTime: CHANNEL_SPECS[ch.channel as SocialChannel]?.bestTimes[0],
        }),
      );

      return {
        topic: req.topic,
        channels,
        imagePrompt: parsed.imagePrompt as string,
        videoPrompt: parsed.videoPrompt as string,
        scheduleSuggestion: parsed.scheduleSuggestion as string,
      };
    }
  } catch {
    // Fall through to basic parsing
  }

  // Fallback: return raw content
  return {
    topic: req.topic,
    channels: req.channels.map((ch) => ({
      channel: ch,
      text: result.content || "",
      hashtags: [],
      characterCount: (result.content || "").length,
      format: "post",
    })),
  };
}

/**
 * Generate a content calendar for a week
 */
export async function generateContentCalendar(
  tenantId: string,
  topics: string[],
  channels: SocialChannel[],
  weekStartDate: Date,
): Promise<
  Array<{ day: string; channel: SocialChannel; topic: string; time: string }>
> {
  const result = await aiChat(
    [
      {
        role: "system",
        content: `You are a social media strategist. Create a weekly content calendar.
Rules:
- 1-2 posts per channel per day max
- Vary topics across the week
- Use optimal posting times for each platform
- Don't post the same topic on the same day across channels

Respond as JSON array: [{ "day": "Mon", "channel": "linkedin", "topic": "...", "time": "9:00" }]`,
      },
      {
        role: "user",
        content: `Topics: ${topics.join(", ")}\nChannels: ${channels.join(", ")}\nWeek starting: ${weekStartDate.toLocaleDateString()}`,
      },
    ],
    { forceModel: "claude-3-5-haiku", maxTokens: 2000 },
  );

  try {
    const jsonMatch = result.content?.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {
    // Return empty if parsing fails
  }

  return [];
}

/**
 * Analyze industry trends for content opportunities
 */
export async function analyzeIndustryTrends(
  tenantId: string,
  industry: string,
): Promise<{
  trends: string[];
  contentIdeas: string[];
  competitors: string[];
}> {
  const result = await aiChat(
    [
      {
        role: "system",
        content: `Analyze current trends in the given industry. Suggest content ideas that would perform well on social media.
Respond as JSON: { "trends": ["..."], "contentIdeas": ["..."], "competitors": ["..."] }`,
      },
      {
        role: "user",
        content: `Industry: ${industry}\nDate: ${new Date().toLocaleDateString()}\n\nWhat are the current hot topics and content opportunities?`,
      },
    ],
    { forceModel: "claude-3-5-haiku", maxTokens: 2000 },
  );

  try {
    const jsonMatch = result.content?.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {
    // Default empty
  }

  return { trends: [], contentIdeas: [], competitors: [] };
}
