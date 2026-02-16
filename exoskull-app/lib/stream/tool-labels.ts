/**
 * Human-readable Polish labels for IORS tool names.
 * Used by AgentAction component in the unified stream.
 */

const TOOL_LABELS: Record<string, string> = {
  // Memory & Knowledge
  recall_memory: "Przeszukuję pamięć...",
  save_memory: "Zapisuję do pamięci...",
  search_knowledge: "Szukam w bazie wiedzy...",
  get_daily_summary: "Pobieram podsumowanie dnia...",
  correct_daily_summary: "Aktualizuję podsumowanie...",

  // Tasks
  add_task: "Dodaję zadanie...",
  list_tasks: "Sprawdzam zadania...",
  complete_task: "Oznaczam jako ukończone...",

  // Goals
  define_goal: "Definiuję cel...",
  log_goal_progress: "Zapisuję postęp...",
  check_goals: "Sprawdzam cele...",

  // Health
  log_health: "Zapisuję dane zdrowotne...",
  get_health_summary: "Analizuję zdrowie...",
  log_mod_data: "Zapisuję dane modułu...",
  get_mod_data: "Pobieram dane modułu...",

  // Communication
  make_call: "Inicjuję połączenie...",
  send_sms: "Wysyłam SMS...",
  send_email: "Wysyłam email...",
  send_whatsapp: "Wysyłam WhatsApp...",
  send_messenger: "Wysyłam Messenger...",

  // Planning
  plan_action: "Planuję akcję...",
  list_planned_actions: "Sprawdzam zaplanowane...",
  cancel_planned_action: "Anuluję akcję...",
  delegate_complex_task: "Deleguję złożone zadanie...",
  async_think: "Analizuję dogłębnie...",

  // Mods & Skills
  install_mod: "Instaluję moduł...",
  create_mod: "Tworzę moduł...",

  // Canvas & Dashboard
  manage_canvas: "Aktualizuję dashboard...",
  modify_dashboard: "Modyfikuję dashboard...",

  // Integrations
  composio_connect: "Łączę integrację...",
  composio_disconnect: "Odłączam integrację...",
  composio_list_apps: "Sprawdzam aplikacje...",
  composio_action: "Wykonuję akcję...",

  // Autonomy
  propose_intervention: "Proponuję interwencję...",
  connect_rig: "Łączę urządzenie...",
  list_integrations: "Sprawdzam integracje...",
};

export function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] || `Narzędzie: ${toolName}...`;
}
