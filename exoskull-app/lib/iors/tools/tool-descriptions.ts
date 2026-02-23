/**
 * Dynamic Tool Description Generator
 *
 * Generates tool descriptions from the actual registry, grouped by category.
 * Replaces the hardcoded 67-tool list in system-prompt.ts.
 */

import { IORS_EXTENSION_TOOLS, type ToolDefinition } from "./index";
import { getDynamicToolsForTenant } from "./dynamic-handler";

/** Tool category mapping — tool name prefix or explicit mapping */
const TOOL_CATEGORIES: Record<string, string[]> = {
  Komunikacja: [
    "make_call",
    "send_sms",
    "send_email",
    "send_whatsapp",
    "send_messenger",
  ],
  "Zadania i cele": [
    "add_task",
    "list_tasks",
    "complete_task",
    "define_goal",
    "log_goal_progress",
    "check_goals",
    "create_quest",
    "list_quests",
  ],
  Email: [
    "search_emails",
    "read_email",
    "email_summary",
    "email_follow_ups",
    "email_sender_info",
  ],
  "Pamięć i wiedza": [
    "get_daily_summary",
    "correct_daily_summary",
    "search_memory",
    "search_knowledge",
    "import_url",
    "analyze_knowledge",
    "list_documents",
    "get_document_content",
  ],
  "Trackery / Mody": [
    "log_mod_data",
    "get_mod_data",
    "install_mod",
    "create_mod",
  ],
  Planowanie: [
    "plan_action",
    "list_planned_actions",
    "cancel_planned_action",
    "delegate_complex_task",
    "async_think",
    "schedule_action",
  ],
  Autonomia: [
    "propose_autonomy",
    "grant_autonomy",
    "revoke_autonomy",
    "list_autonomy",
    "request_autonomy",
    "autonomous_action",
  ],
  Aplikacje: ["build_app", "list_apps", "app_log_data", "app_get_data"],
  Dashboard: ["update_canvas", "manage_canvas"],
  "Osobowość i emocje": ["adjust_personality", "tau_assess"],
  Samomodyfikacja: [
    "modify_own_config",
    "modify_own_prompt",
    "modify_loop_config",
    "update_instructions",
    "update_behavior",
  ],
  Web: ["search_web", "fetch_webpage"],
  Debaty: ["start_debate"],
  Wartości: ["manage_values", "view_value_tree"],
  "Google Calendar": [
    "list_calendar_events",
    "create_calendar_event",
    "update_calendar_event",
    "delete_calendar_event",
    "check_availability",
  ],
  "Google Tasks": [
    "list_google_tasks",
    "create_google_task",
    "complete_google_task",
    "delete_google_task",
  ],
  "Google Contacts": [
    "search_contacts",
    "list_contacts",
    "get_contact_details",
    "create_contact",
    "update_contact",
    "delete_contact",
  ],
  "Google Drive": ["upload_drive_file", "create_drive_folder"],
  "Google Fit": ["log_weight", "log_workout", "log_water"],
  "Google Maps": [
    "search_places",
    "get_place_details",
    "get_directions",
    "geocode_address",
  ],
  "Google Ads": [
    "list_ad_campaigns",
    "get_ad_performance",
    "pause_ad_campaign",
    "enable_ad_campaign",
    "get_ad_account_summary",
  ],
  "Google Analytics": [
    "get_analytics_report",
    "get_analytics_realtime",
    "list_analytics_properties",
  ],
  Facebook: [
    "publish_page_post",
    "get_page_insights",
    "list_fb_ad_campaigns",
    "get_fb_ad_performance",
    "create_fb_ad_campaign",
    "pause_fb_ad_campaign",
    "get_fb_ad_accounts",
  ],
  Instagram: [
    "publish_instagram_post",
    "publish_instagram_reel",
    "send_instagram_dm",
  ],
  Threads: ["publish_threads_post", "list_threads_posts", "reply_threads_post"],
  "Kod i VPS": [
    "code_read_file",
    "code_write_file",
    "code_edit_file",
    "code_bash",
    "code_glob",
    "code_grep",
    "code_git",
    "code_tree",
    "code_web_search",
    "code_web_fetch",
    "code_deploy",
    "code_list_skills",
    "code_load_skill",
    "code_load_agent",
    "execute_code",
    "generate_fullstack_app",
    "modify_code",
    "run_tests",
    "deploy_app",
  ],
  "MCP Bridge": [
    "github_list_prs",
    "github_create_issue",
    "github_create_pr",
    "slack_send_message",
    "slack_read_channel",
    "notion_search",
    "notion_create_page",
  ],
  Integracje: ["connect_rig", "list_integrations"],
  Feedback: ["submit_feedback", "get_feedback_summary"],
  Bezpieczeństwo: ["set_emergency_contact", "verify_emergency_contact"],
  Umiejętności: ["accept_skill_suggestion", "dismiss_skill_suggestion"],
};

/**
 * Build a categorized tool description block for system prompt injection.
 * Only includes tools that are actually in the provided filter set.
 */
export function buildToolDescriptions(filterSet?: Set<string> | null): string {
  const allToolNames = new Set(
    IORS_EXTENSION_TOOLS.map((t) => t.definition.name),
  );
  const categorized = new Set<string>();
  const sections: string[] = [];

  for (const [category, toolNames] of Object.entries(TOOL_CATEGORIES)) {
    const available = toolNames.filter((name) => {
      if (filterSet && !filterSet.has(name)) return false;
      return allToolNames.has(name);
    });

    if (available.length === 0) continue;

    available.forEach((n) => categorized.add(n));

    // Get descriptions from actual tool definitions
    const toolDescs = available.map((name) => {
      const tool = IORS_EXTENSION_TOOLS.find((t) => t.definition.name === name);
      const desc = tool?.definition.description || name;
      // Truncate long descriptions for prompt efficiency
      const shortDesc = desc.length > 80 ? desc.slice(0, 77) + "..." : desc;
      return `- ${name} — ${shortDesc}`;
    });

    sections.push(
      `### ${category} (${available.length})\n${toolDescs.join("\n")}`,
    );
  }

  // Uncategorized tools
  const uncategorized = IORS_EXTENSION_TOOLS.filter((t) => {
    if (categorized.has(t.definition.name)) return false;
    if (filterSet && !filterSet.has(t.definition.name)) return false;
    return true;
  }).map(
    (t) =>
      `- ${t.definition.name} — ${(t.definition.description || "").slice(0, 80)}`,
  );

  if (uncategorized.length > 0) {
    sections.push(
      `### Inne (${uncategorized.length})\n${uncategorized.join("\n")}`,
    );
  }

  const totalCount = sections.reduce(
    (sum, s) => sum + (s.match(/^- /gm) || []).length,
    0,
  );

  return `## NARZĘDZIA (${totalCount})\n\nUżywaj narzędzi BEZ pytania. Nie mów "czy mam dodać?" — po prostu dodaj.\nUżyj discover_tools aby znaleźć narzędzia po słowie kluczowym.\n\n${sections.join("\n\n")}`;
}

/**
 * Build tool descriptions including dynamic (tenant-specific) tools.
 */
export async function buildToolDescriptionsForTenant(
  tenantId: string,
  filterSet?: Set<string> | null,
): Promise<string> {
  const base = buildToolDescriptions(filterSet);

  try {
    const dynamicTools = await getDynamicToolsForTenant(tenantId);
    if (dynamicTools.length === 0) return base;

    const dynSection = dynamicTools
      .map(
        (t) =>
          `- dyn_${t.definition.name} — ${(t.definition.description || "").slice(0, 80)}`,
      )
      .join("\n");

    return `${base}\n\n### Dynamiczne (${dynamicTools.length})\n${dynSection}`;
  } catch {
    return base;
  }
}
