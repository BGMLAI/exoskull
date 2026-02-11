/**
 * Email Task Generator
 *
 * Converts action_items from email analysis into exo_tasks.
 * Deduplicates by checking for similar existing tasks.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import type { AnalyzedEmail, ActionItem } from "./types";

/**
 * Generate tasks from email action items.
 * Returns number of tasks created.
 */
export async function generateTasksFromEmail(
  email: AnalyzedEmail,
  actionItems: ActionItem[],
): Promise<number> {
  if (!actionItems.length) return 0;

  const supabase = getServiceSupabase();
  let created = 0;
  const taskIds: string[] = [];

  for (const item of actionItems) {
    if (!item.text?.trim()) continue;

    // Check for duplicate tasks (fuzzy title match)
    const { data: existing } = await supabase
      .from("exo_tasks")
      .select("id")
      .eq("tenant_id", email.tenant_id)
      .eq("status", "pending")
      .ilike("title", `%${item.text.slice(0, 40)}%`)
      .limit(1);

    if (existing?.length) continue; // Skip duplicate

    // Map email priority to task priority (1=critical, 4=low)
    let taskPriority = 3;
    if (email.priority === "urgent") taskPriority = 1;
    else if (email.priority === "high") taskPriority = 2;
    else if (email.priority === "low") taskPriority = 4;

    const { data: task, error } = await supabase
      .from("exo_tasks")
      .insert({
        tenant_id: email.tenant_id,
        title: item.text.slice(0, 255),
        priority: taskPriority,
        status: "pending",
        due_date: item.due_date || null,
        metadata: {
          source: "email_analysis",
          email_id: email.id,
          from: email.from_email,
          subject: email.subject,
          date: email.date_received,
        },
      })
      .select("id")
      .single();

    if (error) {
      console.error("[TaskGenerator] Failed to create task:", {
        error: error.message,
        item: item.text,
      });
      continue;
    }

    if (task) {
      taskIds.push(task.id);
      created++;
    }
  }

  // Link tasks back to email
  if (taskIds.length > 0) {
    await supabase
      .from("exo_analyzed_emails")
      .update({ tasks_generated: taskIds })
      .eq("id", email.id);
  }

  return created;
}
