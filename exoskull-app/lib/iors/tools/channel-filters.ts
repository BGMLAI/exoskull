/**
 * Channel-aware tool filtering for IORS tools.
 *
 * Architecture: 25 CORE tools always available + dynamic TOOL PACKS
 * activated by intent keywords from the planner.
 *
 * Voice gets core tools (fast prompt processing for TTS).
 * Web gets core + relevant packs (based on message intent).
 * Async tasks get ALL tools (no filter).
 */

// ============================================================================
// CORE TOOLS — Always available on ALL channels (25 tools)
// ============================================================================

export const CORE_TOOL_NAMES = new Set([
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
  // Knowledge
  "search_knowledge",
  // Communication (basic)
  "send_sms",
  "send_email",
  // Planning
  "plan_action",
  // Mods / Apps (data logging)
  "log_mod_data",
  "get_mod_data",
  // Apps
  "build_app",
  "list_apps",
  // Emotion
  "tau_assess",
  // Email (basic)
  "search_emails",
  "email_summary",
  // Web
  "search_web",
  // Autonomy
  "request_autonomy",
  // Integrations
  "connect_rig",
  "list_integrations",
  // Discovery — always available so agent can find tools
  "discover_tools",
]);

// ============================================================================
// TOOL PACKS — Activated by intent keywords
// ============================================================================

export const TOOL_PACKS: Record<string, Set<string>> = {
  email: new Set([
    "search_emails",
    "read_email",
    "email_summary",
    "email_follow_ups",
    "email_sender_info",
    "send_email",
  ]),
  calendar: new Set([
    "list_calendar_events",
    "create_calendar_event",
    "update_calendar_event",
    "delete_calendar_event",
    "check_availability",
  ]),
  contacts: new Set([
    "search_contacts",
    "list_contacts",
    "get_contact_details",
    "create_contact",
    "update_contact",
    "delete_contact",
  ]),
  google_tasks: new Set([
    "list_google_tasks",
    "create_google_task",
    "complete_google_task",
    "delete_google_task",
  ]),
  communication: new Set([
    "make_call",
    "send_sms",
    "send_email",
    "send_whatsapp",
    "send_messenger",
  ]),
  code: new Set([
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
  ]),
  social: new Set([
    "publish_page_post",
    "get_page_insights",
    "publish_instagram_post",
    "publish_instagram_reel",
    "send_instagram_dm",
    "publish_threads_post",
    "list_threads_posts",
    "reply_threads_post",
  ]),
  ads: new Set([
    "list_ad_campaigns",
    "get_ad_performance",
    "pause_ad_campaign",
    "enable_ad_campaign",
    "get_ad_account_summary",
    "list_fb_ad_campaigns",
    "get_fb_ad_performance",
    "create_fb_ad_campaign",
    "pause_fb_ad_campaign",
    "get_fb_ad_accounts",
  ]),
  analytics: new Set([
    "get_analytics_report",
    "get_analytics_realtime",
    "list_analytics_properties",
  ]),
  maps: new Set([
    "search_places",
    "get_place_details",
    "get_directions",
    "geocode_address",
  ]),
  health: new Set(["log_weight", "log_workout", "log_water"]),
  knowledge: new Set([
    "search_knowledge",
    "import_url",
    "list_documents",
    "get_document_content",
    "analyze_knowledge",
  ]),
  drive: new Set(["upload_drive_file", "create_drive_folder"]),
  mcp_bridge: new Set([
    "github_list_prs",
    "github_create_issue",
    "github_create_pr",
    "slack_send_message",
    "slack_read_channel",
    "notion_search",
    "notion_create_page",
  ]),
  autonomy: new Set([
    "propose_autonomy",
    "grant_autonomy",
    "revoke_autonomy",
    "list_autonomy",
    "request_autonomy",
    "autonomous_action",
  ]),
  dashboard: new Set(["update_canvas", "manage_canvas"]),
  self_config: new Set([
    "update_instructions",
    "update_behavior",
    "modify_own_config",
    "modify_own_prompt",
    "modify_loop_config",
  ]),
  debate: new Set(["start_debate"]),
  values: new Set(["manage_values", "view_value_tree"]),
  feedback: new Set(["submit_feedback", "get_feedback_summary"]),
  quests: new Set(["create_quest", "list_quests"]),
  apps: new Set(["build_app", "list_apps", "app_log_data", "app_get_data"]),
  planning: new Set([
    "plan_action",
    "schedule_action",
    "list_planned_actions",
    "cancel_planned_action",
    "delegate_complex_task",
    "async_think",
  ]),
};

/** Map keywords from planner/user message to tool pack names */
const KEYWORD_TO_PACK: Record<string, string[]> = {
  // English
  email: ["email"],
  mail: ["email"],
  gmail: ["email"],
  calendar: ["calendar"],
  meeting: ["calendar"],
  schedule: ["calendar"],
  contact: ["contacts"],
  phone: ["contacts", "communication"],
  call: ["communication"],
  sms: ["communication"],
  whatsapp: ["communication"],
  code: ["code"],
  deploy: ["code"],
  programming: ["code"],
  bug: ["code"],
  api: ["code"],
  git: ["code", "mcp_bridge"],
  facebook: ["social", "ads"],
  instagram: ["social"],
  threads: ["social"],
  ads: ["ads"],
  campaign: ["ads"],
  advertising: ["ads"],
  analytics: ["analytics"],
  metrics: ["analytics"],
  report: ["analytics"],
  map: ["maps"],
  directions: ["maps"],
  places: ["maps"],
  health: ["health"],
  weight: ["health"],
  workout: ["health"],
  exercise: ["health"],
  knowledge: ["knowledge"],
  document: ["knowledge"],
  import: ["knowledge"],
  drive: ["drive"],
  file: ["drive"],
  github: ["mcp_bridge"],
  slack: ["mcp_bridge"],
  notion: ["mcp_bridge"],
  autonomy: ["autonomy"],
  permission: ["autonomy"],
  dashboard: ["dashboard"],
  canvas: ["dashboard"],
  config: ["self_config"],
  settings: ["self_config"],
  debate: ["debate"],
  strategy: ["debate", "knowledge"],
  values: ["values"],
  quest: ["quests"],
  app: ["apps"],
  build: ["apps"],
  zbuduj: ["apps"],
  zrób: ["apps"],
  stwórz: ["apps"],
  tracker: ["apps"],
  plan: ["planning"],
  delegate: ["planning"],
  // Polish
  zadanie: ["planning"],
  cel: ["quests"],
  email_pl: ["email"],
  kalendarz: ["calendar"],
  kontakt: ["contacts"],
  dzwoń: ["communication"],
  kod: ["code"],
  wdróż: ["code"],
  reklama: ["ads"],
  analityka: ["analytics"],
  mapa: ["maps"],
  zdrowie: ["health"],
  wiedza: ["knowledge"],
  plik: ["drive"],
  uprawnienia: ["autonomy"],
  debata: ["debate"],
  wartości: ["values"],
  aplikacja: ["apps"],
};

// ============================================================================
// VOICE TOOLS — Core + essential voice packs
// ============================================================================

export const VOICE_TOOL_NAMES = new Set([
  ...CORE_TOOL_NAMES,
  // Voice essentials not in core
  "search_contacts",
  "list_calendar_events",
  "create_calendar_event",
  "list_google_tasks",
  "create_google_task",
  "complete_google_task",
  "search_places",
  "get_directions",
  "log_weight",
  "log_workout",
  "make_call",
]);

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get tool packs matching a set of keywords.
 */
export function getToolPacksForKeywords(keywords: string[]): Set<string> {
  const tools = new Set<string>();

  for (const keyword of keywords) {
    const lower = keyword.toLowerCase();
    const packs = KEYWORD_TO_PACK[lower] || [];
    for (const packName of packs) {
      const pack = TOOL_PACKS[packName];
      if (pack) {
        for (const tool of pack) {
          tools.add(tool);
        }
      }
    }
  }

  return tools;
}

/**
 * Get the tool filter set for a given channel.
 *
 * @param channel - Communication channel
 * @param isAsync - Whether this is an async background task
 * @param intentKeywords - Optional keywords from planner for smart pack loading
 * @returns Set of tool names to include, or null = ALL tools (no filter).
 */
export function getToolFilterForChannel(
  channel: string,
  isAsync?: boolean,
  intentKeywords?: string[],
): Set<string> | null {
  // Async tasks get all tools (no filter)
  if (isAsync) return null;

  if (channel === "voice") return VOICE_TOOL_NAMES;

  // Web + other channels: core + relevant packs
  const tools = new Set(CORE_TOOL_NAMES);

  // Add packs based on intent keywords
  if (intentKeywords && intentKeywords.length > 0) {
    const packTools = getToolPacksForKeywords(intentKeywords);
    for (const tool of packTools) {
      tools.add(tool);
    }
  } else {
    // No keywords — add common web packs
    const defaultPacks = [
      "email",
      "calendar",
      "contacts",
      // "code" removed — activated only by explicit code keywords (bug, deploy, etc.)
      "knowledge",
      "mcp_bridge",
      "apps",
      "planning",
      "dashboard",
      "self_config",
      "feedback",
    ];
    for (const packName of defaultPacks) {
      const pack = TOOL_PACKS[packName];
      if (pack) {
        for (const tool of pack) {
          tools.add(tool);
        }
      }
    }
  }

  return tools;
}
