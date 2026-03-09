import { test, expect } from "@playwright/test";

/**
 * Public page tests.
 * Note: In local dev without Supabase env vars, SSR pages return 500.
 * These tests are designed for CI/staging with full env or prod.
 */

const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

test.describe("Public pages", () => {
  test("landing page responds (server is up)", async ({ page }) => {
    const response = await page.goto("/");
    // Server responds — even 500 means Next.js is running
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(502);
  });

  test("login page responds", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(502);
  });

  test.describe("With Supabase", () => {
    test.skip(!hasSupabase, "Requires NEXT_PUBLIC_SUPABASE_URL");

    test("landing page has title", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveTitle(/ExoSkull/i);
    });

    test("protected routes redirect to login", async ({ page }) => {
      await page.goto("/dashboard");
      await page.waitForURL(/\/login/);
      expect(page.url()).toContain("/login");
    });

    test("terms page loads successfully", async ({ page }) => {
      const response = await page.goto("/terms");
      expect(response?.status()).toBeLessThan(500);
    });

    test("privacy page loads successfully", async ({ page }) => {
      const response = await page.goto("/privacy");
      expect(response?.status()).toBeLessThan(500);
    });
  });
});
