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
import { createGoogleClient } from '@/lib/rigs/google/client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface HealthMetricInsert {
  tenant_id: string;
  metric_type: string;
  value: number;
  unit: string;
  recorded_at: string;
  source: string;
  metadata?: Record<string, unknown>;
}

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

        const healthMetrics = buildGoogleFitMetrics(tenantId, allData, 'google-fit');
        if (healthMetrics.length > 0) {
          await upsertHealthMetrics(healthMetrics);
        }

        syncResult = {
          success: true,
          records: allData.steps.length + allData.heartRate.length + allData.calories.length,
          data: {
            steps: allData.steps.slice(0, 7),
            heartRate: allData.heartRate.slice(0, 7),
            sleep: allData.sleep.slice(0, 7),
            metrics_upserted: healthMetrics.length,
          },
        };
        break;
      }

      case 'google': {
        // Unified Google client (Fit + Workspace + YouTube + Photos + Contacts)
        const client = createGoogleClient(connection as RigConnection);
        if (!client) throw new Error('Failed to create Google client');

        const dashboard = await client.getDashboardData();

        const healthMetrics = buildGoogleDashboardMetrics(
          tenantId,
          dashboard.fit,
          'google'
        );
        if (healthMetrics.length > 0) {
          await upsertHealthMetrics(healthMetrics);
        }

        syncResult = {
          success: true,
          records:
            dashboard.fit.steps.length +
            dashboard.fit.heartRate.length +
            dashboard.workspace.gmail.recentEmails.length +
            dashboard.workspace.calendar.todaysEvents.length +
            dashboard.workspace.tasks.activeTasks.length +
            dashboard.youtube.recentVideos.length +
            dashboard.contacts.recentContacts.length +
            dashboard.photos.recentPhotos.length,
          data: {
            fit: {
              todaySteps: dashboard.fit.todaySteps,
              todayCalories: dashboard.fit.todayCalories,
              avgHeartRate: dashboard.fit.avgHeartRate,
            },
            workspace: {
              unreadEmails: dashboard.workspace.gmail.unreadCount,
              todaysEvents: dashboard.workspace.calendar.todaysEvents.length,
              activeTasks: dashboard.workspace.tasks.activeCount,
              overdueTasks: dashboard.workspace.tasks.overdueCount,
            },
            youtube: {
              channelName: dashboard.youtube.channel?.title || null,
              recentVideos: dashboard.youtube.recentVideos.length,
            },
            contacts: {
              total: dashboard.contacts.totalCount,
            },
            photos: {
              recent: dashboard.photos.recentPhotos.length,
            },
            metrics_upserted: healthMetrics.length,
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

// =====================================================
// HELPERS
// =====================================================

function toRecordedAt(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toISOString();
}

async function upsertHealthMetrics(metrics: HealthMetricInsert[]) {
  if (metrics.length === 0) return;

  const { error } = await supabase.from('exo_health_metrics').upsert(metrics, {
    onConflict: 'tenant_id,metric_type,recorded_at,source',
    ignoreDuplicates: true,
  });

  if (error) {
    console.error('[Rig Sync] Failed to upsert health metrics:', {
      error: error.message,
      count: metrics.length,
    });
    throw new Error('Failed to save health metrics');
  }
}

function buildGoogleFitMetrics(
  tenantId: string,
  data: {
    steps: { date: string; steps: number }[];
    heartRate: { date: string; bpm: number }[];
    calories: { date: string; calories: number }[];
    sleep: { date: string; durationMinutes: number }[];
    distance: { date: string; meters: number }[];
  },
  source: string
): HealthMetricInsert[] {
  const metrics: HealthMetricInsert[] = [];

  for (const item of data.steps) {
    if (item.steps > 0) {
      metrics.push({
        tenant_id: tenantId,
        metric_type: 'steps',
        value: item.steps,
        unit: 'count',
        recorded_at: toRecordedAt(item.date),
        source,
      });
    }
  }

  for (const item of data.heartRate) {
    if (item.bpm > 0) {
      metrics.push({
        tenant_id: tenantId,
        metric_type: 'heart_rate',
        value: item.bpm,
        unit: 'bpm',
        recorded_at: toRecordedAt(item.date),
        source,
      });
    }
  }

  for (const item of data.calories) {
    if (item.calories > 0) {
      metrics.push({
        tenant_id: tenantId,
        metric_type: 'calories',
        value: item.calories,
        unit: 'kcal',
        recorded_at: toRecordedAt(item.date),
        source,
      });
    }
  }

  for (const item of data.sleep) {
    if (item.durationMinutes > 0) {
      metrics.push({
        tenant_id: tenantId,
        metric_type: 'sleep',
        value: item.durationMinutes,
        unit: 'minutes',
        recorded_at: toRecordedAt(item.date),
        source,
      });
    }
  }

  for (const item of data.distance) {
    if (item.meters > 0) {
      metrics.push({
        tenant_id: tenantId,
        metric_type: 'distance',
        value: item.meters,
        unit: 'meters',
        recorded_at: toRecordedAt(item.date),
        source,
      });
    }
  }

  return metrics;
}

function buildGoogleDashboardMetrics(
  tenantId: string,
  fit: {
    steps: { date: string; steps: number }[];
    heartRate: { date: string; bpm: number }[];
    calories: { date: string; calories: number }[];
    sleep: { date: string; durationMinutes: number }[];
  },
  source: string
): HealthMetricInsert[] {
  return buildGoogleFitMetrics(
    tenantId,
    {
      steps: fit.steps,
      heartRate: fit.heartRate,
      calories: fit.calories,
      sleep: fit.sleep,
      distance: [],
    },
    source
  );
}
