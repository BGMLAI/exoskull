import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SERVICE_REGISTRY,
  findService,
  listServicesByCategory,
  getCategories,
  isServiceConfigured,
} from "@/lib/integrations/service-registry";

describe("Service Registry", () => {
  describe("SERVICE_REGISTRY contents", () => {
    it("has at least 15 services", () => {
      expect(SERVICE_REGISTRY.length).toBeGreaterThanOrEqual(15);
    });

    it("every service has required fields", () => {
      for (const service of SERVICE_REGISTRY) {
        expect(service.name).toBeTruthy();
        expect(service.slug).toBeTruthy();
        expect(service.description).toBeTruthy();
        expect(service.icon).toBeTruthy();
        expect(service.category).toBeTruthy();
        expect(["oauth2", "api_key", "webhook"]).toContain(service.auth_method);
        expect(service.api_base_url).toBeTruthy();
        expect(service.capabilities.length).toBeGreaterThan(0);
      }
    });

    it("slugs are unique", () => {
      const slugs = SERVICE_REGISTRY.map((s) => s.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it("oauth2 services have authorization_url and token_url", () => {
      const oauthServices = SERVICE_REGISTRY.filter(
        (s) => s.auth_method === "oauth2",
      );
      expect(oauthServices.length).toBeGreaterThan(0);

      for (const service of oauthServices) {
        expect(service.oauth2).toBeDefined();
        expect(service.oauth2!.authorization_url).toMatch(/^https:\/\//);
        expect(service.oauth2!.token_url).toMatch(/^https:\/\//);
        expect(service.oauth2!.scopes).toBeInstanceOf(Array);
      }
    });

    it("api_key services have docs_url and header_name", () => {
      const apiKeyServices = SERVICE_REGISTRY.filter(
        (s) => s.auth_method === "api_key",
      );
      expect(apiKeyServices.length).toBeGreaterThan(0);

      for (const service of apiKeyServices) {
        expect(service.api_key).toBeDefined();
        expect(service.api_key!.docs_url).toMatch(/^https:\/\//);
        expect(service.api_key!.header_name).toBeTruthy();
      }
    });

    it("contains expected services", () => {
      const slugs = SERVICE_REGISTRY.map((s) => s.slug);
      expect(slugs).toContain("gmail");
      expect(slugs).toContain("slack");
      expect(slugs).toContain("github");
      expect(slugs).toContain("spotify");
      expect(slugs).toContain("stripe");
      expect(slugs).toContain("notion");
    });
  });

  describe("findService", () => {
    it("finds by exact slug", () => {
      const result = findService("gmail");
      expect(result).toBeDefined();
      expect(result!.name).toBe("Gmail");
    });

    it("finds by name (case-insensitive)", () => {
      const result = findService("Gmail");
      expect(result).toBeDefined();
      expect(result!.slug).toBe("gmail");
    });

    it("finds by partial name", () => {
      const result = findService("google cal");
      expect(result).toBeDefined();
      expect(result!.slug).toBe("google-calendar");
    });

    it("finds by partial slug", () => {
      // "hubspot" exact slug match
      const result = findService("hubspot");
      expect(result).toBeDefined();
      expect(result!.slug).toBe("hubspot");

      // "hub" partial match — finds first service containing "hub" (github has "hub" in slug)
      const hubResult = findService("hub");
      expect(hubResult).toBeDefined();
    });

    it("returns undefined for unknown service", () => {
      const result = findService("nonexistent-service-xyz");
      expect(result).toBeUndefined();
    });

    it("handles whitespace", () => {
      const result = findService("  gmail  ");
      expect(result).toBeDefined();
    });
  });

  describe("listServicesByCategory", () => {
    it("returns all services when no category specified", () => {
      const result = listServicesByCategory();
      expect(result.length).toBe(SERVICE_REGISTRY.length);
    });

    it("filters by category", () => {
      const comm = listServicesByCategory("communication");
      expect(comm.length).toBeGreaterThan(0);
      for (const s of comm) {
        expect(s.category).toBe("communication");
      }
    });

    it("returns empty for nonexistent category", () => {
      // @ts-expect-error testing invalid category
      const result = listServicesByCategory("nonexistent");
      expect(result).toEqual([]);
    });
  });

  describe("getCategories", () => {
    it("returns categories with counts", () => {
      const categories = getCategories();
      expect(categories.length).toBeGreaterThan(3);

      for (const cat of categories) {
        expect(cat.category).toBeTruthy();
        expect(cat.count).toBeGreaterThan(0);
      }
    });

    it("total count matches registry length", () => {
      const categories = getCategories();
      const totalCount = categories.reduce((sum, c) => sum + c.count, 0);
      expect(totalCount).toBe(SERVICE_REGISTRY.length);
    });
  });

  describe("isServiceConfigured", () => {
    it("returns true for api_key services (user provides key)", () => {
      const stripe = findService("stripe")!;
      expect(isServiceConfigured(stripe)).toBe(true);
    });

    it("returns false for oauth2 services without env vars", () => {
      // In test env, GOOGLE_CLIENT_ID is not set
      const gmail = findService("gmail")!;
      expect(isServiceConfigured(gmail)).toBe(false);
    });

    it("returns true for oauth2 services with env vars set", () => {
      const originalEnv = process.env.GOOGLE_CLIENT_ID;
      process.env.GOOGLE_CLIENT_ID = "test-id";
      process.env.GOOGLE_CLIENT_SECRET = "test-secret";

      const gmail = findService("gmail")!;
      expect(isServiceConfigured(gmail)).toBe(true);

      // Restore
      if (originalEnv) {
        process.env.GOOGLE_CLIENT_ID = originalEnv;
      } else {
        delete process.env.GOOGLE_CLIENT_ID;
      }
      delete process.env.GOOGLE_CLIENT_SECRET;
    });
  });
});
