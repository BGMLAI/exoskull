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
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const deep = searchParams.get("deep") === "true";

    // Try the full hierarchy RPC first (most efficient, includes challenges + notes)
    if (deep) {
      try {
        const { data: hierarchy, error: rpcErr } = await supabase.rpc(
          "get_value_hierarchy_full",
          { p_tenant_id: user.id },
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
            loops: ((v.loops as Array<Record<string, unknown>>) || []).map(
              (l) => ({
                id: l.id,
                name: l.name,
                slug: l.slug,
                icon: l.icon,
                color: l.color,
                notes_count: l.notes_count || 0,
                questCount: ((l.quests as unknown[]) || []).length,
                quests: (
                  (l.quests as Array<Record<string, unknown>>) || []
                ).map((q) => ({
                  id: q.id,
                  title: q.title,
                  status: q.status,
                  ops_count: q.ops_count || 0,
                  notes_count: q.notes_count || 0,
                  missions_count: ((q.missions as unknown[]) || []).length,
                  missions: (
                    (q.missions as Array<Record<string, unknown>>) || []
                  ).map((m) => ({
                    id: m.id,
                    title: m.title,
                    status: m.status,
                    total_ops: m.total_ops || 0,
                    completed_ops: m.completed_ops || 0,
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
                    })),
                  })),
                })),
              }),
            ),
          }));

          return NextResponse.json({ values });
        }
      } catch {
        // RPC not available yet — fall through to manual query
      }
    }

    // Fetch active values
    const { data: values, error } = await supabase
      .from("exo_values")
      .select("*")
      .eq("tenant_id", user.id)
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (error) {
      console.error("[CanvasValues] Query error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!values || values.length === 0) {
      return NextResponse.json({ values: [] });
    }

    // Fetch loops + quest counts per value
    const valuesWithLoops = await Promise.all(
      values.map(async (value) => {
        const { data: loops } = await supabase
          .from("user_loops")
          .select("id, name, slug, icon")
          .eq("tenant_id", user.id)
          .eq("value_id", value.id)
          .eq("is_active", true);

        // Count notes at the value level
        let valueNotesCount = 0;
        if (deep) {
          const { count } = await supabase
            .from("user_notes")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", user.id)
            .eq("value_id", value.id);
          valueNotesCount = count || 0;
        }

        const loopsWithQuests = await Promise.all(
          (loops || []).map(async (loop) => {
            // Query quests by loop_id (FK) with loop_slug fallback
            const questQuery = supabase
              .from("user_quests")
              .select(
                deep ? "id, title, status, completed_ops, target_ops" : "id",
                { count: "exact", head: !deep },
              )
              .eq("tenant_id", user.id)
              .or(`loop_id.eq.${loop.id},loop_slug.eq.${loop.slug}`)
              .in("status", ["active", "draft"]);

            const { data: quests, count } = await questQuery;

            // Count notes at loop level
            let loopNotesCount = 0;
            if (deep) {
              const { count: nc } = await supabase
                .from("user_notes")
                .select("id", { count: "exact", head: true })
                .eq("tenant_id", user.id)
                .eq("loop_id", loop.id);
              loopNotesCount = nc || 0;
            }

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
                  const [opsResult, missionsResult, questNotesResult] =
                    await Promise.all([
                      supabase
                        .from("user_ops")
                        .select("id", { count: "exact", head: true })
                        .eq("quest_id", questId)
                        .in("status", ["pending", "active"]),
                      supabase
                        .from("user_missions")
                        .select("id, title, status, total_ops, completed_ops")
                        .eq("quest_id", questId)
                        .in("status", ["active", "draft", "paused"]),
                      supabase
                        .from("user_notes")
                        .select("id", { count: "exact", head: true })
                        .eq("tenant_id", user.id)
                        .eq("quest_id", questId),
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
                          .select("id, title, status, difficulty, due_date")
                          .eq("mission_id", missionId)
                          .eq("tenant_id", user.id)
                          .in("status", ["active", "draft", "paused"]);

                        if (challengeData && challengeData.length > 0) {
                          challenges = await Promise.all(
                            challengeData.map(async (c) => {
                              const { count: cNotes } = await supabase
                                .from("user_notes")
                                .select("id", { count: "exact", head: true })
                                .eq("tenant_id", user.id)
                                .eq("challenge_id", c.id);

                              return {
                                id: c.id,
                                title: c.title,
                                status: c.status,
                                difficulty: c.difficulty || 1,
                                due_date: c.due_date,
                                notes_count: cNotes || 0,
                              };
                            }),
                          );
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
                    notes_count: questNotesResult.count || 0,
                    missions_count: missions.length,
                    missions,
                  };
                }),
              );
            }

            return {
              ...loop,
              notes_count: loopNotesCount,
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
          notes_count: valueNotesCount,
          loops: loopsWithQuests,
        };
      }),
    );

    return NextResponse.json({ values: valuesWithLoops });
  } catch (error) {
    console.error("[CanvasValues] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
