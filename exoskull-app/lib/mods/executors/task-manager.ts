// =====================================================
// TASK MANAGER MOD EXECUTOR
// Unified task management across Google Tasks + Notion + Todoist
// =====================================================

import { createClient } from '@supabase/supabase-js';
import { IModExecutor, ModInsight, ModAction, ModSlug } from '../types';
import { NotionClient, createNotionClient, NotionPage } from '../../rigs/notion/client';
import { TodoistClient, createTodoistClient, TodoistTask } from '../../rigs/todoist/client';
import { GoogleWorkspaceClient, createGoogleWorkspaceClient, GoogleTask } from '../../rigs/google-workspace/client';
import { RigConnection } from '../../rigs/types';

// =====================================================
// TYPES
// =====================================================

interface UnifiedTask {
  id: string;
  source: 'google' | 'notion' | 'todoist' | 'exoskull';
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  project?: string;
  labels?: string[];
  url?: string;
  createdAt: string;
  updatedAt?: string;
}

interface TaskManagerConfig {
  default_project?: string;
  auto_prioritize?: boolean;
  notion_database_id?: string;
  todoist_project_id?: string;
  google_tasklist_id?: string;
}

// =====================================================
// EXECUTOR
// =====================================================

export class TaskManagerExecutor implements IModExecutor {
  readonly slug: ModSlug = 'task-manager';

  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // =====================================================
  // PRIVATE HELPERS
  // =====================================================

  private async getRigConnection(tenantId: string, rigSlug: string): Promise<RigConnection | null> {
    const { data, error } = await this.supabase
      .from('exo_rig_connections')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('rig_slug', rigSlug)
      .eq('sync_status', 'success')
      .single();

    if (error || !data) return null;
    return data as RigConnection;
  }

  private async getNotionClient(tenantId: string): Promise<NotionClient | null> {
    const connection = await this.getRigConnection(tenantId, 'notion');
    return connection ? createNotionClient(connection) : null;
  }

  private async getTodoistClient(tenantId: string): Promise<TodoistClient | null> {
    const connection = await this.getRigConnection(tenantId, 'todoist');
    return connection ? createTodoistClient(connection) : null;
  }

  private async getGoogleWorkspaceClient(tenantId: string): Promise<GoogleWorkspaceClient | null> {
    const connection = await this.getRigConnection(tenantId, 'google-workspace');
    return connection ? createGoogleWorkspaceClient(connection) : null;
  }

  private async getConfig(tenantId: string): Promise<TaskManagerConfig> {
    const { data } = await this.supabase
      .from('exo_user_installations')
      .select('config')
      .eq('tenant_id', tenantId)
      .eq('registry_id', (
        await this.supabase
          .from('exo_registry')
          .select('id')
          .eq('slug', 'task-manager')
          .single()
      ).data?.id)
      .single();

    return (data?.config as TaskManagerConfig) || {};
  }

  // =====================================================
  // TASK NORMALIZATION
  // =====================================================

  private notionToUnified(page: NotionPage, notionClient: NotionClient): UnifiedTask {
    const title = notionClient.getPageTitle(page);

    // Try to extract status from common property names
    let status: UnifiedTask['status'] = 'todo';
    const statusProp = page.properties['Status'] || page.properties['status'];
    if (statusProp) {
      const statusValue = notionClient.getPropertyValue(statusProp)?.toString().toLowerCase() || '';
      if (statusValue.includes('done') || statusValue.includes('complete')) {
        status = 'done';
      } else if (statusValue.includes('progress') || statusValue.includes('doing')) {
        status = 'in_progress';
      }
    }

    // Try to extract priority
    let priority: UnifiedTask['priority'] = 'medium';
    const priorityProp = page.properties['Priority'] || page.properties['priority'];
    if (priorityProp) {
      const priorityValue = notionClient.getPropertyValue(priorityProp)?.toString().toLowerCase() || '';
      if (priorityValue.includes('urgent') || priorityValue.includes('p1')) {
        priority = 'urgent';
      } else if (priorityValue.includes('high') || priorityValue.includes('p2')) {
        priority = 'high';
      } else if (priorityValue.includes('low') || priorityValue.includes('p4')) {
        priority = 'low';
      }
    }

    // Try to extract due date
    let dueDate: string | undefined;
    const dateProp = page.properties['Date'] || page.properties['Due'] || page.properties['due'];
    if (dateProp) {
      const dateValue = notionClient.getPropertyValue(dateProp);
      if (typeof dateValue === 'string') dueDate = dateValue;
    }

    return {
      id: `notion:${page.id}`,
      source: 'notion',
      title,
      status,
      priority,
      dueDate,
      url: page.url,
      createdAt: page.created_time,
      updatedAt: page.last_edited_time,
    };
  }

  private todoistToUnified(task: TodoistTask): UnifiedTask {
    // Map Todoist priority (4=urgent, 1=normal) to our scale
    const priorityMap: Record<number, UnifiedTask['priority']> = {
      4: 'urgent',
      3: 'high',
      2: 'medium',
      1: 'low',
    };

    return {
      id: `todoist:${task.id}`,
      source: 'todoist',
      title: task.content,
      description: task.description || undefined,
      status: task.is_completed ? 'done' : 'todo',
      priority: priorityMap[task.priority] || 'medium',
      dueDate: task.due?.date,
      project: task.project_id,
      labels: task.labels,
      url: task.url,
      createdAt: task.created_at,
    };
  }

  private googleTaskToUnified(task: GoogleTask, taskListId: string): UnifiedTask {
    return {
      id: `google:${taskListId}:${task.id}`,
      source: 'google',
      title: task.title,
      description: task.notes || undefined,
      status: task.status === 'completed' ? 'done' : 'todo',
      priority: 'medium', // Google Tasks doesn't have priority
      dueDate: task.due?.split('T')[0], // Extract YYYY-MM-DD from RFC 3339
      url: task.selfLink,
      createdAt: task.updated, // Google Tasks only provides updated time
      updatedAt: task.updated,
    };
  }

  // =====================================================
  // INTERFACE IMPLEMENTATION
  // =====================================================

  async getData(tenantId: string): Promise<Record<string, unknown>> {
    const [googleClient, notionClient, todoistClient, config] = await Promise.all([
      this.getGoogleWorkspaceClient(tenantId),
      this.getNotionClient(tenantId),
      this.getTodoistClient(tenantId),
      this.getConfig(tenantId),
    ]);

    const tasks: UnifiedTask[] = [];
    const sources: string[] = [];
    const errors: string[] = [];

    // Fetch from Google Tasks (primary)
    if (googleClient) {
      sources.push('google');
      try {
        const taskListId = config.google_tasklist_id || '@default';
        const googleTasks = await googleClient.getActiveTasks(taskListId);
        tasks.push(...googleTasks.map((t) => this.googleTaskToUnified(t, taskListId)));
      } catch (err) {
        console.error('[TaskManager] Google Tasks fetch failed:', err);
        errors.push(`Google Tasks: ${(err as Error).message}`);
      }
    }

    // Fetch from Notion
    if (notionClient) {
      sources.push('notion');
      try {
        if (config.notion_database_id) {
          const notionPages = await notionClient.getAllDatabaseItems(config.notion_database_id);
          tasks.push(...notionPages.map((p) => this.notionToUnified(p, notionClient)));
        } else {
          // Search for task-like pages
          const searchResult = await notionClient.searchPages('task');
          tasks.push(...searchResult.slice(0, 50).map((p) => this.notionToUnified(p, notionClient)));
        }
      } catch (err) {
        console.error('[TaskManager] Notion fetch failed:', err);
        errors.push(`Notion: ${(err as Error).message}`);
      }
    }

    // Fetch from Todoist
    if (todoistClient) {
      sources.push('todoist');
      try {
        let todoistTasks: TodoistTask[];
        if (config.todoist_project_id) {
          todoistTasks = await todoistClient.getTasks({ project_id: config.todoist_project_id });
        } else {
          todoistTasks = await todoistClient.getTasks();
        }
        tasks.push(...todoistTasks.map((t) => this.todoistToUnified(t)));
      } catch (err) {
        console.error('[TaskManager] Todoist fetch failed:', err);
        errors.push(`Todoist: ${(err as Error).message}`);
      }
    }

    // Fetch from ExoSkull internal tasks
    try {
      const { data: exoTasks } = await this.supabase
        .from('exo_tasks')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (exoTasks) {
        sources.push('exoskull');
        tasks.push(
          ...exoTasks.map((t) => ({
            id: `exoskull:${t.id}`,
            source: 'exoskull' as const,
            title: t.title,
            description: t.description,
            status: t.status as UnifiedTask['status'],
            priority: (t.priority || 'medium') as UnifiedTask['priority'],
            dueDate: t.due_date,
            createdAt: t.created_at,
            updatedAt: t.updated_at,
          }))
        );
      }
    } catch (err) {
      console.error('[TaskManager] ExoSkull fetch failed:', err);
      errors.push(`ExoSkull: ${(err as Error).message}`);
    }

    // Sort by priority and due date
    const sortedTasks = tasks.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;

      // Then by due date (earlier first)
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    // Calculate stats
    const stats = {
      total: tasks.length,
      todo: tasks.filter((t) => t.status === 'todo').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      done: tasks.filter((t) => t.status === 'done').length,
      overdue: tasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done').length,
      high_priority: tasks.filter((t) => t.priority === 'urgent' || t.priority === 'high').length,
    };

    return {
      tasks: sortedTasks,
      stats,
      sources,
      errors: errors.length > 0 ? errors : undefined,
      last_sync: new Date().toISOString(),
    };
  }

  async getInsights(tenantId: string): Promise<ModInsight[]> {
    const data = await this.getData(tenantId);
    const tasks = data.tasks as UnifiedTask[];
    const stats = data.stats as Record<string, number>;
    const insights: ModInsight[] = [];

    // Overdue tasks alert
    if (stats.overdue > 0) {
      const overdueTasks = tasks.filter(
        (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done'
      );
      insights.push({
        type: 'alert',
        title: `${stats.overdue} overdue task${stats.overdue > 1 ? 's' : ''}`,
        message: `You have tasks past their due date: ${overdueTasks.slice(0, 3).map((t) => t.title).join(', ')}${overdueTasks.length > 3 ? '...' : ''}`,
        data: { task_ids: overdueTasks.map((t) => t.id) },
        created_at: new Date().toISOString(),
      });
    }

    // High priority tasks
    if (stats.high_priority > 3) {
      insights.push({
        type: 'warning',
        title: 'Many high-priority tasks',
        message: `You have ${stats.high_priority} urgent/high priority tasks. Consider delegating or rescheduling some.`,
        created_at: new Date().toISOString(),
      });
    }

    // Due today
    const dueToday = tasks.filter((t) => {
      if (!t.dueDate || t.status === 'done') return false;
      const due = new Date(t.dueDate);
      const today = new Date();
      return (
        due.getFullYear() === today.getFullYear() &&
        due.getMonth() === today.getMonth() &&
        due.getDate() === today.getDate()
      );
    });

    if (dueToday.length > 0) {
      insights.push({
        type: 'info',
        title: `${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today`,
        message: dueToday.slice(0, 3).map((t) => t.title).join(', '),
        created_at: new Date().toISOString(),
      });
    }

    // Productivity insight
    if (stats.done > 0) {
      const completionRate = Math.round((stats.done / stats.total) * 100);
      insights.push({
        type: completionRate > 50 ? 'success' : 'info',
        title: 'Task completion',
        message: `${completionRate}% completion rate (${stats.done}/${stats.total} tasks done)`,
        created_at: new Date().toISOString(),
      });
    }

    return insights;
  }

  async executeAction(
    tenantId: string,
    action: string,
    params: Record<string, unknown>
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
      switch (action) {
        case 'create_task': {
          const { title, description, priority, due_date, source } = params as {
            title: string;
            description?: string;
            priority?: string;
            due_date?: string;
            source?: 'google' | 'todoist' | 'notion' | 'exoskull';
          };

          const targetSource = source || 'google'; // Default to Google Tasks

          if (targetSource === 'google') {
            const client = await this.getGoogleWorkspaceClient(tenantId);
            const config = await this.getConfig(tenantId);
            if (!client) return { success: false, error: 'Google Workspace not connected' };

            const taskListId = config.google_tasklist_id || '@default';
            const task = await client.createTask(taskListId, {
              title,
              notes: description,
              due: due_date ? `${due_date}T00:00:00.000Z` : undefined,
            });

            return { success: true, result: { id: `google:${taskListId}:${task.id}`, task } };
          }

          if (targetSource === 'todoist') {
            const client = await this.getTodoistClient(tenantId);
            if (!client) return { success: false, error: 'Todoist not connected' };

            const priorityMap: Record<string, 1 | 2 | 3 | 4> = {
              urgent: 4, high: 3, medium: 2, low: 1,
            };

            const task = await client.createTask({
              content: title,
              description,
              priority: priorityMap[priority || 'medium'],
              due_date,
            });

            return { success: true, result: { id: `todoist:${task.id}`, task } };
          }

          if (targetSource === 'notion') {
            const client = await this.getNotionClient(tenantId);
            const config = await this.getConfig(tenantId);
            if (!client) return { success: false, error: 'Notion not connected' };
            if (!config.notion_database_id) return { success: false, error: 'Notion database not configured' };

            const page = await client.createTask(config.notion_database_id, title, {
              priority,
              dueDate: due_date,
            });

            return { success: true, result: { id: `notion:${page.id}`, page } };
          }

          // Default: create in ExoSkull
          const { data, error } = await this.supabase
            .from('exo_tasks')
            .insert({
              tenant_id: tenantId,
              title,
              description,
              priority: priority || 'medium',
              due_date,
              status: 'pending',
            })
            .select()
            .single();

          if (error) throw error;
          return { success: true, result: { id: `exoskull:${data.id}`, task: data } };
        }

        case 'complete_task': {
          const { task_id } = params as { task_id: string };
          const parts = task_id.split(':');
          const source = parts[0];

          if (source === 'google') {
            // Format: google:taskListId:taskId
            const [, taskListId, taskId] = parts;
            const client = await this.getGoogleWorkspaceClient(tenantId);
            if (!client) return { success: false, error: 'Google Workspace not connected' };
            await client.completeTask(taskListId, taskId);
            return { success: true };
          }

          if (source === 'todoist') {
            const [, id] = parts;
            const client = await this.getTodoistClient(tenantId);
            if (!client) return { success: false, error: 'Todoist not connected' };
            await client.completeTask(id);
            return { success: true };
          }

          if (source === 'notion') {
            const [, id] = parts;
            const client = await this.getNotionClient(tenantId);
            if (!client) return { success: false, error: 'Notion not connected' };
            await client.completeTask(id);
            return { success: true };
          }

          if (source === 'exoskull') {
            const [, id] = parts;
            const { error } = await this.supabase
              .from('exo_tasks')
              .update({ status: 'done', completed_at: new Date().toISOString() })
              .eq('id', id)
              .eq('tenant_id', tenantId);

            if (error) throw error;
            return { success: true };
          }

          return { success: false, error: 'Unknown task source' };
        }

        case 'update_priority': {
          const { task_id, priority } = params as { task_id: string; priority: string };
          const [source, id] = task_id.split(':');

          if (source === 'todoist') {
            const client = await this.getTodoistClient(tenantId);
            if (!client) return { success: false, error: 'Todoist not connected' };

            const priorityMap: Record<string, 1 | 2 | 3 | 4> = {
              urgent: 4, high: 3, medium: 2, low: 1,
            };
            await client.updateTask(id, { priority: priorityMap[priority] });
            return { success: true };
          }

          if (source === 'exoskull') {
            const { error } = await this.supabase
              .from('exo_tasks')
              .update({ priority })
              .eq('id', id)
              .eq('tenant_id', tenantId);

            if (error) throw error;
            return { success: true };
          }

          return { success: false, error: 'Priority update not supported for this source' };
        }

        case 'sync': {
          // Force refresh data from all sources
          const data = await this.getData(tenantId);
          return { success: true, result: { synced: (data.tasks as unknown[]).length } };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      console.error(`[TaskManager] Action ${action} failed:`, err);
      return { success: false, error: (err as Error).message };
    }
  }

  getActions(): ModAction[] {
    return [
      {
        slug: 'create_task',
        name: 'Create Task',
        description: 'Create a new task in Google Tasks, Todoist, Notion, or ExoSkull',
        params_schema: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Task description' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            due_date: { type: 'string', format: 'date', description: 'Due date (YYYY-MM-DD)' },
            source: { type: 'string', enum: ['google', 'todoist', 'notion', 'exoskull'], default: 'google' },
          },
        },
      },
      {
        slug: 'complete_task',
        name: 'Complete Task',
        description: 'Mark a task as completed',
        params_schema: {
          type: 'object',
          required: ['task_id'],
          properties: {
            task_id: { type: 'string', description: 'Task ID (format: source:id or source:listId:id for Google)' },
          },
        },
      },
      {
        slug: 'update_priority',
        name: 'Update Priority',
        description: 'Change task priority',
        params_schema: {
          type: 'object',
          required: ['task_id', 'priority'],
          properties: {
            task_id: { type: 'string', description: 'Task ID (format: source:id)' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          },
        },
      },
      {
        slug: 'sync',
        name: 'Sync Tasks',
        description: 'Force sync tasks from all connected sources',
        params_schema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }
}

// =====================================================
// FACTORY
// =====================================================

export function createTaskManagerExecutor(): TaskManagerExecutor {
  return new TaskManagerExecutor();
}
