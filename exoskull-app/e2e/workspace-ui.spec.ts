import { test, expect } from "@playwright/test";

/**
 * Workspace UI tests — structural only (no auth required for component rendering).
 * These test that the UI components compile and render correctly.
 * Full integration tests require authenticated session.
 */

test.describe("Workspace UI (requires auth — skip in CI)", () => {
  test.skip(
    () => !process.env.TEST_AUTH_COOKIE,
    "Skipped: requires TEST_AUTH_COOKIE for authenticated tests",
  );

  test("workspace toggle button appears on dashboard", async ({ page }) => {
    // Set auth cookie if provided
    if (process.env.TEST_AUTH_COOKIE) {
      await page.context().addCookies([
        {
          name: "sb-access-token",
          value: process.env.TEST_AUTH_COOKIE,
          domain: new URL(process.env.BASE_URL || "http://localhost:3000")
            .hostname,
          path: "/",
        },
      ]);
    }

    await page.goto("/dashboard");

    // Workspace toggle should be visible
    const workspaceBtn = page.getByTitle("Toggle Shared Workspace");
    await expect(workspaceBtn).toBeVisible();
  });

  test("clicking workspace toggle opens split layout", async ({ page }) => {
    if (process.env.TEST_AUTH_COOKIE) {
      await page.context().addCookies([
        {
          name: "sb-access-token",
          value: process.env.TEST_AUTH_COOKIE,
          domain: new URL(process.env.BASE_URL || "http://localhost:3000")
            .hostname,
          path: "/",
        },
      ]);
    }

    await page.goto("/dashboard");

    const workspaceBtn = page.getByTitle("Toggle Shared Workspace");
    await workspaceBtn.click();

    // Shared Workspace header should appear
    await expect(page.getByText("Shared Workspace")).toBeVisible();

    // Browser, Terminal, Panels tabs should be visible
    await expect(page.getByText("Browser")).toBeVisible();
    await expect(page.getByText("Terminal")).toBeVisible();
    await expect(page.getByText("Panels")).toBeVisible();
  });

  test("workspace terminal accepts input", async ({ page }) => {
    if (process.env.TEST_AUTH_COOKIE) {
      await page.context().addCookies([
        {
          name: "sb-access-token",
          value: process.env.TEST_AUTH_COOKIE,
          domain: new URL(process.env.BASE_URL || "http://localhost:3000")
            .hostname,
          path: "/",
        },
      ]);
    }

    await page.goto("/dashboard");

    // Open workspace
    const workspaceBtn = page.getByTitle("Toggle Shared Workspace");
    await workspaceBtn.click();

    // Switch to terminal tab
    await page.getByText("Terminal").click();

    // Terminal input should be visible
    const terminalInput = page.getByPlaceholder("Enter command...");
    await expect(terminalInput).toBeVisible();

    // Type a command
    await terminalInput.fill("echo hello");
    expect(await terminalInput.inputValue()).toBe("echo hello");
  });

  test("workspace URL bar accepts input", async ({ page }) => {
    if (process.env.TEST_AUTH_COOKIE) {
      await page.context().addCookies([
        {
          name: "sb-access-token",
          value: process.env.TEST_AUTH_COOKIE,
          domain: new URL(process.env.BASE_URL || "http://localhost:3000")
            .hostname,
          path: "/",
        },
      ]);
    }

    await page.goto("/dashboard");

    // Open workspace
    const workspaceBtn = page.getByTitle("Toggle Shared Workspace");
    await workspaceBtn.click();

    // URL input should be visible in browser tab
    const urlInput = page.getByPlaceholder("Enter URL or search...");
    await expect(urlInput).toBeVisible();

    // Type a URL
    await urlInput.fill("https://example.com");
    expect(await urlInput.inputValue()).toBe("https://example.com");
  });
});
