import { invoke } from "@tauri-apps/api/core";

// Typed wrappers for Tauri invoke() calls

export interface AuthState {
  token: string | null;
  tenant_id: string | null;
  user_email: string | null;
  is_authenticated: boolean;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  status: string;
  progress?: number;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  status: string;
  priority?: string;
  due_date?: string;
}

export interface RecallSettings {
  enabled: boolean;
  interval_secs: number;
  storage_mode: string;
  exclusions: { id: number; pattern: string; exclusion_type: string }[];
}

export interface MouseConfig {
  button_dictation: number;
  button_tts: number;
  button_chat: number;
}

export interface AppSettings {
  auto_start: boolean;
  theme: string;
  tts_provider: string;
  recall: RecallSettings;
  mouse: MouseConfig;
}

// Auth
export const login = (email: string, password: string) =>
  invoke<AuthState>("login", { email, password });

export const logout = () => invoke("logout");

export const getAuthStatus = () => invoke<AuthState>("get_auth_status");

// Chat
export const sendChatMessage = (message: string) =>
  invoke<string>("send_chat_message", { message });

// Goals
export const getGoals = () => invoke<Goal[]>("get_goals");
export const createGoal = (title: string, description?: string) =>
  invoke<Goal>("create_goal", { title, description });

// Tasks
export const getTasks = () => invoke<Task[]>("get_tasks");

// Knowledge
export const uploadFile = (filePath: string) =>
  invoke("upload_file", { filePath });

export const searchKnowledge = (query: string) =>
  invoke("search_knowledge", { query });

// Recall
export const startRecall = () => invoke("start_recall");
export const stopRecall = () => invoke("stop_recall");
export const getRecallSettings = () =>
  invoke<RecallSettings>("get_recall_settings");

// Settings
export const getSettings = () => invoke<AppSettings>("get_settings");
export const updateSettings = (settings: Partial<AppSettings>) =>
  invoke("update_settings", settings);
