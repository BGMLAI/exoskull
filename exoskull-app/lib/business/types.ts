// ============================================================================
// Business Types - Revenue tracking, dunning, rate limiting
// ============================================================================

// --- Business Events ---

export type BusinessEventType =
  | "subscription_started"
  | "subscription_renewed"
  | "subscription_cancelled"
  | "subscription_upgraded"
  | "subscription_downgraded"
  | "payment_succeeded"
  | "payment_failed"
  | "payment_refunded"
  | "trial_started"
  | "trial_ended"
  | "trial_converted"
  | "credit_purchased"
  | "credit_used"
  | "credit_expired";

export interface BusinessEvent {
  id: string;
  tenant_id: string;
  event_type: BusinessEventType;
  amount_pln: number;
  currency: string;
  metadata: Record<string, unknown>;
  stripe_payment_intent_id?: string;
  stripe_invoice_id?: string;
  stripe_subscription_id?: string;
  created_at: string;
}

// --- Daily Metrics ---

export interface BusinessDailyMetrics {
  date: string;
  mrr_pln: number;
  arr_pln: number;
  revenue_today_pln: number;
  total_users: number;
  active_users_30d: number;
  paying_users: number;
  trial_users: number;
  churned_users_30d: number;
  churn_rate_30d: number;
  trial_to_paid_rate: number;
  arpu_pln: number;
  ltv_estimated_pln: number;
}

// --- Dunning ---

export type DunningStatus =
  | "pending"
  | "retrying"
  | "recovered"
  | "failed_permanently";

export interface DunningAttempt {
  id: string;
  tenant_id: string;
  stripe_invoice_id: string;
  attempt_number: number;
  status: DunningStatus;
  next_retry_at: string | null;
  notification_sent: boolean;
  notification_channel: string | null;
  amount_pln: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DunningResult {
  processed: number;
  recovered: number;
  escalated: number;
  failed: number;
  errors: string[];
}

// --- Rate Limiting ---

export type SubscriptionTier =
  | "free"
  | "basic"
  | "pro"
  | "business"
  | "enterprise";

export interface TierLimits {
  conversations_daily: number; // -1 = unlimited
  ai_requests_daily: number;
  voice_minutes_daily: number;
  coding_sessions_daily: number;
  mods_max: number;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: {
    conversations_daily: 5,
    ai_requests_daily: 20,
    voice_minutes_daily: 10,
    coding_sessions_daily: 5,
    mods_max: 2,
  },
  basic: {
    conversations_daily: 50,
    ai_requests_daily: 200,
    voice_minutes_daily: 60,
    coding_sessions_daily: 20,
    mods_max: 10,
  },
  pro: {
    conversations_daily: -1,
    ai_requests_daily: -1,
    voice_minutes_daily: 120,
    coding_sessions_daily: 50,
    mods_max: 25,
  },
  business: {
    conversations_daily: -1,
    ai_requests_daily: -1,
    voice_minutes_daily: 500,
    coding_sessions_daily: -1,
    mods_max: -1,
  },
  enterprise: {
    conversations_daily: -1,
    ai_requests_daily: -1,
    voice_minutes_daily: -1,
    coding_sessions_daily: -1,
    mods_max: -1,
  },
};

export interface UsageSummary {
  tenant_id: string;
  date: string;
  conversations_count: number;
  ai_requests_count: number;
  voice_minutes: number;
  tokens_used: number;
}

export interface RateLimitResult {
  allowed: boolean;
  resource: string;
  current: number;
  limit: number;
  tier: SubscriptionTier;
  upgradeMessage?: string;
}

// --- Upsell ---

export interface UpsellSuggestion {
  currentTier: SubscriptionTier;
  suggestedTier: SubscriptionTier;
  reason: string;
  resource: string;
  usagePercent: number;
}

// --- Cohort Analysis ---

export interface CohortData {
  cohort_month: string;
  total_users: number;
  retention: number[]; // retention rates for months 0, 1, 2, ...
}

export interface ChannelRevenue {
  channel: string;
  revenue_pln: number;
  user_count: number;
  avg_revenue_per_user: number;
}
