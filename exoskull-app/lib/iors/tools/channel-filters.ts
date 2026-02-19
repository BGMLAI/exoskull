/**
 * Channel-aware tool filtering for IORS tools.
 *
 * Extracted from conversation-handler.ts to be shared by
 * both the legacy pipeline and the Agent SDK MCP server.
 *
 * Voice gets ~18 essential tools (fast prompt processing for TTS).
 * Web gets ~37 tools (full dashboard experience).
 * Other channels get web tools by default.
 * Async tasks get ALL tools (no filter).
 */

// ============================================================================
// VOICE TOOLS (~18 essential tools for fast phone conversations)
// ============================================================================

export const VOICE_TOOL_NAMES = new Set([
  // Tasks
  "add_task",
  "complete_task",
  "list_tasks",
  // Memory & Context
  "search_memory",
  "get_daily_summary",
  "correct_daily_summary",
  // Goals
  "define_goal",
  "log_goal_progress",
  "check_goals",
  // Planning
  "plan_action",
  // Knowledge
  "search_knowledge",
  // Communication
  "send_sms",
  "send_email",
  // Mods / Apps (data logging)
  "log_mod_data",
  "get_mod_data",
  // Emotion
  "tau_assess",
  // Email
  "search_emails",
  "email_summary",
  // Google Contacts
  "search_contacts",
  // Google Calendar
  "list_calendar_events",
  "create_calendar_event",
  // Google Tasks
  "list_google_tasks",
  "create_google_task",
  "complete_google_task",
  // Google Maps
  "search_places",
  "get_directions",
  // Google Fit write
  "log_weight",
  "log_workout",
  // Integrations
  "connect_rig",
  "list_integrations",
]);

// ============================================================================
// WEB TOOLS (~37 most-used tools — 100 tools overwhelms all providers)
// ============================================================================

export const WEB_TOOL_NAMES = new Set([
  // Tasks & Planning
  "add_task",
  "complete_task",
  "list_tasks",
  "plan_action",
  "schedule_action",
  // Memory & Context
  "search_memory",
  "get_daily_summary",
  "correct_daily_summary",
  // Goals (Tyrolka)
  "define_goal",
  "log_goal_progress",
  "check_goals",
  "create_quest",
  "list_quests",
  // Knowledge
  "search_knowledge",
  "import_url",
  "list_documents",
  "get_document_content",
  "analyze_knowledge",
  // Communication
  "send_sms",
  "send_email",
  // Apps / Mods
  "build_app",
  "list_apps",
  "app_log_data",
  "app_get_data",
  "log_mod_data",
  "get_mod_data",
  // Email
  "search_emails",
  "email_summary",
  "email_follow_ups",
  "email_sender_info",
  // Emotion & Personality
  "tau_assess",
  // Web
  "search_web",
  "fetch_webpage",
  // Canvas
  "update_canvas",
  // Code Gen
  "execute_code",
  // Self-Config
  "update_instructions",
  "update_behavior",
  // Autonomy
  "request_autonomy",
  "autonomous_action",
  // Feedback
  "submit_feedback",
  // Code Execution (VPS)
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
  // MCP Bridge (GitHub, Slack, Notion)
  "github_list_prs",
  "github_create_issue",
  "github_create_pr",
  "slack_send_message",
  "slack_read_channel",
  "notion_search",
  "notion_create_page",
  // Google Contacts (read + write)
  "search_contacts",
  "list_contacts",
  "get_contact_details",
  "create_contact",
  "update_contact",
  "delete_contact",
  // Google Calendar
  "list_calendar_events",
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
  "check_availability",
  // Google Tasks
  "list_google_tasks",
  "create_google_task",
  "complete_google_task",
  "delete_google_task",
  // Google Drive (read + write)
  "upload_drive_file",
  "create_drive_folder",
  // Google Fit (read + write)
  "log_weight",
  "log_workout",
  "log_water",
  // Google Maps & Places
  "search_places",
  "get_place_details",
  "get_directions",
  "geocode_address",
  // Google Ads
  "list_ad_campaigns",
  "get_ad_performance",
  "pause_ad_campaign",
  "enable_ad_campaign",
  "get_ad_account_summary",
  // Google Analytics
  "get_analytics_report",
  "get_analytics_realtime",
  "list_analytics_properties",
  // Facebook
  "publish_page_post",
  "get_page_insights",
  "list_fb_ad_campaigns",
  "get_fb_ad_performance",
  "create_fb_ad_campaign",
  "pause_fb_ad_campaign",
  "get_fb_ad_accounts",
  // Instagram
  "publish_instagram_post",
  "publish_instagram_reel",
  "send_instagram_dm",
  // Threads
  "publish_threads_post",
  "list_threads_posts",
  "reply_threads_post",
  // Integrations (app autodetekcja)
  "connect_rig",
  "composio_connect",
  "list_integrations",
  "composio_list_apps",
]);

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the tool filter set for a given channel.
 *
 * @returns Set of tool names to include, or null = ALL tools (no filter).
 */
export function getToolFilterForChannel(
  channel: string,
  isAsync?: boolean,
): Set<string> | null {
  // Async tasks get all tools (no filter) — they run in background with no time pressure
  if (isAsync) return null;

  if (channel === "voice") return VOICE_TOOL_NAMES;

  // All other channels (web_chat, telegram, slack, discord, etc.) use web tool set
  return WEB_TOOL_NAMES;
}
