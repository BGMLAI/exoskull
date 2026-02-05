// =====================================================
// FACEBOOK / META - Full Platform Integration
// =====================================================
// Graph API: Profile, Posts, Photos, Friends, Pages, Groups, Events, Videos
// Instagram: Profile, Media, Insights (via Meta Business Suite)
// Marketing API: Ad Accounts, Campaigns, Ad Sets, Ads, Insights
// Commerce API: Catalogs, Products, Product Sets, Orders
// WhatsApp: See lib/channels/whatsapp/client.ts
// Messenger: See lib/channels/messenger/client.ts
// =====================================================

export {
  FacebookClient,
  createFacebookClient,
  syncFacebookData,
  type FacebookProfile,
  type FacebookPost,
  type FacebookPhoto,
  type FacebookFriend,
  type FacebookPage,
  type FacebookGroup,
  type FacebookEvent,
  type FacebookVideo,
  type FacebookReel,
  type FacebookDashboardData,
  type InstagramProfile,
  type InstagramMedia,
} from "./client";

export {
  FacebookAdsClient,
  createFacebookAdsClient,
  type AdAccount,
  type Campaign,
  type AdSet,
  type Ad,
  type AdInsight,
  type AdsDashboardData,
} from "./ads-client";

export {
  FacebookCommerceClient,
  createFacebookCommerceClient,
  type Catalog,
  type Product,
  type ProductSet,
  type CommerceOrder,
  type CommerceDashboardData,
} from "./commerce-client";
