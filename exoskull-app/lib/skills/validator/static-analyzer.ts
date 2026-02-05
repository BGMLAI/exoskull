// =====================================================
// STATIC ANALYZER - TypeScript AST-based code analysis
// Detects blocked patterns before sandbox execution
// =====================================================

import * as ts from "typescript";
import { StaticAnalysisResult } from "../types";

// Blocked identifiers - if any appear in the code, it fails
const BLOCKED_IDENTIFIERS = new Set([
  "eval",
  "Function",
  "require",
  "process",
  "fs",
  "child_process",
  "exec",
  "spawn",
  "execSync",
  "spawnSync",
  "__dirname",
  "__filename",
  "globalThis",
  "global",
  "window",
  "document",
  "XMLHttpRequest",
  "fetch",
  "WebSocket",
  "Worker",
  "SharedWorker",
  "importScripts",
]);

// Blocked property access patterns
const BLOCKED_PROPERTY_ACCESS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

// Blocked string patterns (checked via regex on raw source)
const BLOCKED_RAW_PATTERNS: { pattern: RegExp; description: string }[] = [
  { pattern: /import\s*\(/, description: "Dynamic import()" },
  { pattern: /require\s*\(/, description: "require() call" },
  { pattern: /process\.env/, description: "process.env access" },
  { pattern: /process\.exit/, description: "process.exit call" },
  {
    pattern: /constructor\s*\.\s*constructor/,
    description: "constructor.constructor escape",
  },
  {
    pattern: /Object\s*\.\s*getPrototypeOf/,
    description: "Object.getPrototypeOf access",
  },
  {
    pattern: /Object\s*\.\s*setPrototypeOf/,
    description: "Object.setPrototypeOf access",
  },
  { pattern: /Reflect\s*\./, description: "Reflect API access" },
  { pattern: /Proxy\s*\(/, description: "Proxy constructor" },
  { pattern: /Symbol\s*\./, description: "Symbol access" },
  { pattern: /with\s*\(/, description: "with statement" },
];

/**
 * Analyzes generated TypeScript code for security violations using AST
 */
export function analyzeCode(code: string): StaticAnalysisResult {
  const blockedPatterns: { pattern: string; line: number; column: number }[] =
    [];
  const warnings: string[] = [];

  // Phase 1: Raw text pattern matching (catches string-level tricks)
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const { pattern, description } of BLOCKED_RAW_PATTERNS) {
      if (pattern.test(lines[i])) {
        blockedPatterns.push({
          pattern: description,
          line: i + 1,
          column: lines[i].search(pattern) + 1,
        });
      }
    }
  }

  // Phase 2: AST analysis
  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      "generated-skill.ts",
      code,
      ts.ScriptTarget.ES2020,
      true,
      ts.ScriptKind.TS,
    );
  } catch (error) {
    return {
      passed: false,
      blockedPatterns: [
        {
          pattern: `Parse error: ${(error as Error).message}`,
          line: 1,
          column: 1,
        },
      ],
      warnings: ["Code could not be parsed as valid TypeScript"],
    };
  }

  // Walk the AST
  function visit(node: ts.Node) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );

    // Check identifiers against blocklist
    if (ts.isIdentifier(node)) {
      const name = node.text;
      if (BLOCKED_IDENTIFIERS.has(name)) {
        // Allow 'constructor' in class context (class declarations)
        const parent = node.parent;
        if (
          name === "constructor" &&
          parent &&
          ts.isConstructorDeclaration(parent)
        ) {
          // This is fine - it's a class constructor declaration
        } else if (name !== "constructor" || !isClassMemberContext(node)) {
          blockedPatterns.push({
            pattern: `Blocked identifier: ${name}`,
            line: line + 1,
            column: character + 1,
          });
        }
      }
    }

    // Check property access for dangerous patterns
    if (ts.isPropertyAccessExpression(node)) {
      const propertyName = node.name.text;
      if (BLOCKED_PROPERTY_ACCESS.has(propertyName)) {
        // Allow 'constructor' in legitimate TypeScript patterns
        if (propertyName === "constructor") {
          // Check if it's X.constructor.constructor (double-hop escape)
          if (
            ts.isPropertyAccessExpression(node.expression) &&
            ts.isPropertyAccessExpression(node.expression) &&
            (node.expression as ts.PropertyAccessExpression).name?.text ===
              "constructor"
          ) {
            blockedPatterns.push({
              pattern: "constructor.constructor escape attempt",
              line: line + 1,
              column: character + 1,
            });
          }
        } else {
          blockedPatterns.push({
            pattern: `Blocked property access: ${propertyName}`,
            line: line + 1,
            column: character + 1,
          });
        }
      }
    }

    // Check element access for string-based prototype access
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      const accessedKey = node.argumentExpression.text;
      if (BLOCKED_PROPERTY_ACCESS.has(accessedKey)) {
        blockedPatterns.push({
          pattern: `Blocked element access: ["${accessedKey}"]`,
          line: line + 1,
          column: character + 1,
        });
      }
    }

    // Check for import/export declarations
    if (ts.isImportDeclaration(node)) {
      blockedPatterns.push({
        pattern: "Import declaration not allowed",
        line: line + 1,
        column: character + 1,
      });
    }

    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      // Allow export - we'll strip it. Just warn.
      warnings.push(
        `Export statement at line ${line + 1} will be ignored in sandbox`,
      );
    }

    // Check for tagged template expressions (potential code execution)
    if (ts.isTaggedTemplateExpression(node)) {
      warnings.push(
        `Tagged template expression at line ${line + 1} - verify it's safe`,
      );
    }

    // Check for delete operator (could be used to remove safety checks)
    if (ts.isDeleteExpression(node)) {
      warnings.push(`Delete expression at line ${line + 1}`);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    passed: blockedPatterns.length === 0,
    blockedPatterns,
    warnings,
  };
}

/**
 * Check if a node is within a class member context (e.g., class declaration body)
 */
function isClassMemberContext(node: ts.Node): boolean {
  let current = node.parent;
  while (current) {
    if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
      return true;
    }
    if (ts.isConstructorDeclaration(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}
