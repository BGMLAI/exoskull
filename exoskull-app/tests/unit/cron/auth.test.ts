import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyCronAuth } from "@/lib/cron/auth";
import { NextRequest } from "next/server";

function createMockRequest(headers: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost:3000/api/cron/test");
  const req = new NextRequest(url, { headers });
  return req;
}

describe("verifyCronAuth", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "test-secret-123");
  });

  it("accepts valid Bearer token", () => {
    const req = createMockRequest({ authorization: "Bearer test-secret-123" });
    expect(verifyCronAuth(req)).toBe(true);
  });

  it("accepts valid x-cron-secret header", () => {
    const req = createMockRequest({ "x-cron-secret": "test-secret-123" });
    expect(verifyCronAuth(req)).toBe(true);
  });

  it("rejects invalid Bearer token", () => {
    const req = createMockRequest({ authorization: "Bearer wrong-secret" });
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("rejects request without auth headers", () => {
    const req = createMockRequest();
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("rejects when CRON_SECRET is not set", () => {
    vi.stubEnv("CRON_SECRET", "");
    const req = createMockRequest({ authorization: "Bearer anything" });
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("allows any request in development mode", () => {
    vi.stubEnv("NODE_ENV", "development");
    const req = createMockRequest();
    expect(verifyCronAuth(req)).toBe(true);
  });
});
