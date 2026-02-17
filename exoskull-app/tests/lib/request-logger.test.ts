import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { withApiLog } from "@/lib/api/request-logger";

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock lazy import of admin logger (fire-and-forget DB logging)
vi.mock("@/lib/admin/logger", () => ({
  logApiRequest: vi.fn(),
}));

function createRequest(
  method: string = "GET",
  path: string = "/api/test",
): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), { method });
}

describe("withApiLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass through successful responses", async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const wrapped = withApiLog(handler);
    const response = await wrapped(createRequest());
    expect(response.status).toBe(200);
  });

  it("should add x-request-id header to response", async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const wrapped = withApiLog(handler);
    const response = await wrapped(createRequest());
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("should preserve request-id from incoming request", async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withApiLog(handler);
    const req = new NextRequest(new URL("/api/test", "http://localhost:3000"), {
      method: "GET",
      headers: { "x-request-id": "custom-id-123" },
    });
    const response = await wrapped(req);
    expect(response.headers.get("x-request-id")).toBe("custom-id-123");
  });

  it("should return 500 on unhandled handler error", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("Boom!"));
    const wrapped = withApiLog(handler);
    const response = await wrapped(createRequest());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Internal server error");
  });

  it("should preserve original response status", async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
      );
    const wrapped = withApiLog(handler);
    const response = await wrapped(createRequest());
    expect(response.status).toBe(404);
  });

  it("should forward context parameter to handler", async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withApiLog(handler);
    const ctx = { params: Promise.resolve({ id: "123" }) };
    await wrapped(createRequest(), ctx);
    expect(handler).toHaveBeenCalledWith(expect.anything(), ctx);
  });
});
