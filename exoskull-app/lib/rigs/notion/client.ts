// =====================================================
// NOTION CLIENT (Pages, Databases, Blocks)
// =====================================================

import { RigConnection } from '../types';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// =====================================================
// TYPES
// =====================================================

export interface NotionPage {
  id: string;
  object: 'page';
  created_time: string;
  last_edited_time: string;
  archived: boolean;
  url: string;
  parent: {
    type: 'database_id' | 'page_id' | 'workspace';
    database_id?: string;
    page_id?: string;
  };
  properties: Record<string, NotionProperty>;
  icon?: { type: 'emoji' | 'external'; emoji?: string; external?: { url: string } };
}

export interface NotionDatabase {
  id: string;
  object: 'database';
  created_time: string;
  last_edited_time: string;
  title: NotionRichText[];
  description: NotionRichText[];
  url: string;
  properties: Record<string, NotionPropertyConfig>;
  archived: boolean;
  is_inline: boolean;
}

export interface NotionBlock {
  id: string;
  object: 'block';
  type: string;
  created_time: string;
  last_edited_time: string;
  has_children: boolean;
  archived: boolean;
  // Block-specific content based on type
  [key: string]: unknown;
}

export interface NotionRichText {
  type: 'text' | 'mention' | 'equation';
  text?: { content: string; link?: { url: string } };
  plain_text: string;
  href?: string;
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: string;
  };
}

export interface NotionProperty {
  id: string;
  type: string;
  // Type-specific values
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  number?: number;
  select?: { id: string; name: string; color: string };
  multi_select?: { id: string; name: string; color: string }[];
  date?: { start: string; end?: string; time_zone?: string };
  checkbox?: boolean;
  url?: string;
  email?: string;
  phone_number?: string;
  status?: { id: string; name: string; color: string };
}

export interface NotionPropertyConfig {
  id: string;
  name: string;
  type: string;
}

export interface NotionUser {
  id: string;
  object: 'user';
  type: 'person' | 'bot';
  name?: string;
  avatar_url?: string;
  person?: { email: string };
}

export interface NotionSearchResult {
  object: 'list';
  results: (NotionPage | NotionDatabase)[];
  next_cursor: string | null;
  has_more: boolean;
}

// =====================================================
// CLIENT
// =====================================================

export class NotionClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${NOTION_API}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[NotionClient] API error:', {
        status: response.status,
        endpoint,
        error,
      });
      throw new Error(`Notion API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // =====================================================
  // SEARCH
  // =====================================================

  async search(query: string, filter?: 'page' | 'database'): Promise<NotionSearchResult> {
    const body: Record<string, unknown> = { query };

    if (filter) {
      body.filter = { value: filter, property: 'object' };
    }

    return this.fetch('/search', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async searchPages(query: string): Promise<NotionPage[]> {
    const result = await this.search(query, 'page');
    return result.results as NotionPage[];
  }

  async searchDatabases(query: string): Promise<NotionDatabase[]> {
    const result = await this.search(query, 'database');
    return result.results as NotionDatabase[];
  }

  // =====================================================
  // PAGES
  // =====================================================

  async getPage(pageId: string): Promise<NotionPage> {
    return this.fetch(`/pages/${pageId}`);
  }

  async createPage(params: {
    parent: { database_id: string } | { page_id: string };
    properties: Record<string, unknown>;
    children?: unknown[];
    icon?: { emoji: string } | { external: { url: string } };
  }): Promise<NotionPage> {
    return this.fetch('/pages', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async updatePage(
    pageId: string,
    properties: Record<string, unknown>,
    archived?: boolean
  ): Promise<NotionPage> {
    const body: Record<string, unknown> = { properties };
    if (archived !== undefined) body.archived = archived;

    return this.fetch(`/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async archivePage(pageId: string): Promise<NotionPage> {
    return this.updatePage(pageId, {}, true);
  }

  // =====================================================
  // DATABASES
  // =====================================================

  async getDatabase(databaseId: string): Promise<NotionDatabase> {
    return this.fetch(`/databases/${databaseId}`);
  }

  async queryDatabase(
    databaseId: string,
    params?: {
      filter?: Record<string, unknown>;
      sorts?: { property: string; direction: 'ascending' | 'descending' }[];
      start_cursor?: string;
      page_size?: number;
    }
  ): Promise<{ results: NotionPage[]; next_cursor: string | null; has_more: boolean }> {
    return this.fetch(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
  }

  async getAllDatabaseItems(databaseId: string): Promise<NotionPage[]> {
    const allItems: NotionPage[] = [];
    let cursor: string | null = null;

    do {
      const response = await this.queryDatabase(databaseId, {
        start_cursor: cursor || undefined,
        page_size: 100,
      });
      allItems.push(...response.results);
      cursor = response.next_cursor;
    } while (cursor);

    return allItems;
  }

  // =====================================================
  // BLOCKS (Page Content)
  // =====================================================

  async getBlock(blockId: string): Promise<NotionBlock> {
    return this.fetch(`/blocks/${blockId}`);
  }

  async getBlockChildren(
    blockId: string,
    startCursor?: string
  ): Promise<{ results: NotionBlock[]; next_cursor: string | null; has_more: boolean }> {
    const params = new URLSearchParams();
    if (startCursor) params.append('start_cursor', startCursor);
    params.append('page_size', '100');

    return this.fetch(`/blocks/${blockId}/children?${params.toString()}`);
  }

  async getPageContent(pageId: string): Promise<NotionBlock[]> {
    const allBlocks: NotionBlock[] = [];
    let cursor: string | null = null;

    do {
      const response = await this.getBlockChildren(pageId, cursor || undefined);
      allBlocks.push(...response.results);
      cursor = response.next_cursor;
    } while (cursor);

    return allBlocks;
  }

  async appendBlocks(
    blockId: string,
    children: unknown[]
  ): Promise<{ results: NotionBlock[] }> {
    return this.fetch(`/blocks/${blockId}/children`, {
      method: 'PATCH',
      body: JSON.stringify({ children }),
    });
  }

  async deleteBlock(blockId: string): Promise<NotionBlock> {
    return this.fetch(`/blocks/${blockId}`, { method: 'DELETE' });
  }

  // =====================================================
  // USERS
  // =====================================================

  async getUser(userId: string): Promise<NotionUser> {
    return this.fetch(`/users/${userId}`);
  }

  async listUsers(): Promise<{ results: NotionUser[] }> {
    return this.fetch('/users');
  }

  async getMe(): Promise<NotionUser> {
    return this.fetch('/users/me');
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  /**
   * Extract plain text from page title
   */
  getPageTitle(page: NotionPage): string {
    for (const prop of Object.values(page.properties)) {
      if (prop.type === 'title' && prop.title) {
        return prop.title.map((t) => t.plain_text).join('');
      }
    }
    return 'Untitled';
  }

  /**
   * Get property value as string
   */
  getPropertyValue(prop: NotionProperty): string | number | boolean | null {
    switch (prop.type) {
      case 'title':
        return prop.title?.map((t) => t.plain_text).join('') || '';
      case 'rich_text':
        return prop.rich_text?.map((t) => t.plain_text).join('') || '';
      case 'number':
        return prop.number ?? null;
      case 'select':
        return prop.select?.name || null;
      case 'multi_select':
        return prop.multi_select?.map((s) => s.name).join(', ') || '';
      case 'date':
        return prop.date?.start || null;
      case 'checkbox':
        return prop.checkbox ?? false;
      case 'url':
        return prop.url || null;
      case 'email':
        return prop.email || null;
      case 'phone_number':
        return prop.phone_number || null;
      case 'status':
        return prop.status?.name || null;
      default:
        return null;
    }
  }

  // =====================================================
  // TASK MANAGEMENT HELPERS
  // =====================================================

  /**
   * Create a simple task page in a database
   */
  async createTask(
    databaseId: string,
    title: string,
    options?: {
      status?: string;
      dueDate?: string;
      priority?: string;
    }
  ): Promise<NotionPage> {
    const properties: Record<string, unknown> = {
      // Most Notion task databases use "Name" or "Task" for title
      Name: { title: [{ text: { content: title } }] },
    };

    if (options?.status) {
      properties.Status = { status: { name: options.status } };
    }
    if (options?.dueDate) {
      properties.Date = { date: { start: options.dueDate } };
    }
    if (options?.priority) {
      properties.Priority = { select: { name: options.priority } };
    }

    return this.createPage({
      parent: { database_id: databaseId },
      properties,
    });
  }

  /**
   * Mark a task as complete (assuming Status property exists)
   */
  async completeTask(pageId: string, statusName: string = 'Done'): Promise<NotionPage> {
    return this.updatePage(pageId, {
      Status: { status: { name: statusName } },
    });
  }

  // =====================================================
  // DASHBOARD DATA
  // =====================================================

  async getDashboardData() {
    const [me, searchResult] = await Promise.all([
      this.getMe().catch(() => null),
      this.search('', 'page').catch(() => ({ results: [] })),
    ]);

    const recentPages = (searchResult.results as NotionPage[])
      .sort((a, b) =>
        new Date(b.last_edited_time).getTime() - new Date(a.last_edited_time).getTime()
      )
      .slice(0, 10);

    return {
      user: me,
      recentPages: recentPages.map((page) => ({
        id: page.id,
        title: this.getPageTitle(page),
        url: page.url,
        lastEdited: page.last_edited_time,
        icon: page.icon?.emoji || page.icon?.external?.url || null,
      })),
      totalPages: searchResult.results.length,
    };
  }
}

// =====================================================
// FACTORY
// =====================================================

export function createNotionClient(connection: RigConnection): NotionClient | null {
  if (!connection.access_token) return null;
  return new NotionClient(connection.access_token);
}
