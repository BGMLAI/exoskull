import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to test the logger module. Since it reads process.env at module level,
// we mock it before import.
describe("logger", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it("should export debug, info, warn, error methods", async () => {
    const { logger } = await import("@/lib/logger");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("logger.error calls console.error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger } = await import("@/lib/logger");
    logger.error("test error", { code: 500 });
    expect(spy).toHaveBeenCalled();
  });

  it("logger.warn calls console.warn", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { logger } = await import("@/lib/logger");
    logger.warn("test warning");
    expect(spy).toHaveBeenCalled();
  });

  it("logger.info calls console.log in dev mode", async () => {
    process.env.NODE_ENV = "development";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Re-import to pick up env change — vitest caches modules, so use dynamic import
    const mod = await import("@/lib/logger");
    mod.logger.info("test info");
    expect(spy).toHaveBeenCalled();
  });
});
