// =====================================================
// RESTRICTED FUNCTION - Sandbox execution engine
// Executes generated skill code with limited scope
// =====================================================

import * as vm from "node:vm";
import { SkillExecutionResult, SkillExecutionContext } from "../types";
import {
  createSupabaseProxy,
  createConsoleProxy,
  ProxyCallLog,
} from "./supabase-proxy";
import { IModExecutor } from "@/lib/mods/types";

import { logger } from "@/lib/logger";
const EXECUTION_TIMEOUT_MS = 5000;

/**
 * Blocked code patterns that could escape the sandbox.
 * Validated BEFORE execution as defense-in-depth.
 */
const BLOCKED_PATTERNS = [
  /\.constructor\s*[\[(]/, // prototype chain escape
  /\.__proto__/, // prototype manipulation
  /\bprocess\b/, // Node.js process access
  /\brequire\s*\(/, // CommonJS require
  /\bimport\s*\(/, // Dynamic import
  /\bglobalThis\b/, // Global scope access
  /\beval\s*\(/, // eval execution
  /\bFunction\s*\(/, // Function constructor
  /\bProxy\s*\(/, // Proxy creation
  /\bReflect\b/, // Reflect API
  /\bSymbol\b/, // Symbol access (prototype manipulation)
  /\bWeakRef\b/, // WeakRef access
  /\bFinalizationRegistry\b/, // GC manipulation
];

function validateCode(code: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return `Blocked pattern detected: ${pattern.source}`;
    }
  }
  return null;
}

/**
 * Execute generated skill code in a restricted sandbox.
 *
 * The code runs inside a new Function() with ONLY these injected:
 * - supabase: Proxied client (tenant-isolated, method-restricted)
 * - console: Proxied (capture-only, no side effects)
 * - Date, JSON, Math, Promise, Array, Object, Map, Set, String, Number, Boolean, RegExp, Error
 *
 * Blocked: require, import, process, fs, globalThis, window, fetch, eval, Function
 */
export async function executeInSandbox(
  context: SkillExecutionContext,
  code: string,
): Promise<SkillExecutionResult> {
  const startTime = performance.now();
  const callLog: ProxyCallLog[] = [];

  try {
    // Validate code against blocked patterns BEFORE execution
    const validationError = validateCode(code);
    if (validationError) {
      return {
        success: false,
        error: `Code validation failed: ${validationError}`,
        executionTimeMs: Math.round(performance.now() - startTime),
      };
    }

    // Create restricted scope
    const supabaseProxy = createSupabaseProxy(context.tenant_id, callLog);
    const { proxy: consoleProxy, logs: consoleLogs } = createConsoleProxy();

    // Build the executor from code
    const executor = buildExecutor(code, supabaseProxy, consoleProxy);

    if (!executor) {
      return {
        success: false,
        error: "Failed to instantiate executor from generated code",
        executionTimeMs: performance.now() - startTime,
      };
    }

    // Execute the requested method with timeout
    const result = await executeWithTimeout(
      () => callMethod(executor, context),
      EXECUTION_TIMEOUT_MS,
    );

    const executionTimeMs = Math.round(performance.now() - startTime);

    return {
      success: true,
      result,
      executionTimeMs,
    };
  } catch (error) {
    const executionTimeMs = Math.round(performance.now() - startTime);
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error("[Sandbox] Execution error:", {
      error: errorMessage,
      skill_id: context.skill_id,
      method: context.method,
      tenant_id: context.tenant_id,
    });

    return {
      success: false,
      error: errorMessage,
      executionTimeMs,
    };
  }
}

/**
 * Build an executor instance from generated code string
 */
function buildExecutor(
  code: string,
  supabaseProxy: Record<string, unknown>,
  consoleProxy: Record<string, unknown>,
): IModExecutor | null {
  try {
    // Create a restricted scope with only safe globals
    // The generated code expects: supabase, console, Date, JSON, Math, etc.
    const scopeVars = [
      "supabase",
      "console",
      "Date",
      "JSON",
      "Math",
      "Promise",
      "Array",
      "Object",
      "Map",
      "Set",
      "String",
      "Number",
      "Boolean",
      "RegExp",
      "Error",
      "parseInt",
      "parseFloat",
      "isNaN",
      "isFinite",
      "encodeURIComponent",
      "decodeURIComponent",
      "setTimeout",
      "clearTimeout",
    ];

    const scopeValues = [
      supabaseProxy,
      consoleProxy,
      Date,
      JSON,
      Math,
      Promise,
      Array,
      Object,
      Map,
      Set,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      // Provide a restricted setTimeout that respects timeout
      (fn: () => void, ms: number) =>
        setTimeout(fn, Math.min(ms, EXECUTION_TIMEOUT_MS)),
      clearTimeout,
    ];

    // Build sandbox context with only safe globals
    const sandboxContext: Record<string, unknown> = {};
    for (let i = 0; i < scopeVars.length; i++) {
      sandboxContext[scopeVars[i]] = scopeValues[i];
    }

    // Freeze all injected objects to prevent modification
    for (const val of Object.values(sandboxContext)) {
      if (val && typeof val === "object") {
        try {
          Object.freeze(val);
        } catch {
          /* some built-ins can't be frozen */
        }
      }
    }

    // Create an isolated V8 context — prevents prototype chain escapes
    const vmContext = vm.createContext(sandboxContext, {
      codeGeneration: { strings: false, wasm: false },
    });

    // The code should end with: function createExecutor() { return new XClass(); }
    const wrappedCode = `
      "use strict";
      ${code}
      createExecutor();
    `;

    const executor = vm.runInContext(wrappedCode, vmContext, {
      timeout: EXECUTION_TIMEOUT_MS,
      filename: `skill-${Date.now()}.js`,
    });

    // Validate the executor has required methods
    if (!executor || typeof executor.getData !== "function") {
      return null;
    }

    return executor as IModExecutor;
  } catch (error) {
    logger.error("[Sandbox] Failed to build executor:", error);
    return null;
  }
}

/**
 * Call the appropriate method on the executor
 */
async function callMethod(
  executor: IModExecutor,
  context: SkillExecutionContext,
): Promise<unknown> {
  const { method, args } = context;

  switch (method) {
    case "getData":
      return executor.getData(context.tenant_id);

    case "getInsights":
      return executor.getInsights(context.tenant_id);

    case "executeAction": {
      const [action, params] = args as [string, Record<string, unknown>];
      return executor.executeAction(context.tenant_id, action, params);
    }

    case "getActions":
      return executor.getActions();

    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

/**
 * Execute a function with a timeout
 */
async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Execution timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ]);
}
