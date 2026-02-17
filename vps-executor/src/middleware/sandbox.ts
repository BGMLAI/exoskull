/**
 * Sandbox middleware — restricts file operations to allowed directories.
 *
 * Prevents path traversal attacks and access to sensitive system files.
 * Only /root/projects/, /root/.claude/, and GOTCHA framework dirs are allowed.
 */

import * as path from "path";

const ALLOWED_ROOTS = [
  "/root/projects",
  "/root/.claude",
  "/root/goals",
  "/root/tools",
  "/root/context",
  "/root/hardprompts",
  "/root/args",
];

// Paths that should never be read or written
const BLOCKED_PATTERNS = [
  /\.env$/,
  /\.env\./,
  /credentials/i,
  /secret/i,
  /\.ssh/,
  /\.gnupg/,
  /id_rsa/,
  /id_ed25519/,
  /\.pem$/,
  /\.key$/,
];

/**
 * Resolve a file path and validate it's within allowed directories.
 * Throws if path is outside sandbox or matches blocked patterns.
 */
export function resolveSafePath(filePath: string): string {
  // Normalize and resolve
  const resolved = path.resolve(filePath);

  // Check against allowed roots
  const isAllowed = ALLOWED_ROOTS.some((root) => resolved.startsWith(root));
  if (!isAllowed) {
    throw new Error(
      `Access denied: ${filePath} is outside allowed directories (${ALLOWED_ROOTS.join(", ")})`,
    );
  }

  // Check against blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(resolved)) {
      throw new Error(`Access denied: ${filePath} matches blocked pattern`);
    }
  }

  return resolved;
}

/**
 * Validate a working directory for bash/git commands.
 * Must be within /root/projects/ or other allowed roots.
 */
export function validateCwd(cwd?: string): string {
  if (!cwd) return "/root/projects";

  const resolved = path.resolve(cwd);
  const isAllowed = ALLOWED_ROOTS.some((root) => resolved.startsWith(root));

  if (!isAllowed) {
    throw new Error(
      `Access denied: working directory ${cwd} is outside allowed directories`,
    );
  }

  return resolved;
}

/**
 * Sanitize bash command — block dangerous operations.
 */
export function sanitizeCommand(command: string): void {
  const BLOCKED_COMMANDS = [
    /\brm\s+-rf\s+\//,         // rm -rf /
    /\bdd\s+if=/,              // dd if=
    /\bmkfs/,                  // mkfs
    /\bshutdown/,              // shutdown
    /\breboot/,                // reboot
    /\bsystemctl\s+(stop|disable|mask)/,
    /\bkill\s+-9\s+1\b/,      // kill -9 1
    />\s*\/dev\/sd/,           // write to block devices
    /\bcurl\b.*\|\s*bash/,     // curl | bash
    /\bwget\b.*\|\s*bash/,     // wget | bash
  ];

  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(command)) {
      throw new Error(`Blocked: dangerous command detected`);
    }
  }
}
