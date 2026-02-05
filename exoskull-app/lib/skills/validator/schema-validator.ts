// =====================================================
// SCHEMA VALIDATOR - Validates IModExecutor compliance
// Ensures generated code implements the required interface
// =====================================================

import * as ts from "typescript";
import { SchemaValidationResult } from "../types";

const REQUIRED_METHODS = [
  "getData",
  "getInsights",
  "executeAction",
  "getActions",
];

/**
 * Validates that generated code properly implements IModExecutor
 */
export function validateSchema(code: string): SchemaValidationResult {
  const errors: string[] = [];
  const slugHolder: { value: string | null } = { value: null };
  const detectedMethods: string[] = [];
  const detectedActions: string[] = [];

  // Parse the code
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
      valid: false,
      errors: [`Failed to parse code: ${(error as Error).message}`],
      detectedSlug: null,
      detectedMethods: [],
      detectedActions: [],
    };
  }

  // Find class declarations
  let classFound = false;
  let factoryFunctionFound = false;

  function visit(node: ts.Node) {
    // Find class with required methods
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      classFound = true;
      analyzeClass(node, errors, detectedMethods, (slug) => {
        slugHolder.value = slug;
      });
    }

    // Find createExecutor factory function
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "createExecutor"
    ) {
      factoryFunctionFound = true;
    }

    // Also check for: function createExecutor() assigned as variable
    if (ts.isVariableStatement(node)) {
      const declarations = node.declarationList.declarations;
      for (const decl of declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === "createExecutor") {
          factoryFunctionFound = true;
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Validate class found
  if (!classFound) {
    errors.push(
      "No class declaration found. Generated code must contain a class.",
    );
  }

  // Validate factory function
  if (!factoryFunctionFound) {
    errors.push("Missing createExecutor() factory function at end of code.");
  }

  // Validate all required methods present
  for (const method of REQUIRED_METHODS) {
    if (!detectedMethods.includes(method)) {
      errors.push(`Missing required method: ${method}`);
    }
  }

  // Validate slug
  if (slugHolder.value && !slugHolder.value.startsWith("custom-")) {
    errors.push(`Slug must start with "custom-", got: "${slugHolder.value}"`);
  }

  if (!slugHolder.value) {
    errors.push(
      'Could not detect slug property on class. Must have: readonly slug = "custom-..."',
    );
  }

  // Extract action slugs from getActions return statements
  extractActionSlugs(code, detectedActions);

  return {
    valid: errors.length === 0,
    errors,
    detectedSlug: slugHolder.value,
    detectedMethods,
    detectedActions,
  };
}

/**
 * Analyze a class node for IModExecutor compliance
 */
function analyzeClass(
  node: ts.ClassDeclaration | ts.ClassExpression,
  errors: string[],
  detectedMethods: string[],
  onSlug: (slug: string) => void,
) {
  if (!node.members) return;

  for (const member of node.members) {
    // Check for slug property
    if (ts.isPropertyDeclaration(member) && member.name) {
      const name = ts.isIdentifier(member.name) ? member.name.text : "";
      if (
        name === "slug" &&
        member.initializer &&
        ts.isStringLiteral(member.initializer)
      ) {
        onSlug(member.initializer.text);
      }
    }

    // Check for methods
    if (ts.isMethodDeclaration(member) && member.name) {
      const name = ts.isIdentifier(member.name) ? member.name.text : "";
      if (REQUIRED_METHODS.includes(name)) {
        detectedMethods.push(name);
      }
    }
  }
}

/**
 * Extract action slugs from getActions method body using regex
 * (Simpler than full AST traversal for this specific case)
 */
function extractActionSlugs(code: string, detectedActions: string[]) {
  // Match slug: "action_name" patterns within getActions
  const getActionsMatch = code.match(
    /getActions\s*\(\s*\)\s*(?::\s*\w+(?:\[\])?)?\s*\{([\s\S]*?)^\s*\}/m,
  );
  if (getActionsMatch) {
    const body = getActionsMatch[1];
    const slugMatches = body.matchAll(/slug\s*:\s*["']([^"']+)["']/g);
    for (const match of slugMatches) {
      detectedActions.push(match[1]);
    }
  }
}
