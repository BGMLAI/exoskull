import { describe, it, expect } from "vitest";
import { validateSchema } from "../../../lib/skills/validator/schema-validator";

describe("SchemaValidator", () => {
  const validCode = `
class WaterTrackerExecutor {
  readonly slug = "custom-water-tracker";

  async getData(tenant_id: string) {
    return { entries: [] };
  }

  async getInsights(tenant_id: string) {
    return [];
  }

  async executeAction(tenant_id: string, action: string, params: Record<string, unknown>) {
    if (action === "log_water") {
      return { success: true };
    }
    return { success: false, error: "Unknown action" };
  }

  getActions() {
    return [
      {
        slug: "log_water",
        name: "Log water",
        description: "Log water intake",
        params_schema: { type: "object", required: ["amount_ml"], properties: { amount_ml: { type: "number" } } }
      }
    ];
  }
}

function createExecutor() { return new WaterTrackerExecutor(); }
`;

  it("validates correct IModExecutor structure", () => {
    const result = validateSchema(validCode);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.detectedSlug).toBe("custom-water-tracker");
    expect(result.detectedMethods).toContain("getData");
    expect(result.detectedMethods).toContain("getInsights");
    expect(result.detectedMethods).toContain("executeAction");
    expect(result.detectedMethods).toContain("getActions");
  });

  it("detects action slugs from getActions", () => {
    const result = validateSchema(validCode);
    expect(result.detectedActions).toContain("log_water");
  });

  it("rejects missing getData method", () => {
    const code = `
class BadExecutor {
  readonly slug = "custom-bad";

  async getInsights(tenant_id: string) { return []; }
  async executeAction(tenant_id: string, action: string, params: Record<string, unknown>) { return { success: false }; }
  getActions() { return []; }
}

function createExecutor() { return new BadExecutor(); }
`;

    const result = validateSchema(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("getData"))).toBe(true);
  });

  it("rejects missing getInsights method", () => {
    const code = `
class BadExecutor {
  readonly slug = "custom-bad";

  async getData(tenant_id: string) { return {}; }
  async executeAction(tenant_id: string, action: string, params: Record<string, unknown>) { return { success: false }; }
  getActions() { return []; }
}

function createExecutor() { return new BadExecutor(); }
`;

    const result = validateSchema(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("getInsights"))).toBe(true);
  });

  it("rejects non-custom slug prefix", () => {
    const code = `
class BadExecutor {
  readonly slug = "bad-prefix";

  async getData(tenant_id: string) { return {}; }
  async getInsights(tenant_id: string) { return []; }
  async executeAction(tenant_id: string, action: string, params: Record<string, unknown>) { return { success: false }; }
  getActions() { return []; }
}

function createExecutor() { return new BadExecutor(); }
`;

    const result = validateSchema(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("custom-"))).toBe(true);
  });

  it("rejects code without a class", () => {
    const code = `
const obj = {
  slug: "custom-test",
  getData: async () => ({}),
  getInsights: async () => [],
  executeAction: async () => ({ success: false }),
  getActions: () => [],
};

function createExecutor() { return obj; }
`;

    const result = validateSchema(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("class"))).toBe(true);
  });

  it("rejects code without createExecutor factory function", () => {
    const code = `
class TestExecutor {
  readonly slug = "custom-test";

  async getData(tenant_id: string) { return {}; }
  async getInsights(tenant_id: string) { return []; }
  async executeAction(tenant_id: string, action: string, params: Record<string, unknown>) { return { success: false }; }
  getActions() { return []; }
}
`;

    const result = validateSchema(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("createExecutor"))).toBe(true);
  });

  it("handles unparseable code", () => {
    const code = "this is {{ not valid typescript";

    const result = validateSchema(code);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects code missing slug property", () => {
    const code = `
class NoSlugExecutor {
  async getData(tenant_id: string) { return {}; }
  async getInsights(tenant_id: string) { return []; }
  async executeAction(tenant_id: string, action: string, params: Record<string, unknown>) { return { success: false }; }
  getActions() { return []; }
}

function createExecutor() { return new NoSlugExecutor(); }
`;

    const result = validateSchema(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("slug"))).toBe(true);
  });
});
