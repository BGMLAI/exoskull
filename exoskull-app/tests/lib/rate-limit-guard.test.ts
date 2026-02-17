import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/api/rate-limit-guard";

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock auth + rate limiter (lazy-imported inside the guard)
const mockVerifyTenantAuth = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockIncrementUsage = vi.fn();

vi.mock("@/lib/auth/verify-tenant", () => ({
  verifyTenantAuth: (...args: unknown[]) => mockVerifyTenantAuth(...args),
}));

vi.mock("@/lib/business/rate-limiter", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  incrementUsage: (...args: unknown[]) => mockIncrementUsage(...args),
}));

function createRequest(
  method: string = "POST",
  path: string = "/api/test",
): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), { method });
}

describe("withRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyTenantAuth.mockResolvedValue({
      ok: true,
      tenantId: "tenant-123",
    });
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      current: 1,
      limit: 50,
    });
    mockIncrementUsage.mockResolvedValue(undefined);
  });

  it("should pass through when rate limit allows", async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit("ai_requests", handler);
    const response = await wrapped(createRequest());
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("should return 429 when rate limit exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      current: 20,
      limit: 20,
      tier: "free",
      upgradeMessage: "Upgrade to Basic for more requests",
    });
    const handler = vi.fn();
    const wrapped = withRateLimit("ai_requests", handler);
    const response = await wrapped(createRequest());
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe("Rate limit exceeded");
    expect(body.tier).toBe("free");
    expect(handler).not.toHaveBeenCalled();
  });

  it("should return 401 when auth fails", async () => {
    mockVerifyTenantAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const handler = vi.fn();
    const wrapped = withRateLimit("ai_requests", handler);
    const response = await wrapped(createRequest());
    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("should increment usage on successful response", async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit("ai_requests", handler);
    await wrapped(createRequest());
    // incrementUsage is fire-and-forget, give it a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(mockIncrementUsage).toHaveBeenCalledWith(
      "tenant-123",
      "ai_requests",
    );
  });

  it("should NOT increment usage on error response", async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(new Response("error", { status: 500 }));
    const wrapped = withRateLimit("ai_requests", handler);
    await wrapped(createRequest());
    await new Promise((r) => setTimeout(r, 10));
    expect(mockIncrementUsage).not.toHaveBeenCalled();
  });

  it("should skip increment when skipIncrement option set", async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit("conversations", handler, {
      skipIncrement: true,
    });
    await wrapped(createRequest());
    await new Promise((r) => setTimeout(r, 10));
    expect(mockIncrementUsage).not.toHaveBeenCalled();
  });

  it("should use custom extractTenantId when provided", async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit("conversations", handler, {
      extractTenantId: async () => "custom-tenant",
    });
    await wrapped(createRequest());
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "custom-tenant",
      "conversations",
    );
    expect(mockVerifyTenantAuth).not.toHaveBeenCalled();
  });

  it("should fail open when rate limit check throws", async () => {
    mockCheckRateLimit.mockRejectedValue(new Error("DB down"));
    const handler = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit("ai_requests", handler);
    const response = await wrapped(createRequest());
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("should forward context parameter to handler", async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit("ai_requests", handler);
    const ctx = { params: Promise.resolve({ id: "123" }) };
    await wrapped(createRequest(), ctx);
    expect(handler).toHaveBeenCalledWith(expect.anything(), ctx);
  });
});
