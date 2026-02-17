// =====================================================
// TODOIST CLIENT (Tasks, Projects, Labels)
// =====================================================

import { RigConnection } from "../types";

import { logger } from "@/lib/logger";
const TODOIST_API = "https://api.todoist.com/rest/v2";
const TODOIST_SYNC_API = "https://api.todoist.com/sync/v9";

// =====================================================
// TYPES
// =====================================================

export interface TodoistTask {
  id: string;
  project_id: string;
  section_id: string | null;
  content: string;
  description: string;
  is_completed: boolean;
  labels: string[];
  parent_id: string | null;
  order: number;
  priority: 1 | 2 | 3 | 4; // 4 = urgent, 1 = normal
  due: TodoistDue | null;
  url: string;
  comment_count: number;
  created_at: string;
  creator_id: string;
  assignee_id: string | null;
  assigner_id: string | null;
  duration: { amount: number; unit: "minute" | "day" } | null;
}

export interface TodoistDue {
  date: string; // YYYY-MM-DD
  string: string; // Human readable
  lang: string;
  is_recurring: boolean;
  datetime?: string; // ISO 8601 with time
  timezone?: string;
}

export interface TodoistProject {
  id: string;
  name: string;
  color: string;
  parent_id: string | null;
  order: number;
  comment_count: number;
  is_shared: boolean;
  is_favorite: boolean;
  is_inbox_project: boolean;
  is_team_inbox: boolean;
  view_style: "list" | "board";
  url: string;
}

export interface TodoistSection {
  id: string;
  project_id: string;
  order: number;
  name: string;
}

export interface TodoistLabel {
  id: string;
  name: string;
  color: string;
  order: number;
  is_favorite: boolean;
}

export interface TodoistComment {
  id: string;
  task_id?: string;
  project_id?: string;
  posted_at: string;
  content: string;
  attachment?: {
    file_name: string;
    file_type: string;
    file_url: string;
    resource_type: string;
  };
}

export interface TodoistUser {
  id: string;
  name: string;
  email: string;
}

export interface CreateTaskParams {
  content: string;
  description?: string;
  project_id?: string;
  section_id?: string;
  parent_id?: string;
  order?: number;
  labels?: string[];
  priority?: 1 | 2 | 3 | 4;
  due_string?: string; // "tomorrow", "every monday"
  due_date?: string; // YYYY-MM-DD
  due_datetime?: string; // ISO 8601
  due_lang?: string;
  assignee_id?: string;
  duration?: number;
  duration_unit?: "minute" | "day";
}

export interface UpdateTaskParams {
  content?: string;
  description?: string;
  labels?: string[];
  priority?: 1 | 2 | 3 | 4;
  due_string?: string;
  due_date?: string;
  due_datetime?: string;
  due_lang?: string;
  assignee_id?: string;
  duration?: number;
  duration_unit?: "minute" | "day";
}

// =====================================================
// CLIENT
// =====================================================

export class TodoistClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {},
    baseUrl: string = TODOIST_API,
  ): Promise<T> {
    const url = `${baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error("[TodoistClient] API error:", {
        status: response.status,
        endpoint,
        error,
      });
      throw new Error(`Todoist API error: ${response.status} - ${error}`);
    }

    // Some endpoints return 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // =====================================================
  // TASKS
  // =====================================================

  async getTasks(params?: {
    project_id?: string;
    section_id?: string;
    label?: string;
    filter?: string; // Todoist filter query
    ids?: string[];
  }): Promise<TodoistTask[]> {
    const searchParams = new URLSearchParams();
    if (params?.project_id)
      searchParams.append("project_id", params.project_id);
    if (params?.section_id)
      searchParams.append("section_id", params.section_id);
    if (params?.label) searchParams.append("label", params.label);
    if (params?.filter) searchParams.append("filter", params.filter);
    if (params?.ids) searchParams.append("ids", params.ids.join(","));

    const query = searchParams.toString();
    return this.fetch(`/tasks${query ? `?${query}` : ""}`);
  }

  async getTask(taskId: string): Promise<TodoistTask> {
    return this.fetch(`/tasks/${taskId}`);
  }

  async createTask(params: CreateTaskParams): Promise<TodoistTask> {
    return this.fetch("/tasks", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async updateTask(
    taskId: string,
    params: UpdateTaskParams,
  ): Promise<TodoistTask> {
    return this.fetch(`/tasks/${taskId}`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async completeTask(taskId: string): Promise<void> {
    return this.fetch(`/tasks/${taskId}/close`, { method: "POST" });
  }

  async reopenTask(taskId: string): Promise<void> {
    return this.fetch(`/tasks/${taskId}/reopen`, { method: "POST" });
  }

  async deleteTask(taskId: string): Promise<void> {
    return this.fetch(`/tasks/${taskId}`, { method: "DELETE" });
  }

  // =====================================================
  // PROJECTS
  // =====================================================

  async getProjects(): Promise<TodoistProject[]> {
    return this.fetch("/projects");
  }

  async getProject(projectId: string): Promise<TodoistProject> {
    return this.fetch(`/projects/${projectId}`);
  }

  async createProject(params: {
    name: string;
    parent_id?: string;
    color?: string;
    is_favorite?: boolean;
    view_style?: "list" | "board";
  }): Promise<TodoistProject> {
    return this.fetch("/projects", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async updateProject(
    projectId: string,
    params: {
      name?: string;
      color?: string;
      is_favorite?: boolean;
      view_style?: "list" | "board";
    },
  ): Promise<TodoistProject> {
    return this.fetch(`/projects/${projectId}`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    return this.fetch(`/projects/${projectId}`, { method: "DELETE" });
  }

  // =====================================================
  // SECTIONS
  // =====================================================

  async getSections(projectId?: string): Promise<TodoistSection[]> {
    const query = projectId ? `?project_id=${projectId}` : "";
    return this.fetch(`/sections${query}`);
  }

  async getSection(sectionId: string): Promise<TodoistSection> {
    return this.fetch(`/sections/${sectionId}`);
  }

  async createSection(params: {
    name: string;
    project_id: string;
    order?: number;
  }): Promise<TodoistSection> {
    return this.fetch("/sections", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async updateSection(
    sectionId: string,
    name: string,
  ): Promise<TodoistSection> {
    return this.fetch(`/sections/${sectionId}`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async deleteSection(sectionId: string): Promise<void> {
    return this.fetch(`/sections/${sectionId}`, { method: "DELETE" });
  }

  // =====================================================
  // LABELS
  // =====================================================

  async getLabels(): Promise<TodoistLabel[]> {
    return this.fetch("/labels");
  }

  async getLabel(labelId: string): Promise<TodoistLabel> {
    return this.fetch(`/labels/${labelId}`);
  }

  async createLabel(params: {
    name: string;
    color?: string;
    order?: number;
    is_favorite?: boolean;
  }): Promise<TodoistLabel> {
    return this.fetch("/labels", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async updateLabel(
    labelId: string,
    params: {
      name?: string;
      color?: string;
      order?: number;
      is_favorite?: boolean;
    },
  ): Promise<TodoistLabel> {
    return this.fetch(`/labels/${labelId}`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async deleteLabel(labelId: string): Promise<void> {
    return this.fetch(`/labels/${labelId}`, { method: "DELETE" });
  }

  // =====================================================
  // COMMENTS
  // =====================================================

  async getComments(
    params: { task_id: string } | { project_id: string },
  ): Promise<TodoistComment[]> {
    const searchParams = new URLSearchParams();
    if ("task_id" in params) searchParams.append("task_id", params.task_id);
    if ("project_id" in params)
      searchParams.append("project_id", params.project_id);
    return this.fetch(`/comments?${searchParams.toString()}`);
  }

  async getComment(commentId: string): Promise<TodoistComment> {
    return this.fetch(`/comments/${commentId}`);
  }

  async createComment(params: {
    content: string;
    task_id?: string;
    project_id?: string;
  }): Promise<TodoistComment> {
    return this.fetch("/comments", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async updateComment(
    commentId: string,
    content: string,
  ): Promise<TodoistComment> {
    return this.fetch(`/comments/${commentId}`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  }

  async deleteComment(commentId: string): Promise<void> {
    return this.fetch(`/comments/${commentId}`, { method: "DELETE" });
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  /**
   * Get all active (non-completed) tasks
   */
  async getActiveTasks(): Promise<TodoistTask[]> {
    return this.getTasks();
  }

  /**
   * Get tasks due today
   */
  async getTodayTasks(): Promise<TodoistTask[]> {
    return this.getTasks({ filter: "today" });
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(): Promise<TodoistTask[]> {
    return this.getTasks({ filter: "overdue" });
  }

  /**
   * Get tasks for next 7 days
   */
  async getUpcomingTasks(): Promise<TodoistTask[]> {
    return this.getTasks({ filter: "7 days" });
  }

  /**
   * Get high priority tasks (priority 3 & 4)
   */
  async getHighPriorityTasks(): Promise<TodoistTask[]> {
    return this.getTasks({ filter: "p1 | p2" });
  }

  /**
   * Quick add task with natural language
   */
  async quickAdd(text: string): Promise<TodoistTask> {
    // Parse natural language - Todoist handles this server-side
    return this.createTask({ content: text, due_string: text });
  }

  /**
   * Get inbox project
   */
  async getInboxProject(): Promise<TodoistProject | null> {
    const projects = await this.getProjects();
    return projects.find((p) => p.is_inbox_project) || null;
  }

  // =====================================================
  // PRODUCTIVITY STATS (Sync API)
  // =====================================================

  async getProductivityStats(): Promise<{
    days_items: { date: string; total_completed: number }[];
    week_items: { date: string; total_completed: number }[];
    karma: number;
    karma_trend: string;
    goals: {
      daily_goal: number;
      weekly_goal: number;
      ignore_days: number[];
    };
  }> {
    return this.fetch("/completed/get_stats", {}, TODOIST_SYNC_API);
  }

  // =====================================================
  // DASHBOARD DATA
  // =====================================================

  async getDashboardData() {
    const [tasks, projects, labels, todayTasks, overdueTasks] =
      await Promise.all([
        this.getTasks().catch(() => []),
        this.getProjects().catch(() => []),
        this.getLabels().catch(() => []),
        this.getTodayTasks().catch(() => []),
        this.getOverdueTasks().catch(() => []),
      ]);

    // Sort by priority (4 = urgent first)
    const sortedTasks = [...tasks].sort((a, b) => b.priority - a.priority);

    return {
      summary: {
        totalTasks: tasks.length,
        todayCount: todayTasks.length,
        overdueCount: overdueTasks.length,
        projectCount: projects.length,
        labelCount: labels.length,
      },
      todayTasks: todayTasks.slice(0, 10).map((t) => ({
        id: t.id,
        content: t.content,
        priority: t.priority,
        due: t.due,
        project_id: t.project_id,
        url: t.url,
      })),
      overdueTasks: overdueTasks.slice(0, 5).map((t) => ({
        id: t.id,
        content: t.content,
        priority: t.priority,
        due: t.due,
        url: t.url,
      })),
      highPriority: sortedTasks
        .filter((t) => t.priority >= 3)
        .slice(0, 5)
        .map((t) => ({
          id: t.id,
          content: t.content,
          priority: t.priority,
          due: t.due,
          url: t.url,
        })),
      projects: projects.slice(0, 10).map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        is_inbox: p.is_inbox_project,
        url: p.url,
      })),
    };
  }
}

// =====================================================
// FACTORY
// =====================================================

export function createTodoistClient(
  connection: RigConnection,
): TodoistClient | null {
  if (!connection.access_token) return null;
  return new TodoistClient(connection.access_token);
}
