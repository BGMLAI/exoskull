// =====================================================
// SEARCH TOOL - Web Search via Tavily API
// https://docs.tavily.com/
// =====================================================

import {
  ExoTool,
  ToolHandler,
  ToolResult,
  stringParam,
  numberParam,
  arrayParam,
} from "./types";

import { logger } from "@/lib/logger";
const TAVILY_API = "https://api.tavily.com/search";

// =====================================================
// TYPES
// =====================================================

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  query: string;
  answer?: string;
  results: TavilySearchResult[];
  response_time: number;
}

// =====================================================
// TOOL DEFINITION
// =====================================================

export const searchTool: ExoTool = {
  name: "web_search",
  description:
    "Search the web for current information using Tavily. Returns relevant results with summaries. Use for finding up-to-date information, news, documentation, or any web content.",
  parameters: {
    type: "object",
    properties: {
      query: stringParam("Search query"),
      max_results: numberParam("Maximum results to return (1-10)", {
        default: 5,
      }),
      search_depth: stringParam("Search depth", {
        enum: ["basic", "advanced"],
        default: "basic",
      }),
      include_answer: stringParam("Include AI-generated answer summary", {
        enum: ["true", "false"],
        default: "true",
      }),
      include_domains: stringParam(
        "Comma-separated list of domains to include",
      ),
      exclude_domains: stringParam(
        "Comma-separated list of domains to exclude",
      ),
    },
    required: ["query"],
  },
};

// =====================================================
// HANDLER
// =====================================================

export const searchHandler: ToolHandler = async (
  context,
  params,
): Promise<ToolResult> => {
  const {
    query,
    max_results = 5,
    search_depth = "basic",
    include_answer = "true",
    include_domains,
    exclude_domains,
  } = params as {
    query: string;
    max_results?: number;
    search_depth?: "basic" | "advanced";
    include_answer?: string;
    include_domains?: string;
    exclude_domains?: string;
  };

  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error:
        "Tavily API key not configured. Please set TAVILY_API_KEY environment variable.",
    };
  }

  if (!query || query.trim().length === 0) {
    return {
      success: false,
      error: "Search query is required",
    };
  }

  try {
    const requestBody: Record<string, unknown> = {
      api_key: apiKey,
      query: query.trim(),
      max_results: Math.min(Math.max(1, max_results), 10),
      search_depth,
      include_answer: include_answer === "true",
      include_raw_content: false,
      include_images: false,
    };

    if (include_domains) {
      requestBody.include_domains = include_domains
        .split(",")
        .map((d) => d.trim());
    }

    if (exclude_domains) {
      requestBody.exclude_domains = exclude_domains
        .split(",")
        .map((d) => d.trim());
    }

    const response = await fetch(TAVILY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("[SearchTool] Tavily API error:", {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `Search failed: ${response.status} - ${errorText}`,
      };
    }

    const data: TavilyResponse = await response.json();

    return {
      success: true,
      result: {
        query: data.query,
        answer: data.answer || null,
        results: data.results.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          relevance_score: r.score,
          published_date: r.published_date || null,
        })),
        result_count: data.results.length,
        response_time_ms: Math.round(data.response_time * 1000),
      },
    };
  } catch (error) {
    logger.error("[SearchTool] Error:", {
      query,
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Search failed due to unknown error",
    };
  }
};
