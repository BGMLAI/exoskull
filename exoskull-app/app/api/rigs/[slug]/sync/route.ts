// =====================================================
// RIG SYNC API - Manual sync trigger
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { RigConnection } from '@/lib/rigs/types';

// Import rig clients
import { createNotionClient } from '@/lib/rigs/notion/client';
import { createTodoistClient } from '@/lib/rigs/todoist/client';
import { createGoogleWorkspaceClient } from '@/lib/rigs/google-workspace/client';
import { createMicrosoft365Client } from '@/lib/rigs/microsoft-365/client';
import { GoogleFitClient } from '@/lib/rigs/google-fit/client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// =====================================================
// POST /api/rigs/[slug]/sync - Trigger manual sync
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const startTime = Date.now();
  const { slug } = await params;
  const tenantId = request.headers.get('x-tenant-id');

  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant ID' }, { status: 401 });
  }

  try {
    // Get connection
    const { data: connection, error: connError } = await supabase
      .from('exo_rig_connections')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('rig_slug', slug)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: 'Rig not connected', slug },
        { status: 404 }
      );
    }

    // Update status to syncing
    await supabase
      .from('exo_rig_connections')
      .update({ sync_status: 'syncing', sync_error: null })
      .eq('id', connection.id);

    // Perform sync based on rig type
    let syncResult: {
      success: boolean;
      records: number;
      error?: string;
      data?: unknown;
    };

    switch (slug) {
      case 'notion': {
        const client = createNotionClient(connection as RigConnection);
        if (!client) throw new Error('Failed to create Notion client');

        const dashboard = await client.getDashboardData();
        syncResult = {
          success: true,
          records: dashboard.recentPages.length,
          data: { user: dashboard.user?.name, totalPages: dashboard.totalPages },
        };
        break;
      }

      case 'todoist': {
        const client = createTodoistClient(connection as RigConnection);
        if (!client) throw new Error('Failed to create Todoist client');

        const dashboard = await client.getDashboardData();
        syncResult = {
          success: true,
          records: dashboard.summary.totalTasks,
          data: dashboard.summary,
        };
        break;
      }

      case 'google-workspace': {
        const client = createGoogleWorkspaceClient(connection as RigConnection);
        if (!client) throw new Error('Failed to create Google Workspace client');

        const dashboard = await client.getDashboardData();
        syncResult = {
          success: true,
          records:
            dashboard.gmail.recentEmails.length +
            dashboard.calendar.todaysEvents.length +
            dashboard.drive.recentFiles.length,
          data: {
            unreadEmails: dashboard.gmail.unreadCount,
            todaysEvents: dashboard.calendar.todaysEvents.length,
            recentFiles: dashboard.drive.recentFiles.length,
          },
        };
        break;
      }

      case 'microsoft-365': {
        const client = createMicrosoft365Client(connection as RigConnection);
        if (!client) throw new Error('Failed to create Microsoft 365 client');

        const dashboard = await client.getDashboardData();
        syncResult = {
          success: true,
          records:
            dashboard.outlook.recentEmails.length +
            dashboard.calendar.todaysEvents.length +
            dashboard.onedrive.recentFiles.length,
          data: {
            unreadEmails: dashboard.outlook.unreadCount,
            todaysEvents: dashboard.calendar.todaysEvents.length,
            recentFiles: dashboard.onedrive.recentFiles.length,
          },
        };
        break;
      }

      case 'google-fit': {
        const client = new GoogleFitClient(connection.access_token!);
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7); // Last 7 days
        const allData = await client.getAllData(startDate, endDate);
        syncResult = {
          success: true,
          records: allData.steps.length + allData.heartRate.length + allData.calories.length,
          data: {
            steps: allData.steps.slice(0, 7),
            heartRate: allData.heartRate.slice(0, 7),
            sleep: allData.sleep.slice(0, 7),
          },
        };
        break;
      }

      default:
        syncResult = {
          success: false,
          records: 0,
          error: `Sync not implemented for ${slug}`,
        };
    }

    const duration = Date.now() - startTime;

    // Update connection status
    await supabase
      .from('exo_rig_connections')
      .update({
        sync_status: syncResult.success ? 'success' : 'error',
        sync_error: syncResult.error || null,
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    // Log sync result
    await supabase.from('exo_rig_sync_log').insert({
      connection_id: connection.id,
      tenant_id: tenantId,
      rig_slug: slug,
      success: syncResult.success,
      records_synced: syncResult.records,
      error: syncResult.error,
      duration_ms: duration,
      metadata: syncResult.data,
    });

    return NextResponse.json({
      success: syncResult.success,
      slug,
      records_synced: syncResult.records,
      duration_ms: duration,
      data: syncResult.data,
      error: syncResult.error,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = (error as Error).message;

    console.error(`[Rig Sync] ${slug} failed:`, error);

    // Update connection status
    await supabase
      .from('exo_rig_connections')
      .update({
        sync_status: 'error',
        sync_error: errorMessage,
      })
      .eq('tenant_id', tenantId)
      .eq('rig_slug', slug);

    return NextResponse.json(
      {
        success: false,
        slug,
        error: errorMessage,
        duration_ms: duration,
      },
      { status: 500 }
    );
  }
}

// =====================================================
// GET /api/rigs/[slug]/sync - Get sync status
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const tenantId = request.headers.get('x-tenant-id');

  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant ID' }, { status: 401 });
  }

  // Get connection status
  const { data: connection, error: connError } = await supabase
    .from('exo_rig_connections')
    .select('id, sync_status, sync_error, last_sync_at, metadata')
    .eq('tenant_id', tenantId)
    .eq('rig_slug', slug)
    .single();

  if (connError || !connection) {
    return NextResponse.json({ connected: false, slug }, { status: 200 });
  }

  // Get recent sync logs
  const { data: logs } = await supabase
    .from('exo_rig_sync_log')
    .select('success, records_synced, error, duration_ms, created_at')
    .eq('connection_id', connection.id)
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    connected: true,
    slug,
    sync_status: connection.sync_status,
    sync_error: connection.sync_error,
    last_sync_at: connection.last_sync_at,
    metadata: connection.metadata,
    recent_syncs: logs || [],
  });
}
