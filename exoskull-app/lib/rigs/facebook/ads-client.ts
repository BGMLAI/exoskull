// =====================================================
// FACEBOOK MARKETING API CLIENT
// Docs: https://developers.facebook.com/docs/marketing-apis
// Manages Ad Accounts, Campaigns, Ad Sets, Ads, Insights
// =====================================================

const GRAPH_API = "https://graph.facebook.com/v21.0";

// =====================================================
// TYPES
// =====================================================

export interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  account_status: number; // 1=active, 2=disabled, 3=unsettled, etc.
  currency: string;
  timezone_name: string;
  amount_spent: string; // in cents
  balance: string;
  spend_cap: string;
  business?: { id: string; name: string };
}

export interface Campaign {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  created_time: string;
  updated_time: string;
  buying_type: string;
  special_ad_categories: string[];
}

export interface AdSet {
  id: string;
  name: string;
  campaign_id: string;
  status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  end_time?: string;
  targeting?: Record<string, unknown>;
  optimization_goal: string;
  billing_event: string;
  bid_amount?: string;
  created_time: string;
}

export interface Ad {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
  creative?: {
    id: string;
    title?: string;
    body?: string;
    image_url?: string;
    link_url?: string;
    call_to_action_type?: string;
  };
  created_time: string;
  updated_time: string;
}

export interface AdInsight {
  date_start: string;
  date_stop: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  impressions: string;
  reach: string;
  clicks: string;
  spend: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  cpp?: string;
  frequency?: string;
  actions?: Array<{
    action_type: string;
    value: string;
  }>;
  cost_per_action_type?: Array<{
    action_type: string;
    value: string;
  }>;
}

export interface AdsDashboardData {
  accounts: AdAccount[];
  activeCampaigns: Campaign[];
  recentInsights: AdInsight[];
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
}

// =====================================================
// CLIENT
// =====================================================

export class FacebookAdsClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch<T>(
    endpoint: string,
    params: Record<string, string> = {},
    method: "GET" | "POST" | "DELETE" = "GET",
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(`${GRAPH_API}/${endpoint}`);
    url.searchParams.set("access_token", this.accessToken);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const options: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body && method === "POST") {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), options);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("[Facebook Ads] API error:", {
        endpoint,
        status: response.status,
        error: error.error?.message || JSON.stringify(error),
      });
      throw new Error(
        `Facebook Ads API error: ${response.status} - ${error.error?.message || "Unknown"}`,
      );
    }

    return response.json();
  }

  // =====================================================
  // AD ACCOUNTS
  // =====================================================

  /**
   * Get all ad accounts for the current user
   */
  async getAdAccounts(): Promise<AdAccount[]> {
    const response = await this.fetch<{ data: AdAccount[] }>("me/adaccounts", {
      fields:
        "id,account_id,name,account_status,currency,timezone_name,amount_spent,balance,spend_cap,business{id,name}",
      limit: "100",
    });
    return response.data || [];
  }

  /**
   * Get a specific ad account
   */
  async getAdAccount(accountId: string): Promise<AdAccount> {
    return this.fetch<AdAccount>(`act_${accountId}`, {
      fields:
        "id,account_id,name,account_status,currency,timezone_name,amount_spent,balance,spend_cap,business{id,name}",
    });
  }

  // =====================================================
  // CAMPAIGNS
  // =====================================================

  /**
   * Get campaigns for an ad account
   */
  async getCampaigns(
    accountId: string,
    status?: "ACTIVE" | "PAUSED",
    limit: number = 25,
  ): Promise<Campaign[]> {
    const params: Record<string, string> = {
      fields:
        "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time,buying_type,special_ad_categories",
      limit: String(limit),
    };
    if (status) {
      params["filtering"] = JSON.stringify([
        { field: "status", operator: "EQUAL", value: status },
      ]);
    }

    const response = await this.fetch<{ data: Campaign[] }>(
      `act_${accountId}/campaigns`,
      params,
    );
    return response.data || [];
  }

  /**
   * Create a new campaign
   */
  async createCampaign(
    accountId: string,
    name: string,
    objective: string,
    status: "ACTIVE" | "PAUSED" = "PAUSED",
    specialAdCategories: string[] = [],
  ): Promise<{ id: string }> {
    return this.fetch<{ id: string }>(
      `act_${accountId}/campaigns`,
      {},
      "POST",
      {
        name,
        objective,
        status,
        special_ad_categories: specialAdCategories,
      },
    );
  }

  /**
   * Update campaign status
   */
  async updateCampaignStatus(
    campaignId: string,
    status: "ACTIVE" | "PAUSED" | "ARCHIVED",
  ): Promise<{ success: boolean }> {
    return this.fetch<{ success: boolean }>(campaignId, {}, "POST", {
      status,
    });
  }

  // =====================================================
  // AD SETS
  // =====================================================

  /**
   * Get ad sets for a campaign
   */
  async getAdSets(campaignId: string, limit: number = 25): Promise<AdSet[]> {
    const response = await this.fetch<{ data: AdSet[] }>(
      `${campaignId}/adsets`,
      {
        fields:
          "id,name,campaign_id,status,daily_budget,lifetime_budget,start_time,end_time,targeting,optimization_goal,billing_event,bid_amount,created_time",
        limit: String(limit),
      },
    );
    return response.data || [];
  }

  /**
   * Get ad sets for an account
   */
  async getAccountAdSets(
    accountId: string,
    limit: number = 25,
  ): Promise<AdSet[]> {
    const response = await this.fetch<{ data: AdSet[] }>(
      `act_${accountId}/adsets`,
      {
        fields:
          "id,name,campaign_id,status,daily_budget,lifetime_budget,start_time,end_time,optimization_goal,billing_event,created_time",
        limit: String(limit),
      },
    );
    return response.data || [];
  }

  // =====================================================
  // ADS
  // =====================================================

  /**
   * Get ads for an ad set
   */
  async getAds(adSetId: string, limit: number = 25): Promise<Ad[]> {
    const response = await this.fetch<{ data: Ad[] }>(`${adSetId}/ads`, {
      fields:
        "id,name,adset_id,campaign_id,status,creative{id,title,body,image_url,link_url,call_to_action_type},created_time,updated_time",
      limit: String(limit),
    });
    return response.data || [];
  }

  /**
   * Get ads for an account
   */
  async getAccountAds(accountId: string, limit: number = 25): Promise<Ad[]> {
    const response = await this.fetch<{ data: Ad[] }>(`act_${accountId}/ads`, {
      fields:
        "id,name,adset_id,campaign_id,status,creative{id,title,body,image_url,link_url,call_to_action_type},created_time,updated_time",
      limit: String(limit),
    });
    return response.data || [];
  }

  // =====================================================
  // INSIGHTS
  // =====================================================

  /**
   * Get account-level insights
   */
  async getAccountInsights(
    accountId: string,
    datePreset:
      | "today"
      | "yesterday"
      | "this_month"
      | "last_month"
      | "this_quarter"
      | "last_7d"
      | "last_14d"
      | "last_30d"
      | "last_90d" = "last_7d",
    level: "account" | "campaign" | "adset" | "ad" = "account",
  ): Promise<AdInsight[]> {
    const response = await this.fetch<{ data: AdInsight[] }>(
      `act_${accountId}/insights`,
      {
        fields:
          "impressions,reach,clicks,spend,cpc,cpm,ctr,cpp,frequency,actions,cost_per_action_type",
        date_preset: datePreset,
        level,
        ...(level !== "account"
          ? {
              fields: `${level}_name,impressions,reach,clicks,spend,cpc,cpm,ctr,actions`,
            }
          : {}),
      },
    );
    return response.data || [];
  }

  /**
   * Get campaign-level insights
   */
  async getCampaignInsights(
    campaignId: string,
    datePreset: string = "last_7d",
  ): Promise<AdInsight[]> {
    const response = await this.fetch<{ data: AdInsight[] }>(
      `${campaignId}/insights`,
      {
        fields:
          "campaign_name,impressions,reach,clicks,spend,cpc,cpm,ctr,frequency,actions,cost_per_action_type",
        date_preset: datePreset,
      },
    );
    return response.data || [];
  }

  // =====================================================
  // CUSTOM AUDIENCES
  // =====================================================

  /**
   * Get custom audiences
   */
  async getCustomAudiences(
    accountId: string,
    limit: number = 25,
  ): Promise<
    Array<{
      id: string;
      name: string;
      approximate_count: number;
      subtype: string;
      delivery_status?: { status: string };
    }>
  > {
    const response = await this.fetch<{ data: Array<Record<string, unknown>> }>(
      `act_${accountId}/customaudiences`,
      {
        fields: "id,name,approximate_count,subtype,delivery_status",
        limit: String(limit),
      },
    );
    return response.data as Array<{
      id: string;
      name: string;
      approximate_count: number;
      subtype: string;
      delivery_status?: { status: string };
    }>;
  }

  // =====================================================
  // DASHBOARD DATA (aggregate)
  // =====================================================

  /**
   * Get unified dashboard data for ads
   */
  async getDashboardData(): Promise<AdsDashboardData> {
    const accounts = await this.getAdAccounts().catch(() => []);

    if (accounts.length === 0) {
      return {
        accounts: [],
        activeCampaigns: [],
        recentInsights: [],
        totalSpend: 0,
        totalImpressions: 0,
        totalClicks: 0,
      };
    }

    // Use first active account
    const activeAccount =
      accounts.find((a) => a.account_status === 1) || accounts[0];
    const accountId = activeAccount.account_id;

    const [campaigns, insights] = await Promise.all([
      this.getCampaigns(accountId, "ACTIVE", 10).catch(() => []),
      this.getAccountInsights(accountId, "last_7d").catch(() => []),
    ]);

    const totalSpend = insights.reduce(
      (sum, i) => sum + parseFloat(i.spend || "0"),
      0,
    );
    const totalImpressions = insights.reduce(
      (sum, i) => sum + parseInt(i.impressions || "0"),
      0,
    );
    const totalClicks = insights.reduce(
      (sum, i) => sum + parseInt(i.clicks || "0"),
      0,
    );

    return {
      accounts,
      activeCampaigns: campaigns,
      recentInsights: insights,
      totalSpend,
      totalImpressions,
      totalClicks,
    };
  }
}

// =====================================================
// FACTORY
// =====================================================

export function createFacebookAdsClient(
  accessToken: string,
): FacebookAdsClient {
  return new FacebookAdsClient(accessToken);
}
