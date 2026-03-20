/**
 * GET /api/knowledge-graph — SSE stream of embedding-based knowledge graph
 *
 * Reads embeddings from exo_vector_embeddings (pgvector),
 * computes pairwise cosine similarity between documents,
 * builds a sparse graph (top-K neighbors per node),
 * and streams { nodes, links } via SSE.
 *
 * Auth: verifyTenantAuth (user JWT cookie)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  name: string;
  type: string; // source_type: document, conversation, note, email, web, voice
  chunks: number;
  color: string;
  val: number;
}

interface GraphLink {
  source: string;
  target: string;
  similarity: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TOP_K = 3; // max neighbors per node
const MIN_SIMILARITY = 0.25; // minimum cosine similarity to create a link
const MAX_NODES = 150; // cap for performance

const SOURCE_COLORS: Record<string, string> = {
  document: "#3b82f6",
  conversation: "#10b981",
  note: "#f59e0b",
  email: "#8b5cf6",
  web: "#06b6d4",
  voice: "#f97316",
};

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: Record<string, unknown>) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          } catch {
            // client disconnected
          }
        };

        try {
          emit({ type: "status", status: "loading_embeddings" });

          const supabase = getServiceSupabase();

          // 1. Get representative embeddings (chunk_index=0, one per source)
          const { data: embedRows, error: embedErr } = await supabase
            .from("exo_vector_embeddings")
            .select("source_id, source_type, embedding, metadata, total_chunks")
            .eq("tenant_id", tenantId)
            .eq("chunk_index", 0)
            .order("created_at", { ascending: false })
            .limit(MAX_NODES);

          if (embedErr) {
            logger.error("[KnowledgeGraph] Embedding query failed:", embedErr);
            emit({ type: "error", message: "Failed to load embeddings" });
            controller.close();
            return;
          }

          if (!embedRows || embedRows.length === 0) {
            // No embeddings — send empty graph
            emit({ type: "graph", nodes: [], links: [] });
            emit({ type: "done" });
            controller.close();
            return;
          }

          emit({
            type: "status",
            status: "computing_graph",
            count: embedRows.length,
          });

          // 2. Get document names from exo_user_documents
          const sourceIds = embedRows.map((r) => r.source_id).filter(Boolean);
          let docNames: Record<string, string> = {};

          if (sourceIds.length > 0) {
            const { data: docs } = await supabase
              .from("exo_user_documents")
              .select("id, filename")
              .in("id", sourceIds);

            if (docs) {
              for (const doc of docs) {
                docNames[doc.id] = doc.filename;
              }
            }
          }

          // 3. Parse embeddings and build nodes
          const parsed: Array<{
            id: string;
            type: string;
            name: string;
            chunks: number;
            embedding: number[];
          }> = [];

          for (const row of embedRows) {
            const id = row.source_id || `unknown-${parsed.length}`;

            // Skip duplicates (same source_id)
            if (parsed.some((p) => p.id === id)) continue;

            let embedding: number[];
            try {
              embedding =
                typeof row.embedding === "string"
                  ? JSON.parse(row.embedding)
                  : row.embedding;
            } catch {
              continue; // skip malformed embeddings
            }

            if (!Array.isArray(embedding) || embedding.length === 0) continue;

            const meta = row.metadata as Record<string, unknown> | null;
            const name =
              docNames[id] ||
              (meta?.source_name as string) ||
              (meta?.section_heading as string) ||
              id.slice(0, 24);

            parsed.push({
              id,
              type: row.source_type || "document",
              name,
              chunks: row.total_chunks || 1,
              embedding,
            });
          }

          if (parsed.length === 0) {
            emit({ type: "graph", nodes: [], links: [] });
            emit({ type: "done" });
            controller.close();
            return;
          }

          // 4. Compute pairwise cosine similarity → top-K links
          const links: GraphLink[] = [];
          const linkSet = new Set<string>(); // prevent duplicates

          for (let i = 0; i < parsed.length; i++) {
            const similarities: Array<{ j: number; sim: number }> = [];

            for (let j = 0; j < parsed.length; j++) {
              if (i === j) continue;
              const sim = cosineSimilarity(
                parsed[i].embedding,
                parsed[j].embedding,
              );
              if (sim >= MIN_SIMILARITY) {
                similarities.push({ j, sim });
              }
            }

            // Sort by similarity descending, take top K
            similarities.sort((a, b) => b.sim - a.sim);
            const topK = similarities.slice(0, TOP_K);

            for (const { j, sim } of topK) {
              const key =
                parsed[i].id < parsed[j].id
                  ? `${parsed[i].id}::${parsed[j].id}`
                  : `${parsed[j].id}::${parsed[i].id}`;

              if (!linkSet.has(key)) {
                linkSet.add(key);
                links.push({
                  source: parsed[i].id,
                  target: parsed[j].id,
                  similarity: Math.round(sim * 1000) / 1000,
                });
              }
            }
          }

          // 5. Build nodes
          const nodes: GraphNode[] = parsed.map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            chunks: p.chunks,
            color: SOURCE_COLORS[p.type] || "#6b7280",
            val: Math.max(2, Math.min(12, p.chunks * 2)),
          }));

          // 6. Emit graph
          emit({ type: "graph", nodes, links });
          emit({ type: "done" });
        } catch (err) {
          logger.error("[KnowledgeGraph] Computation error:", err);
          emit({
            type: "error",
            message:
              err instanceof Error ? err.message : "Graph computation failed",
          });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    logger.error("[KnowledgeGraph] Route error:", error);
    return NextResponse.json(
      { error: "Failed to generate knowledge graph" },
      { status: 500 },
    );
  }
}
