import { logger } from "@/lib/logger";

// =====================================================
// FACEBOOK COMMERCE / CATALOG API CLIENT
// Docs: https://developers.facebook.com/docs/commerce-platform
// Manages Catalogs, Products, Product Sets, Orders
// =====================================================

const GRAPH_API = "https://graph.facebook.com/v21.0";

// =====================================================
// TYPES
// =====================================================

export interface Catalog {
  id: string;
  name: string;
  product_count: number;
  vertical: string; // commerce, vehicles, hotels, flights, destinations, home_listings
  business?: { id: string; name: string };
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: string;
  currency: string;
  availability:
    | "in stock"
    | "out of stock"
    | "preorder"
    | "available for order";
  condition: "new" | "refurbished" | "used";
  image_url: string;
  url?: string;
  brand?: string;
  category?: string;
  retailer_id?: string;
  custom_label_0?: string;
  custom_label_1?: string;
  review_status?: string;
}

export interface ProductSet {
  id: string;
  name: string;
  product_count: number;
  filter?: Record<string, unknown>;
}

export interface CommerceOrder {
  id: string;
  order_status: {
    state: "CREATED" | "IN_PROGRESS" | "SHIPPED" | "COMPLETED" | "CANCELLED";
  };
  created: string;
  last_updated: string;
  buyer_details?: {
    name: string;
    email?: string;
  };
  ship_by_date?: string;
  items: {
    data: Array<{
      id: string;
      product_id: string;
      retailer_id: string;
      quantity: number;
      price_per_unit: { amount: string; currency: string };
      tax_details?: { estimated_tax: { amount: string; currency: string } };
    }>;
  };
  selected_shipping_option?: {
    name: string;
    price: { amount: string; currency: string };
  };
  estimated_payment?: {
    subtotal: { amount: string; currency: string };
    tax: { amount: string; currency: string };
    total_amount: { amount: string; currency: string };
  };
}

export interface CommerceDashboardData {
  catalogs: Catalog[];
  totalProducts: number;
  recentOrders: CommerceOrder[];
  productSamples: Product[];
}

// =====================================================
// CLIENT
// =====================================================

export class FacebookCommerceClient {
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
      logger.error("[Facebook Commerce] API error:", {
        endpoint,
        status: response.status,
        error: error.error?.message || JSON.stringify(error),
      });
      throw new Error(
        `Facebook Commerce API error: ${response.status} - ${error.error?.message || "Unknown"}`,
      );
    }

    return response.json();
  }

  // =====================================================
  // CATALOGS
  // =====================================================

  /**
   * Get all catalogs owned by the user/business
   */
  async getCatalogs(): Promise<Catalog[]> {
    const response = await this.fetch<{ data: Catalog[] }>(
      "me/owned_product_catalogs",
      {
        fields: "id,name,product_count,vertical,business{id,name}",
      },
    );
    return response.data || [];
  }

  /**
   * Create a new product catalog
   */
  async createCatalog(
    name: string,
    vertical: string = "commerce",
  ): Promise<{ id: string }> {
    return this.fetch<{ id: string }>("me/owned_product_catalogs", {}, "POST", {
      name,
      vertical,
    });
  }

  // =====================================================
  // PRODUCTS
  // =====================================================

  /**
   * Get products from a catalog
   */
  async getProducts(catalogId: string, limit: number = 25): Promise<Product[]> {
    const response = await this.fetch<{ data: Product[] }>(
      `${catalogId}/products`,
      {
        fields:
          "id,name,description,price,currency,availability,condition,image_url,url,brand,category,retailer_id,review_status",
        limit: String(limit),
      },
    );
    return response.data || [];
  }

  /**
   * Add a product to a catalog
   */
  async addProduct(
    catalogId: string,
    product: {
      name: string;
      description?: string;
      price: number; // in smallest currency unit (cents)
      currency: string;
      availability: Product["availability"];
      condition: Product["condition"];
      image_url: string;
      url: string;
      brand?: string;
      category?: string;
      retailer_id: string;
    },
  ): Promise<{ id: string }> {
    return this.fetch<{ id: string }>(
      `${catalogId}/products`,
      {},
      "POST",
      product,
    );
  }

  /**
   * Update a product
   */
  async updateProduct(
    productId: string,
    updates: Partial<{
      name: string;
      description: string;
      price: number;
      availability: Product["availability"];
      image_url: string;
    }>,
  ): Promise<{ success: boolean }> {
    return this.fetch<{ success: boolean }>(productId, {}, "POST", updates);
  }

  /**
   * Delete a product
   */
  async deleteProduct(productId: string): Promise<{ success: boolean }> {
    return this.fetch<{ success: boolean }>(productId, {}, "DELETE");
  }

  // =====================================================
  // PRODUCT SETS
  // =====================================================

  /**
   * Get product sets for a catalog
   */
  async getProductSets(
    catalogId: string,
    limit: number = 25,
  ): Promise<ProductSet[]> {
    const response = await this.fetch<{ data: ProductSet[] }>(
      `${catalogId}/product_sets`,
      {
        fields: "id,name,product_count",
        limit: String(limit),
      },
    );
    return response.data || [];
  }

  /**
   * Create a product set
   */
  async createProductSet(
    catalogId: string,
    name: string,
    filter?: Record<string, unknown>,
  ): Promise<{ id: string }> {
    return this.fetch<{ id: string }>(`${catalogId}/product_sets`, {}, "POST", {
      name,
      filter: filter ? JSON.stringify(filter) : undefined,
    });
  }

  // =====================================================
  // COMMERCE ORDERS (Facebook Shops / Marketplace)
  // =====================================================

  /**
   * Get orders for a commerce account (Page)
   * Requires pages_read_engagement + catalog_management permissions
   */
  async getOrders(
    pageId: string,
    state?: CommerceOrder["order_status"]["state"],
    limit: number = 25,
  ): Promise<CommerceOrder[]> {
    const params: Record<string, string> = {
      fields:
        "id,order_status,created,last_updated,buyer_details,ship_by_date,items{id,product_id,retailer_id,quantity,price_per_unit,tax_details},selected_shipping_option,estimated_payment",
      limit: String(limit),
    };
    if (state) {
      params["state"] = state;
    }

    const response = await this.fetch<{ data: CommerceOrder[] }>(
      `${pageId}/commerce_orders`,
      params,
    );
    return response.data || [];
  }

  /**
   * Acknowledge an order
   */
  async acknowledgeOrder(orderId: string): Promise<{ success: boolean }> {
    return this.fetch<{ success: boolean }>(orderId, {}, "POST", {
      state: "IN_PROGRESS",
    });
  }

  /**
   * Mark order as shipped
   */
  async shipOrder(
    orderId: string,
    trackingInfo: {
      carrier: string;
      tracking_number: string;
      shipping_method_name?: string;
    },
  ): Promise<{ success: boolean }> {
    return this.fetch<{ success: boolean }>(
      `${orderId}/shipments`,
      {},
      "POST",
      {
        tracking_info: trackingInfo,
        items: [], // Ship all items; pass specific items for partial shipment
      },
    );
  }

  // =====================================================
  // DASHBOARD DATA
  // =====================================================

  /**
   * Get unified commerce dashboard data
   */
  async getDashboardData(pageId?: string): Promise<CommerceDashboardData> {
    const catalogs = await this.getCatalogs().catch(() => []);

    let totalProducts = 0;
    let productSamples: Product[] = [];

    if (catalogs.length > 0) {
      const firstCatalog = catalogs[0];
      totalProducts = firstCatalog.product_count || 0;
      productSamples = await this.getProducts(firstCatalog.id, 5).catch(
        () => [],
      );
    }

    let recentOrders: CommerceOrder[] = [];
    if (pageId) {
      recentOrders = await this.getOrders(pageId, undefined, 10).catch(
        () => [],
      );
    }

    return {
      catalogs,
      totalProducts,
      recentOrders,
      productSamples,
    };
  }
}

// =====================================================
// FACTORY
// =====================================================

export function createFacebookCommerceClient(
  accessToken: string,
): FacebookCommerceClient {
  return new FacebookCommerceClient(accessToken);
}
