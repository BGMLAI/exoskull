// =====================================================
// SLEEP TRACKER MOD EXECUTOR
// Track sleep via Oura Ring or manual entries
// =====================================================

import { createClient } from '@supabase/supabase-js';
import { IModExecutor, ModInsight, ModAction, ModSlug } from '../types';
import { OuraClient, createOuraClient, OuraDailySleep, OuraSleepPeriod } from '../../rigs/oura/client';
import { RigConnection } from '../../rigs/types';

// =====================================================
// TYPES
// =====================================================

interface SleepEntry {
  id: string;
  source: 'oura' | 'manual' | 'health-connect';
  date: string;
  sleep_start: string;
  sleep_end: string;
  duration_minutes: number;
  quality_score: number | null;
  efficiency: number | null;
  deep_sleep_minutes: number | null;
  rem_sleep_minutes: number | null;
  light_sleep_minutes: number | null;
  awake_minutes: number | null;
  hrv_average: number | null;
  resting_hr: number | null;
  notes: string | null;
}

interface SleepGoal {
  target_hours: number;
  target_bedtime: string | null;
  target_waketime: string | null;
}

interface SleepStats {
  avg_duration_minutes: number;
  avg_quality_score: number | null;
  avg_efficiency: number | null;
  total_entries: number;
  sleep_debt_hours: number;
}

// =====================================================
// EXECUTOR
// =====================================================

export class SleepTrackerExecutor implements IModExecutor {
  readonly slug: ModSlug = 'sleep-tracker';

  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // =====================================================
  // PRIVATE HELPERS
  // =====================================================

  private async getOuraConnection(tenantId: string): Promise<RigConnection | null> {
    const { data, error } = await this.supabase
      .from('exo_rig_connections')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('rig_type', 'oura')
      .single();

    if (error || !data) return null;
    return data as RigConnection;
  }

  private async getOuraClient(tenantId: string): Promise<OuraClient | null> {
    const connection = await this.getOuraConnection(tenantId);
    return connection ? createOuraClient(connection) : null;
  }

  private async getSleepGoal(tenantId: string): Promise<SleepGoal> {
    const { data } = await this.supabase
      .from('exo_health_goals')
      .select('target_value')
      .eq('tenant_id', tenantId)
      .eq('goal_type', 'sleep_duration')
      .single();

    return {
      target_hours: data?.target_value || 8,
      target_bedtime: null,
      target_waketime: null,
    };
  }

  private async getManualEntries(tenantId: string, days: number = 7): Promise<SleepEntry[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await this.supabase
      .from('exo_sleep_entries')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('sleep_start', startDate.toISOString())
      .order('sleep_start', { ascending: false });

    if (error || !data) return [];

    return data.map((entry) => ({
      id: entry.id,
      source: entry.source,
      date: new Date(entry.sleep_start).toISOString().split('T')[0],
      sleep_start: entry.sleep_start,
      sleep_end: entry.sleep_end,
      duration_minutes: entry.duration_minutes,
      quality_score: entry.quality_score,
      efficiency: entry.efficiency,
      deep_sleep_minutes: entry.deep_sleep_minutes,
      rem_sleep_minutes: entry.rem_sleep_minutes,
      light_sleep_minutes: entry.light_sleep_minutes,
      awake_minutes: entry.awake_minutes,
      hrv_average: entry.hrv_average,
      resting_hr: entry.resting_hr,
      notes: entry.notes,
    }));
  }

  private ouraToSleepEntry(period: OuraSleepPeriod): SleepEntry {
    return {
      id: `oura:${period.id}`,
      source: 'oura',
      date: period.day,
      sleep_start: period.bedtime_start,
      sleep_end: period.bedtime_end,
      duration_minutes: Math.round(period.total_sleep_duration / 60),
      quality_score: period.efficiency ? Math.round(period.efficiency / 10) : null,
      efficiency: period.efficiency,
      deep_sleep_minutes: Math.round(period.deep_sleep_duration / 60),
      rem_sleep_minutes: Math.round(period.rem_sleep_duration / 60),
      light_sleep_minutes: Math.round(period.light_sleep_duration / 60),
      awake_minutes: Math.round(period.awake_time / 60),
      hrv_average: period.average_hrv,
      resting_hr: period.average_heart_rate,
      notes: null,
    };
  }

  private calculateStats(entries: SleepEntry[], targetHours: number): SleepStats {
    if (entries.length === 0) {
      return {
        avg_duration_minutes: 0,
        avg_quality_score: null,
        avg_efficiency: null,
        total_entries: 0,
        sleep_debt_hours: 0,
      };
    }

    const totalDuration = entries.reduce((sum, e) => sum + e.duration_minutes, 0);
    const avgDuration = totalDuration / entries.length;

    const qualityScores = entries.filter((e) => e.quality_score !== null);
    const avgQuality = qualityScores.length > 0
      ? qualityScores.reduce((sum, e) => sum + (e.quality_score || 0), 0) / qualityScores.length
      : null;

    const efficiencies = entries.filter((e) => e.efficiency !== null);
    const avgEfficiency = efficiencies.length > 0
      ? efficiencies.reduce((sum, e) => sum + (e.efficiency || 0), 0) / efficiencies.length
      : null;

    // Calculate sleep debt (difference from target over period)
    const targetMinutes = targetHours * 60;
    const debtMinutes = entries.reduce((debt, e) => {
      const diff = targetMinutes - e.duration_minutes;
      return diff > 0 ? debt + diff : debt;
    }, 0);

    return {
      avg_duration_minutes: Math.round(avgDuration),
      avg_quality_score: avgQuality ? Math.round(avgQuality * 10) / 10 : null,
      avg_efficiency: avgEfficiency ? Math.round(avgEfficiency) : null,
      total_entries: entries.length,
      sleep_debt_hours: Math.round(debtMinutes / 60 * 10) / 10,
    };
  }

  // =====================================================
  // IModExecutor IMPLEMENTATION
  // =====================================================

  async getData(tenant_id: string): Promise<Record<string, unknown>> {
    const ouraClient = await this.getOuraClient(tenant_id);
    const goal = await this.getSleepGoal(tenant_id);
    let entries: SleepEntry[] = [];
    let lastNight: SleepEntry | null = null;
    let sources: string[] = ['manual'];

    // Try to get Oura data first
    if (ouraClient) {
      try {
        const dashboard = await ouraClient.getDashboardData(7);
        sources.push('oura');

        if (dashboard.sleep.lastNight) {
          lastNight = this.ouraToSleepEntry(dashboard.sleep.lastNight);
        }

        // Get sleep periods from Oura
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        const sleepPeriods = await ouraClient.getSleepPeriods(
          startDate.toISOString().split('T')[0],
          new Date().toISOString().split('T')[0]
        );

        entries = sleepPeriods.data
          .filter((p) => p.type === 'long_sleep' || p.type === 'sleep')
          .map((p) => this.ouraToSleepEntry(p));
      } catch (error) {
        console.error('[SleepTracker] Oura error:', error);
      }
    }

    // Also get manual entries
    const manualEntries = await this.getManualEntries(tenant_id, 7);

    // Merge and deduplicate (prefer Oura data)
    const ouraIds = new Set(entries.map((e) => e.date));
    const uniqueManual = manualEntries.filter((e) => !ouraIds.has(e.date));
    entries = [...entries, ...uniqueManual].sort(
      (a, b) => new Date(b.sleep_start).getTime() - new Date(a.sleep_start).getTime()
    );

    if (!lastNight && entries.length > 0) {
      lastNight = entries[0];
    }

    const stats = this.calculateStats(entries, goal.target_hours);

    return {
      last_night: lastNight,
      entries,
      stats,
      goal,
      sources,
      oura_connected: !!ouraClient,
    };
  }

  async getInsights(tenant_id: string): Promise<ModInsight[]> {
    const data = await this.getData(tenant_id);
    const insights: ModInsight[] = [];
    const stats = data.stats as SleepStats;
    const goal = data.goal as SleepGoal;
    const lastNight = data.last_night as SleepEntry | null;

    // Check sleep debt
    if (stats.sleep_debt_hours > 3) {
      insights.push({
        type: 'warning',
        title: 'Sleep Debt Alert',
        message: `You've accumulated ${stats.sleep_debt_hours}h of sleep debt this week. Consider going to bed earlier tonight.`,
        data: { sleep_debt_hours: stats.sleep_debt_hours },
        created_at: new Date().toISOString(),
      });
    }

    // Check last night quality
    if (lastNight && lastNight.quality_score !== null && lastNight.quality_score < 6) {
      insights.push({
        type: 'alert',
        title: 'Poor Sleep Quality',
        message: `Last night's sleep quality was ${lastNight.quality_score}/10. Try reducing screen time before bed.`,
        data: { quality_score: lastNight.quality_score },
        created_at: new Date().toISOString(),
      });
    }

    // Check average duration
    const avgHours = stats.avg_duration_minutes / 60;
    if (avgHours < goal.target_hours - 1) {
      insights.push({
        type: 'info',
        title: 'Below Target Sleep',
        message: `Your average sleep is ${avgHours.toFixed(1)}h, below your ${goal.target_hours}h goal.`,
        data: { avg_hours: avgHours, target_hours: goal.target_hours },
        created_at: new Date().toISOString(),
      });
    } else if (avgHours >= goal.target_hours) {
      insights.push({
        type: 'success',
        title: 'Meeting Sleep Goal',
        message: `Great job! You're averaging ${avgHours.toFixed(1)}h of sleep, meeting your goal.`,
        data: { avg_hours: avgHours, target_hours: goal.target_hours },
        created_at: new Date().toISOString(),
      });
    }

    // Check HRV trend (if available)
    if (lastNight?.hrv_average) {
      if (lastNight.hrv_average < 30) {
        insights.push({
          type: 'warning',
          title: 'Low HRV',
          message: `Your HRV last night was ${lastNight.hrv_average}ms, which is lower than optimal. Consider a recovery day.`,
          data: { hrv: lastNight.hrv_average },
          created_at: new Date().toISOString(),
        });
      }
    }

    return insights;
  }

  async executeAction(
    tenant_id: string,
    action: string,
    params: Record<string, unknown>
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
      switch (action) {
        case 'log_sleep': {
          const { sleep_start, sleep_end, quality_score, notes } = params as {
            sleep_start: string;
            sleep_end: string;
            quality_score?: number;
            notes?: string;
          };

          if (!sleep_start || !sleep_end) {
            return { success: false, error: 'sleep_start and sleep_end are required' };
          }

          const { data, error } = await this.supabase
            .from('exo_sleep_entries')
            .insert({
              tenant_id,
              source: 'manual',
              sleep_start: new Date(sleep_start).toISOString(),
              sleep_end: new Date(sleep_end).toISOString(),
              quality_score: quality_score || null,
              notes: notes || null,
            })
            .select()
            .single();

          if (error) {
            return { success: false, error: error.message };
          }

          return { success: true, result: data };
        }

        case 'set_goal': {
          const { target_hours } = params as { target_hours: number };

          if (!target_hours || target_hours < 4 || target_hours > 12) {
            return { success: false, error: 'target_hours must be between 4 and 12' };
          }

          const { error } = await this.supabase
            .from('exo_health_goals')
            .upsert({
              tenant_id,
              goal_type: 'sleep_duration',
              target_value: target_hours,
              target_unit: 'hours',
              frequency: 'daily',
            }, {
              onConflict: 'tenant_id,goal_type',
            });

          if (error) {
            return { success: false, error: error.message };
          }

          return { success: true, result: { target_hours } };
        }

        case 'get_history': {
          const { days = 30 } = params as { days?: number };
          const entries = await this.getManualEntries(tenant_id, days);
          return { success: true, result: { entries, days } };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      console.error('[SleepTracker] Action error:', {
        action,
        tenant_id,
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Action failed',
      };
    }
  }

  getActions(): ModAction[] {
    return [
      {
        slug: 'log_sleep',
        name: 'Log Sleep',
        description: 'Manually log a sleep session',
        params_schema: {
          type: 'object',
          properties: {
            sleep_start: { type: 'string', description: 'Sleep start time (ISO 8601)' },
            sleep_end: { type: 'string', description: 'Sleep end time (ISO 8601)' },
            quality_score: { type: 'number', description: 'Quality score 1-10' },
            notes: { type: 'string', description: 'Optional notes' },
          },
          required: ['sleep_start', 'sleep_end'],
        },
      },
      {
        slug: 'set_goal',
        name: 'Set Sleep Goal',
        description: 'Set your daily sleep duration goal',
        params_schema: {
          type: 'object',
          properties: {
            target_hours: { type: 'number', description: 'Target hours of sleep per night' },
          },
          required: ['target_hours'],
        },
      },
      {
        slug: 'get_history',
        name: 'Get Sleep History',
        description: 'Get sleep history for a number of days',
        params_schema: {
          type: 'object',
          properties: {
            days: { type: 'number', description: 'Number of days to retrieve (default 30)' },
          },
        },
      },
    ];
  }
}
