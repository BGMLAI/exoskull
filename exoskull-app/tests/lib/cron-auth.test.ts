import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Set env before importing
process.env.CRON_SECRET = "test-cron-secret";

import { verifyCronAuth } from "@/lib/cron/auth";

describe("verifyCronAuth", () => {
  it("should return true for valid CRON_SECRET in Authorization header", () => {
    const req = new NextRequest(
      new URL("/api/cron/test", "http://localhost:3000"),
      {
        method: "GET",
        headers: { Authorization: "Bearer test-cron-secret" },
      },
    );
    expect(verifyCronAuth(req)).toBe(true);
  });

  it("should return false for invalid secret", () => {
    const req = new NextRequest(
      new URL("/api/cron/test", "http://localhost:3000"),
      {
        method: "GET",
        headers: { Authorization: "Bearer wrong-secret" },
      },
    );
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("should return false for missing Authorization header", () => {
    const req = new NextRequest(
      new URL("/api/cron/test", "http://localhost:3000"),
      { method: "GET" },
    );
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("should return false for non-Bearer token", () => {
    const req = new NextRequest(
      new URL("/api/cron/test", "http://localhost:3000"),
      {
        method: "GET",
        headers: { Authorization: "Basic test-cron-secret" },
      },
    );
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("should accept x-cron-secret header (admin trigger)", () => {
    const req = new NextRequest(
      new URL("/api/cron/test", "http://localhost:3000"),
      {
        method: "GET",
        headers: { "x-cron-secret": "test-cron-secret" },
      },
    );
    expect(verifyCronAuth(req)).toBe(true);
  });
});
