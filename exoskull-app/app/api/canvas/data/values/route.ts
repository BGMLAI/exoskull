/**
 * Canvas Values Data API
 *
 * GET /api/canvas/data/values — Returns full value hierarchy:
 * Values > Loops(Areas) > Quests > Missions > Challenges (with notes counts)
 *
 * Query params:
 *   ?deep=true  — Include quest details, ops/missions/challenges counts
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const { searchParams } = new URL(request.url);
    const deep = searchParams.get("deep") === "true";

    // Try the full hierarchy RPC first (most efficient, includes challenges + notes)
    if (deep) {
      try {
        const { data: hierarchy, error: rpcErr } = await supabase.rpc(
          "get_value_hierarchy_full",
          { p_tenant_id: tenantId },
        );

        if (
          !rpcErr &&
          hierarchy &&
          Array.isArray(hierarchy) &&
          hierarchy.length > 0
        ) {
          // Transform RPC output to match the expected frontend format
          const values = hierarchy.map((v: Record<string, unknown>) => ({
            id: v.id,
            name: v.name,
            description: v.description,
            icon: v.icon,
            color: v.color,
            priority: v.priority,
            is_default: v.is_default,
            notes_count: v.notes_count || 0,
            visual_type: v.visual_type || "orb",
            model_url: v.model_url || null,
            thumbnail_url: v.thumbnail_url || null,
            source_urls: v.source_urls || [],
            tags: v.tags || [],
            loops: ((v.loops as Array<Record<string, unknown>>) || []).map(
              (l) => ({
                id: l.id,
                name: l.name,
                slug: l.slug,
                icon: l.icon,
                color: l.color,
                notes_count: l.notes_count || 0,
                visual_type: l.visual_type || "orb",
                model_url: l.model_url || null,
                thumbnail_url: l.thumbnail_url || null,
                source_urls: l.source_urls || [],
                tags: l.tags || [],
                questCount: ((l.quests as unknown[]) || []).length,
                quests: (
                  (l.quests as Array<Record<string, unknown>>) || []
                ).map((q) => ({
                  id: q.id,
                  title: q.title,
                  status: q.status,
                  ops_count: q.ops_count || 0,
                  notes_count: q.notes_count || 0,
                  visual_type: q.visual_type || "orb",
                  model_url: q.model_url || null,
                  thumbnail_url: q.thumbnail_url || null,
                  source_urls: q.source_urls || [],
                  tags: q.tags || [],
                  missions_count: ((q.missions as unknown[]) || []).length,
                  missions: (
                    (q.missions as Array<Record<string, unknown>>) || []
                  ).map((m) => ({
                    id: m.id,
                    title: m.title,
                    status: m.status,
                    total_ops: m.total_ops || 0,
                    completed_ops: m.completed_ops || 0,
                    visual_type: m.visual_type || "orb",
                    model_url: m.model_url || null,
                    thumbnail_url: m.thumbnail_url || null,
                    source_urls: m.source_urls || [],
                    tags: m.tags || [],
                    challenges_count: ((m.challenges as unknown[]) || [])
                      .length,
                    challenges: (
                      (m.challenges as Array<Record<string, unknown>>) || []
                    ).map((c) => ({
                      id: c.id,
                      title: c.title,
                      status: c.status,
                      difficulty: c.difficulty || 1,
                      due_date: c.due_date,
                      notes_count: c.notes_count || 0,
                      visual_type: c.visual_type || "orb",
                      model_url: c.model_url || null,
                      thumbnail_url: c.thumbnail_url || null,
                      tags: c.tags || [],
                    })),
                  })),
                })),
              }),
            ),
          }));

          return NextResponse.json({
            values,
            lastUpdated: new Date().toISOString(),
          });
        }
      } catch {
        // RPC not available yet — fall through to manual query
      }
    }

    // Fetch active values
    const { data: values, error } = await supabase
      .from("exo_values")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (error) {
      logger.error("[CanvasValues] Query error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!values || values.length === 0) {
      return NextResponse.json({
        values: [],
        lastUpdated: new Date().toISOString(),
      });
    }

    // --- Batch notes count helper ---
    // Fetches all notes for a given FK column where the FK is in the provided IDs,
    // returns a Map<entityId, count>. Single query replaces N individual count queries.
    const batchNotesCount = async (
      fkColumn: string,
      entityIds: string[],
    ): Promise<Map<string, number>> => {
      const counts = new Map<string, number>();
      if (entityIds.length === 0) return counts;
      const { data } = await supabase
        .from("user_notes")
        .select(fkColumn)
        .eq("tenant_id", tenantId)
        .in(fkColumn, entityIds);
      if (data) {
        for (const row of data) {
          const id = (row as unknown as Record<string, string>)[fkColumn];
          if (id) counts.set(id, (counts.get(id) || 0) + 1);
        }
      }
      return counts;
    };

    // Fetch loops + quest counts per value
    const valuesWithLoops = await Promise.all(
      values.map(async (value) => {
        const { data: loops } = await supabase
          .from("user_loops")
          .select(
            "id, name, slug, icon, color, visual_type, model_url, thumbnail_url, source_urls, tags",
          )
          .eq("tenant_id", tenantId)
          .eq("value_id", value.id)
          .eq("is_active", true);

        const loopsWithQuests = await Promise.all(
          (loops || []).map(async (loop) => {
            // Query quests by loop_id (FK) with loop_slug fallback
            const questQuery = supabase
              .from("user_quests")
              .select(
                deep
                  ? "id, title, status, completed_ops, target_ops, visual_type, model_url, thumbnail_url, source_urls, tags"
                  : "id",
                { count: "exact", head: !deep },
              )
              .eq("tenant_id", tenantId)
              .or(`loop_id.eq.${loop.id},loop_slug.eq.${loop.slug}`)
              .in("status", ["active", "draft"]);

            const { data: quests, count } = await questQuery;

            // For deep mode, get ops/missions/challenges count per quest
            let questDetails: Array<{
              id: string;
              title: string;
              status: string;
              ops_count: number;
              notes_count: number;
              missions_count: number;
              missions: Array<{
                id: string;
                title: string;
                status: string;
                total_ops: number;
                completed_ops: number;
                challenges_count: number;
                challenges: Array<{
                  id: string;
                  title: string;
                  status: string;
                  difficulty: number;
                  due_date: string | null;
                  notes_count: number;
                }>;
              }>;
            }> = [];

            if (deep && quests && quests.length > 0) {
              const typedQuests = quests as unknown as Array<
                Record<string, unknown>
              >;
              questDetails = await Promise.all(
                typedQuests.map(async (q) => {
                  const questId = q.id as string;
                  const [opsResult, missionsResult] = await Promise.all([
                    supabase
                      .from("user_ops")
                      .select("id", { count: "exact", head: true })
                      .eq("quest_id", questId)
                      .in("status", ["pending", "active"]),
                    supabase
                      .from("user_missions")
                      .select(
                        "id, title, status, total_ops, completed_ops, visual_type, model_url, thumbnail_url, source_urls, tags",
                      )
                      .eq("quest_id", questId)
                      .in("status", ["active", "draft", "paused"]),
                  ]);

                  // Fetch challenges for each mission
                  const missions = await Promise.all(
                    (
                      (missionsResult.data as Array<Record<string, unknown>>) ||
                      []
                    ).map(async (m) => {
                      const missionId = m.id as string;
                      let challenges: Array<{
                        id: string;
                        title: string;
                        status: string;
                        difficulty: number;
                        due_date: string | null;
                        notes_count: number;
                      }> = [];

                      try {
                        const { data: challengeData } = await supabase
                          .from("user_challenges")
                          .select(
                            "id, title, status, difficulty, due_date, visual_type, model_url, thumbnail_url, tags",
                          )
                          .eq("mission_id", missionId)
                          .eq("tenant_id", tenantId)
                          .in("status", ["active", "draft", "paused"]);

                        if (challengeData && challengeData.length > 0) {
                          // notes_count will be injected later via batch query
                          challenges = challengeData.map((c) => ({
                            id: c.id,
                            title: c.title,
                            status: c.status,
                            difficulty: c.difficulty || 1,
                            due_date: c.due_date,
                            notes_count: 0, // placeholder — filled by batch
                            visual_type: c.visual_type || "orb",
                            model_url: c.model_url || null,
                            thumbnail_url: c.thumbnail_url || null,
                            tags: c.tags || [],
                          }));
                        }
                      } catch {
                        // user_challenges table might not exist yet
                      }

                      return {
                        id: missionId,
                        title: m.title as string,
                        status: m.status as string,
                        total_ops: (m.total_ops as number) || 0,
                        completed_ops: (m.completed_ops as number) || 0,
                        visual_type: (m.visual_type as string) || "orb",
                        model_url: (m.model_url as string) || null,
                        thumbnail_url: (m.thumbnail_url as string) || null,
                        source_urls: (m.source_urls as string[]) || [],
                        tags: (m.tags as string[]) || [],
                        challenges_count: challenges.length,
                        challenges,
                      };
                    }),
                  );

                  return {
                    id: questId,
                    title: q.title as string,
                    status: q.status as string,
                    ops_count: opsResult.count || 0,
                    notes_count: 0, // placeholder — filled by batch
                    visual_type: (q.visual_type as string) || "orb",
                    model_url: (q.model_url as string) || null,
                    thumbnail_url: (q.thumbnail_url as string) || null,
                    source_urls: (q.source_urls as string[]) || [],
                    tags: (q.tags as string[]) || [],
                    missions_count: missions.length,
                    missions,
                  };
                }),
              );
            }

            return {
              ...loop,
              notes_count: 0, // placeholder — filled by batch
              visual_type: loop.visual_type || "orb",
              model_url: loop.model_url || null,
              thumbnail_url: loop.thumbnail_url || null,
              source_urls: loop.source_urls || [],
              tags: loop.tags || [],
              questCount: deep ? (quests?.length ?? 0) : count || 0,
              ...(deep ? { quests: questDetails } : {}),
            };
          }),
        );

        return {
          id: value.id,
          name: value.name,
          description: value.description,
          icon: value.icon,
          color: value.color,
          priority: value.priority,
          is_default: value.is_default,
          notes_count: 0, // placeholder — filled by batch
          visual_type: value.visual_type || "orb",
          model_url: value.model_url || null,
          thumbnail_url: value.thumbnail_url || null,
          source_urls: value.source_urls || [],
          tags: value.tags || [],
          loops: loopsWithQuests,
        };
      }),
    );

    // --- Batch-fill notes counts (replaces N+1 individual queries with 4 queries) ---
    if (deep) {
      // Collect all entity IDs from the built tree
      const valueIds: string[] = [];
      const loopIds: string[] = [];
      const questIds: string[] = [];
      const challengeIds: string[] = [];

      for (const v of valuesWithLoops) {
        valueIds.push(v.id);
        for (const l of v.loops) {
          loopIds.push(l.id);
          if (l.quests) {
            for (const q of l.quests) {
              questIds.push(q.id);
              for (const m of q.missions) {
                for (const c of m.challenges) {
                  challengeIds.push(c.id);
                }
              }
            }
          }
        }
      }

      // Run all 4 batch counts in parallel
      const [valueNotes, loopNotes, questNotes, challengeNotes] =
        await Promise.all([
          batchNotesCount("value_id", valueIds),
          batchNotesCount("loop_id", loopIds),
          batchNotesCount("quest_id", questIds),
          batchNotesCount("challenge_id", challengeIds),
        ]);

      // Inject counts back into the tree
      for (const v of valuesWithLoops) {
        v.notes_count = valueNotes.get(v.id) || 0;
        for (const l of v.loops) {
          l.notes_count = loopNotes.get(l.id) || 0;
          if (l.quests) {
            for (const q of l.quests) {
              q.notes_count = questNotes.get(q.id) || 0;
              for (const m of q.missions) {
                for (const c of m.challenges) {
                  c.notes_count = challengeNotes.get(c.id) || 0;
                }
              }
            }
          }
        }
      }
    }

    return NextResponse.json({
      values: valuesWithLoops,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("[CanvasValues] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});
