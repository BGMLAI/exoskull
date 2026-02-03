// =====================================================
// EMAIL TOOL - Read and send emails via Google/Microsoft
// =====================================================

import {
  ExoTool,
  ToolRegistration,
  ToolContext,
  ToolResult,
  stringParam,
  numberParam,
  booleanParam,
} from './types';
import { resolveProvider, ToolProvider } from './rig-helpers';
import { createGoogleClient } from '@/lib/rigs/google/client';
import { createGoogleWorkspaceClient } from '@/lib/rigs/google-workspace/client';
import { createMicrosoft365Client } from '@/lib/rigs/microsoft-365/client';

type EmailProvider = ToolProvider;

interface NormalizedEmail {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  unread: boolean;
  provider: EmailProvider;
}

const PROVIDER_ENUM: EmailProvider[] = ['google', 'google-workspace', 'microsoft-365'];

// =====================================================
// TOOL DEFINITIONS
// =====================================================

export const EMAIL_TOOL_DEFINITIONS: ExoTool[] = [
  {
    name: 'email_send',
    description: 'Send an email',
    parameters: {
      type: 'object',
      properties: {
        to: stringParam('Recipient email address (comma-separated allowed)'),
        subject: stringParam('Email subject'),
        body: stringParam('Email body (HTML allowed)'),
        provider: stringParam('Optional provider override', { enum: PROVIDER_ENUM }),
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'email_list',
    description: 'List recent emails',
    parameters: {
      type: 'object',
      properties: {
        max_results: numberParam('Maximum number of emails to return', { default: 10 }),
        unread_only: booleanParam('Return only unread emails', { default: false }),
        provider: stringParam('Optional provider override', { enum: PROVIDER_ENUM }),
      },
    },
  },
];

// =====================================================
// TOOL HANDLERS
// =====================================================

async function sendEmail(
  context: ToolContext,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const toParam = params.to;
  const subject = params.subject as string | undefined;
  const body = params.body as string | undefined;
  const providerOverride = params.provider as string | undefined;

  if (!toParam || !subject || !body) {
    return { success: false, error: 'Missing required fields: to, subject, body' };
  }

  const toList = Array.isArray(toParam)
    ? (toParam as string[])
    : String(toParam)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

  if (toList.length === 0) {
    return { success: false, error: 'Recipient address is required' };
  }

  const resolved = await resolveProvider(context.tenant_id, providerOverride);
  if (!resolved) {
    return { success: false, error: 'No email provider connected (Google or Microsoft)' };
  }

  try {
    if (resolved.provider === 'google') {
      const client = createGoogleClient(resolved.connection);
      if (!client) return { success: false, error: 'Google client not available' };
      await client.gmail.sendEmail(toList.join(','), subject, body);
    } else if (resolved.provider === 'google-workspace') {
      const client = createGoogleWorkspaceClient(resolved.connection);
      if (!client) return { success: false, error: 'Google Workspace client not available' };
      await client.sendEmail(toList.join(','), subject, body);
    } else {
      const client = createMicrosoft365Client(resolved.connection);
      if (!client) return { success: false, error: 'Microsoft 365 client not available' };
      await client.sendEmail(toList, subject, body, true);
    }

    return {
      success: true,
      result: {
        provider: resolved.provider,
        to: toList,
        subject,
        message: 'Email sent',
      },
    };
  } catch (error) {
    console.error('[EmailTool] sendEmail error:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

async function listEmails(
  context: ToolContext,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const maxResults = Math.min(Number(params.max_results ?? 10), 50);
  const unreadOnly = Boolean(params.unread_only);
  const providerOverride = params.provider as string | undefined;

  const resolved = await resolveProvider(context.tenant_id, providerOverride);
  if (!resolved) {
    return { success: false, error: 'No email provider connected (Google or Microsoft)' };
  }

  try {
    let emails: NormalizedEmail[] = [];
    let unreadCount: number | null = null;

    if (resolved.provider === 'google') {
      const client = createGoogleClient(resolved.connection);
      if (!client) return { success: false, error: 'Google client not available' };

      const [recent, unread] = await Promise.all([
        client.gmail.getRecentEmails(maxResults),
        client.gmail.getUnreadCount().catch(() => null),
      ]);

      emails = recent.map((email) => ({
        id: email.id,
        subject: email.subject,
        from: email.from,
        to: email.to,
        date: email.date,
        snippet: email.snippet,
        unread: email.labelIds?.includes('UNREAD') || false,
        provider: 'google',
      }));
      unreadCount = unread;
    } else if (resolved.provider === 'google-workspace') {
      const client = createGoogleWorkspaceClient(resolved.connection);
      if (!client) return { success: false, error: 'Google Workspace client not available' };

      const [recent, unread] = await Promise.all([
        client.getRecentEmails(maxResults),
        client.getUnreadCount().catch(() => null),
      ]);

      emails = recent.map((email) => ({
        id: email.id,
        subject: email.subject,
        from: email.from,
        to: email.to,
        date: email.date,
        snippet: email.snippet,
        unread: email.labelIds?.includes('UNREAD') || false,
        provider: 'google-workspace',
      }));
      unreadCount = unread;
    } else {
      const client = createMicrosoft365Client(resolved.connection);
      if (!client) return { success: false, error: 'Microsoft 365 client not available' };

      const recent = await client.getRecentEmails(maxResults);
      emails = recent.map((email) => ({
        id: email.id,
        subject: email.subject,
        from: `${email.from?.emailAddress?.name || ''} <${email.from?.emailAddress?.address || ''}>`.trim(),
        to: email.toRecipients
          .map((r) => `${r.emailAddress?.name || ''} <${r.emailAddress?.address || ''}>`.trim())
          .join(', '),
        date: email.receivedDateTime,
        snippet: email.bodyPreview,
        unread: !email.isRead,
        provider: 'microsoft-365',
      }));
      unreadCount = await client.getUnreadCount().catch(() => null);
    }

    if (unreadOnly) {
      emails = emails.filter((e) => e.unread);
    }

    return {
      success: true,
      result: {
        provider: resolved.provider,
        emails,
        count: emails.length,
        unread_count: unreadCount,
      },
    };
  } catch (error) {
    console.error('[EmailTool] listEmails error:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

export const EMAIL_TOOL_REGISTRY: ToolRegistration[] = [
  {
    definition: EMAIL_TOOL_DEFINITIONS[0],
    handler: sendEmail,
    requires_rig: PROVIDER_ENUM,
    category: 'communication',
  },
  {
    definition: EMAIL_TOOL_DEFINITIONS[1],
    handler: listEmails,
    requires_rig: PROVIDER_ENUM,
    category: 'communication',
  },
];

export function getEmailTool(name: string): ToolRegistration | null {
  return EMAIL_TOOL_REGISTRY.find((tool) => tool.definition.name === name) || null;
}
