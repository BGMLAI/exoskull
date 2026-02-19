/**
 * Google Tasks Direct Adapter
 *
 * Wraps GoogleWorkspaceClient tasks methods for IORS tool usage.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureFreshToken } from "@/lib/rigs/oauth";
import {
  GoogleWorkspaceClient,
  GoogleTaskWithList,
} from "@/lib/rigs/google-workspace/client";
import { logger } from "@/lib/logger";

const GOOGLE_SLUGS = ["google", "google-workspace"];

async function getClient(
  tenantId: string,
): Promise<GoogleWorkspaceClient | null> {
  const supabase = getServiceSupabase();

  for (const slug of GOOGLE_SLUGS) {
    const { data: conn } = await supabase
      .from("exo_rig_connections")
      .select("id, rig_slug, access_token, refresh_token, expires_at")
      .eq("tenant_id", tenantId)
      .eq("rig_slug", slug)
      .maybeSingle();

    if (conn?.access_token) {
      try {
        const token = await ensureFreshToken(conn);
        return new GoogleWorkspaceClient(token);
      } catch (err) {
        logger.error(`[GoogleTasks] Token refresh failed for ${slug}:`, err);
        continue;
      }
    }
  }

  return null;
}

function formatTask(t: GoogleTaskWithList): string {
  const status = t.status === "completed" ? "✅" : "⬜";
  const due = t.due ? ` (termin: ${t.due.split("T")[0]})` : "";
  const list = t.taskListTitle ? ` [${t.taskListTitle}]` : "";
  const notes = t.notes ? ` — ${t.notes.slice(0, 100)}` : "";
  return `${status} ${t.title}${due}${list}${notes} | ID: ${t.id} | List: ${t.taskListId}`;
}

export async function listGoogleTasks(
  tenantId: string,
  showCompleted: boolean = false,
  listId?: string,
): Promise<{
  ok: boolean;
  tasks?: GoogleTaskWithList[];
  formatted?: string;
  error?: string;
}> {
  const client = await getClient(tenantId);
  if (!client)
    return {
      ok: false,
      error: "Brak połączenia Google Tasks. Połącz konto Google.",
    };

  try {
    if (listId) {
      const tasks = await client.getTasks(listId, showCompleted);
      const mapped: GoogleTaskWithList[] = tasks.map((t) => ({
        ...t,
        taskListId: listId,
      }));
      if (!mapped.length)
        return { ok: true, tasks: [], formatted: "Brak zadań." };
      const formatted = mapped
        .map((t, i) => `${i + 1}. ${formatTask(t)}`)
        .join("\n");
      return { ok: true, tasks: mapped, formatted };
    }

    const { tasks } = await client.getAllTasks({ showCompleted });
    if (!tasks.length)
      return { ok: true, tasks: [], formatted: "Brak zadań Google Tasks." };

    const formatted = tasks
      .map((t, i) => `${i + 1}. ${formatTask(t)}`)
      .join("\n");
    return { ok: true, tasks, formatted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[GoogleTasks] listTasks error:", msg);
    return { ok: false, error: msg };
  }
}

export async function createGoogleTask(
  tenantId: string,
  title: string,
  notes?: string,
  dueDate?: string,
  listId?: string,
): Promise<{ ok: boolean; formatted?: string; error?: string }> {
  const client = await getClient(tenantId);
  if (!client)
    return {
      ok: false,
      error: "Brak połączenia Google Tasks. Połącz konto Google.",
    };

  try {
    const task = await client.createTask(listId || "@default", {
      title,
      notes,
      due: dueDate ? new Date(dueDate).toISOString() : undefined,
    });
    return {
      ok: true,
      formatted: `Utworzono zadanie: "${task.title}" (ID: ${task.id})`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[GoogleTasks] createTask error:", msg);
    return { ok: false, error: msg };
  }
}

export async function completeGoogleTask(
  tenantId: string,
  taskId: string,
  listId: string = "@default",
): Promise<{ ok: boolean; formatted?: string; error?: string }> {
  const client = await getClient(tenantId);
  if (!client)
    return {
      ok: false,
      error: "Brak połączenia Google Tasks. Połącz konto Google.",
    };

  try {
    const task = await client.completeTask(listId, taskId);
    return { ok: true, formatted: `Ukończono: "${task.title}"` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[GoogleTasks] completeTask error:", msg);
    return { ok: false, error: msg };
  }
}

export async function deleteGoogleTask(
  tenantId: string,
  taskId: string,
  listId: string = "@default",
): Promise<{ ok: boolean; error?: string }> {
  const client = await getClient(tenantId);
  if (!client)
    return {
      ok: false,
      error: "Brak połączenia Google Tasks. Połącz konto Google.",
    };

  try {
    await client.deleteTask(listId, taskId);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[GoogleTasks] deleteTask error:", msg);
    return { ok: false, error: msg };
  }
}
