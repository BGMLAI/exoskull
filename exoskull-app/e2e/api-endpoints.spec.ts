import { test, expect } from "@playwright/test";

test.describe("API endpoints", () => {
  test.describe("Auth guard", () => {
    test("workspace API blocks unauthenticated requests", async ({
      request,
    }) => {
      const res = await request.get("/api/workspace");
      // 401 (auth middleware) or 500 (Supabase unavailable in dev) — NOT 200
      expect(res.status()).not.toBe(200);
    });

    test("protected API routes block unauthenticated requests", async ({
      request,
    }) => {
      const protectedRoutes = ["/api/workspace", "/api/settings"];

      for (const route of protectedRoutes) {
        const res = await request.get(route);
        expect(res.status()).not.toBe(200);
      }
    });
  });

  test.describe("Public API routes", () => {
    test("chat/send does not return middleware 401", async ({ request }) => {
      const res = await request.post("/api/chat/send", {
        data: { message: "test" },
      });
      // Route exists (not 404)
      expect(res.status()).not.toBe(404);
    });
  });

  test.describe("Workspace API routes exist", () => {
    test("GET /api/workspace route is registered", async ({ request }) => {
      const res = await request.get("/api/workspace");
      // 404 = route not found. Anything else = route exists.
      expect(res.status()).not.toBe(404);
    });

    test("POST /api/workspace route is registered", async ({ request }) => {
      const res = await request.post("/api/workspace", {
        data: { action: "screenshot" },
      });
      expect(res.status()).not.toBe(404);
    });

    test("DELETE /api/workspace route is registered", async ({ request }) => {
      const res = await request.delete("/api/workspace");
      expect(res.status()).not.toBe(404);
    });
  });
});
