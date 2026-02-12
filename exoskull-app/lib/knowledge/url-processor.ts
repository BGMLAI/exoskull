/**
 * URL Import Processor
 *
 * Fetches web pages via Firecrawl → converts to markdown → stores as document → processes pipeline.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { processDocument } from "./document-processor";
import { logger } from "@/lib/logger";

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

/**
 * Import a URL as a knowledge document.
 * Uses Firecrawl to extract clean markdown content from any webpage.
 * Falls back to basic fetch if Firecrawl is unavailable.
 */
export async function importUrl(
  url: string,
  tenantId: string,
  category: string = "web",
): Promise<{ success: boolean; documentId?: string; error?: string }> {
  const supabase = getServiceSupabase();

  try {
    // 1. Fetch page content
    let markdown: string;
    let title: string;

    if (FIRECRAWL_API_KEY) {
      const result = await firecrawlScrape(url);
      markdown = result.markdown;
      title = result.title || new URL(url).hostname;
    } else {
      const result = await basicFetch(url);
      markdown = result.text;
      title = result.title || new URL(url).hostname;
    }

    if (!markdown.trim()) {
      return { success: false, error: "Strona nie zawiera tekstu" };
    }

    // 2. Store content as a document in Supabase Storage
    const filename = `${tenantId}/url-${Date.now()}.md`;
    const blob = new Blob([markdown], { type: "text/markdown" });

    const { error: uploadError } = await supabase.storage
      .from("user-documents")
      .upload(filename, blob, { contentType: "text/markdown" });

    if (uploadError) {
      logger.error("[URLProcessor] Storage upload failed:", {
        error: uploadError.message,
      });
      return { success: false, error: "Nie udało się zapisać strony" };
    }

    // 3. Create document record
    const { data: doc, error: dbError } = await supabase
      .from("exo_user_documents")
      .insert({
        tenant_id: tenantId,
        filename,
        original_name: `${title} (${new URL(url).hostname})`,
        file_type: "md",
        file_size: markdown.length,
        storage_path: filename,
        category,
        status: "uploaded",
        source_url: url,
      })
      .select("id")
      .single();

    if (dbError || !doc) {
      logger.error("[URLProcessor] DB insert failed:", {
        error: dbError?.message,
      });
      return { success: false, error: "Nie udało się utworzyć rekordu" };
    }

    // 4. Process through standard pipeline (chunk → embed → store)
    const result = await processDocument(doc.id, tenantId);

    logger.info("[URLProcessor] URL imported:", {
      url,
      documentId: doc.id,
      chunks: result.chunks,
    });

    return { success: true, documentId: doc.id };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    logger.error("[URLProcessor] Import failed:", { url, error: errMsg });
    return { success: false, error: errMsg };
  }
}

async function firecrawlScrape(
  url: string,
): Promise<{ markdown: string; title: string }> {
  const FirecrawlApp = (await import("@mendable/firecrawl-js")).default;
  const app = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY! });

  // v2 SDK: scrape returns Document directly, throws on failure
  const doc = await app.scrape(url, { formats: ["markdown"] });

  return {
    markdown: doc.markdown || "",
    title: doc.metadata?.title || "",
  };
}

async function basicFetch(
  url: string,
): Promise<{ text: string; title: string }> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ExoSkull/1.0; +https://exoskull.app)",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Basic HTML to text conversion
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Strip tags, decode entities
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, title };
}
