import { describe, it, expect, vi } from "vitest";
import { safeErrorResponse } from "@/lib/api/error-response";

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("safeErrorResponse", () => {
  it("should return 500 status by default", () => {
    const response = safeErrorResponse(new Error("db failed"), {
      context: "[Test]",
    });
    expect(response.status).toBe(500);
  });

  it("should return custom status code", () => {
    const response = safeErrorResponse(new Error("not found"), {
      context: "[Test]",
      status: 404,
    });
    expect(response.status).toBe(404);
  });

  it("should return generic public message by default", async () => {
    const response = safeErrorResponse(new Error("secret db details"), {
      context: "[Test]",
    });
    const body = await response.json();
    expect(body.error).toBe("Internal server error");
    expect(body.error).not.toContain("secret");
  });

  it("should return custom public message", async () => {
    const response = safeErrorResponse(new Error("details"), {
      context: "[Test]",
      publicMessage: "Something went wrong",
    });
    const body = await response.json();
    expect(body.error).toBe("Something went wrong");
  });

  it("should log the real error server-side", async () => {
    const loggerMod = await import("@/lib/logger");
    const error = new Error("real db error with stack");
    safeErrorResponse(error, { context: "[Gateway:Telegram]" });
    expect(loggerMod.logger.error).toHaveBeenCalledWith(
      "[Gateway:Telegram] Error:",
      expect.objectContaining({
        message: "real db error with stack",
      }),
    );
  });

  it("should handle non-Error objects", async () => {
    const response = safeErrorResponse("string error", {
      context: "[Test]",
    });
    const body = await response.json();
    expect(body.error).toBe("Internal server error");
  });
});
