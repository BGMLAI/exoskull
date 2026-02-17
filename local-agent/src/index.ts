#!/usr/bin/env node

/**
 * ExoSkull Local Agent CLI
 *
 * Commands:
 *   login              - Authenticate with ExoSkull
 *   logout             - Clear credentials
 *   start              - Start file watcher daemon
 *   stop               - Stop daemon
 *   sync               - One-time sync of all pending files
 *   status             - Show sync stats
 *   add <folder>       - Add folder to watch
 *   remove <folder>    - Remove folder from watch
 */

import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";

import { login, logout, isLoggedIn, getValidToken } from "./core/auth.js";
import { loadConfig, addFolder, removeFolder, loadCredentials } from "./core/config.js";
import { getDb, getStats, getFailedFiles, getRecentFiles, needsSync, closeDb } from "./core/state.js";
import { uploadFile, uploadFiles } from "./core/uploader.js";
import { startWatching, stopWatching } from "./core/watcher.js";
import { startDaemon, stopDaemon, isRunning, writePid, removePid } from "./core/daemon.js";
import { configureLogger, logger } from "./core/logger.js";
import { hashFile } from "./utils/file-hash.js";
import { isSupported } from "./utils/mime-types.js";

const TAG = "CLI";

// Helper to prompt for input
function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    let password = "";
    const onData = (ch: Buffer) => {
      const c = ch.toString("utf-8");
      if (c === "\n" || c === "\r" || c === "\u0004") {
        stdin.removeListener("data", onData);
        if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
        stdin.pause();
        process.stdout.write("\n");
        resolve(password);
      } else if (c === "\u007F" || c === "\b") {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (c === "\u0003") {
        // Ctrl+C
        process.exit(1);
      } else {
        password += c;
        process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}

// ============================================================================
// Commands
// ============================================================================

program
  .name("exo-agent")
  .description("ExoSkull Local Agent - sync local files to Knowledge Base")
  .version("0.1.0");

// LOGIN
program
  .command("login")
  .description("Authenticate with ExoSkull")
  .action(async () => {
    const email = await prompt("Email: ");
    const password = await promptPassword("Password: ");

    const spinner = ora("Logging in...").start();

    try {
      const creds = await login(email, password);
      spinner.succeed(`Logged in as ${chalk.cyan(creds.email)}`);
    } catch (error) {
      spinner.fail(
        `Login failed: ${error instanceof Error ? error.message : error}`,
      );
      process.exit(1);
    }
  });

// LOGOUT
program
  .command("logout")
  .description("Clear credentials")
  .action(() => {
    logout();
    console.log(chalk.green("Logged out."));
  });

// START
program
  .command("start")
  .description("Start file watcher daemon")
  .option("--foreground", "Run in foreground (don't daemonize)")
  .action(async (opts) => {
    if (!isLoggedIn()) {
      console.log(chalk.red("Not logged in. Run: exo-agent login"));
      process.exit(1);
    }

    if (opts.foreground) {
      // Run in foreground
      console.log(chalk.cyan("ExoSkull Agent running (foreground mode)"));
      console.log(chalk.gray("Press Ctrl+C to stop\n"));

      configureLogger({ file: true });
      const config = loadConfig();
      if (config.folders.length === 0) {
        console.log(
          chalk.yellow("No folders configured. Use: exo-agent add <folder>"),
        );
      }

      startWatching();

      // Handle shutdown
      const shutdown = () => {
        console.log(chalk.gray("\nShutting down..."));
        stopWatching();
        closeDb();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      // Keep process alive
      await new Promise(() => {});
    } else {
      // Daemonize
      if (isRunning()) {
        console.log(chalk.yellow("Daemon is already running."));
        return;
      }

      try {
        const pid = startDaemon();
        console.log(chalk.green(`Daemon started (PID ${pid})`));
      } catch (error) {
        console.log(
          chalk.red(
            `Failed to start: ${error instanceof Error ? error.message : error}`,
          ),
        );
        process.exit(1);
      }
    }
  });

// STOP
program
  .command("stop")
  .description("Stop file watcher daemon")
  .action(() => {
    if (stopDaemon()) {
      console.log(chalk.green("Daemon stopped."));
    } else {
      console.log(chalk.yellow("Daemon is not running."));
    }
  });

// SYNC
program
  .command("sync")
  .description("One-time sync of all pending files")
  .option("-d, --dry-run", "Show what would be synced without uploading")
  .action(async (opts) => {
    if (!isLoggedIn()) {
      console.log(chalk.red("Not logged in. Run: exo-agent login"));
      process.exit(1);
    }

    const config = loadConfig();
    if (config.folders.length === 0) {
      console.log(
        chalk.yellow("No folders configured. Use: exo-agent add <folder>"),
      );
      return;
    }

    // Validate token
    const spinner = ora("Validating token...").start();
    try {
      await getValidToken();
      spinner.succeed("Authenticated");
    } catch (error) {
      spinner.fail(
        `Auth failed: ${error instanceof Error ? error.message : error}`,
      );
      process.exit(1);
    }

    // Initialize state DB
    getDb();

    // Collect files from all watched folders
    const filesToSync: { path: string; watchedFolder: string; category: string }[] = [];

    for (const folder of config.folders) {
      const folderSpinner = ora(`Scanning: ${folder.path}`).start();
      const files = scanFolder(folder);
      folderSpinner.succeed(`Found ${files.length} files in ${folder.path}`);

      for (const file of files) {
        try {
          const hash = await hashFile(file);
          if (needsSync(file, hash)) {
            filesToSync.push({
              path: file,
              watchedFolder: folder.path,
              category: folder.category,
            });
          }
        } catch (error) {
          logger.warn(TAG, `Cannot hash: ${file}`, {
            error: error instanceof Error ? error.message : error,
          });
        }
      }
    }

    if (filesToSync.length === 0) {
      console.log(chalk.green("\nAll files are synced!"));
      closeDb();
      return;
    }

    console.log(chalk.cyan(`\n${filesToSync.length} file(s) to sync:`));
    for (const f of filesToSync.slice(0, 20)) {
      console.log(`  ${chalk.gray("→")} ${path.basename(f.path)}`);
    }
    if (filesToSync.length > 20) {
      console.log(chalk.gray(`  ... and ${filesToSync.length - 20} more`));
    }

    if (opts.dryRun) {
      console.log(chalk.yellow("\nDry run — no files uploaded."));
      closeDb();
      return;
    }

    // Upload
    console.log();
    const uploadSpinner = ora("Uploading...").start();
    const results = await uploadFiles(filesToSync, config.upload.concurrent);

    const succeeded = results.filter((r) => r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.success).length;

    uploadSpinner.succeed("Sync complete");
    console.log(
      `  ${chalk.green(`${succeeded} uploaded`)}  ${chalk.blue(`${skipped} skipped`)}  ${chalk.red(`${failed} failed`)}`,
    );

    if (failed > 0) {
      console.log(chalk.red("\nFailed files:"));
      for (const r of results.filter((r) => !r.success)) {
        console.log(`  ${chalk.red("✗")} ${path.basename(r.filePath)}: ${r.error}`);
      }
    }

    closeDb();
  });

// STATUS
program
  .command("status")
  .description("Show sync statistics")
  .option("--failed", "Show failed files")
  .option("--recent", "Show recent files")
  .action((opts) => {
    const creds = loadCredentials();
    const config = loadConfig();
    const running = isRunning();

    console.log(chalk.bold("\n  ExoSkull Agent Status\n"));

    // Auth
    if (creds) {
      console.log(`  Account:  ${chalk.cyan(creds.email)}`);
    } else {
      console.log(`  Account:  ${chalk.red("Not logged in")}`);
    }

    // Daemon
    console.log(
      `  Daemon:   ${running ? chalk.green("Running") : chalk.gray("Stopped")}`,
    );

    // Folders
    console.log(`  Folders:  ${config.folders.length}`);
    for (const f of config.folders) {
      console.log(`            ${chalk.gray("→")} ${f.path} [${f.category}]`);
    }

    // Stats
    try {
      getDb();
      const stats = getStats();
      console.log(`\n  ${chalk.bold("Sync Stats:")}`);
      console.log(`    Total:     ${stats.total}`);
      console.log(`    Synced:    ${chalk.green(stats.synced)}`);
      console.log(`    Pending:   ${chalk.yellow(stats.pending)}`);
      console.log(`    Uploading: ${chalk.blue(stats.uploading)}`);
      console.log(`    Failed:    ${chalk.red(stats.failed)}`);
      console.log(`    Skipped:   ${chalk.gray(stats.skipped)}`);

      if (opts.failed) {
        const failed = getFailedFiles();
        if (failed.length > 0) {
          console.log(chalk.red(`\n  Failed Files:`));
          for (const f of failed) {
            console.log(
              `    ${chalk.red("✗")} ${path.basename(f.file_path)}: ${f.error_message}`,
            );
          }
        }
      }

      if (opts.recent) {
        const recent = getRecentFiles(10);
        if (recent.length > 0) {
          console.log(`\n  Recent Files:`);
          for (const f of recent) {
            const icon =
              f.status === "synced"
                ? chalk.green("✓")
                : f.status === "failed"
                  ? chalk.red("✗")
                  : chalk.yellow("•");
            console.log(
              `    ${icon} ${path.basename(f.file_path)} [${f.status}]`,
            );
          }
        }
      }

      closeDb();
    } catch {
      console.log(chalk.gray("\n  No sync history yet."));
    }

    console.log();
  });

// ADD
program
  .command("add <folder>")
  .description("Add folder to watch")
  .option("-c, --category <category>", "Document category", "other")
  .option("--no-recursive", "Don't watch subfolders")
  .option("-i, --include <patterns...>", "Include file patterns")
  .option("-e, --exclude <patterns...>", "Exclude file patterns")
  .action((folder, opts) => {
    try {
      const config = addFolder(folder, {
        category: opts.category,
        recursive: opts.recursive,
        include: opts.include,
        exclude: opts.exclude,
      });

      const resolved = path.resolve(folder);
      console.log(chalk.green(`Added: ${resolved}`));
      console.log(chalk.gray(`  Category: ${opts.category}`));
      console.log(chalk.gray(`  Recursive: ${opts.recursive}`));
      console.log(
        chalk.gray(`  Total watched folders: ${config.folders.length}`),
      );

      if (isRunning()) {
        console.log(
          chalk.yellow("\nRestart daemon to pick up changes: exo-agent stop && exo-agent start"),
        );
      }
    } catch (error) {
      console.log(
        chalk.red(error instanceof Error ? error.message : String(error)),
      );
      process.exit(1);
    }
  });

// REMOVE
program
  .command("remove <folder>")
  .description("Remove folder from watch")
  .action((folder) => {
    try {
      const config = removeFolder(folder);
      console.log(chalk.green(`Removed: ${path.resolve(folder)}`));
      console.log(
        chalk.gray(`  Remaining watched folders: ${config.folders.length}`),
      );
    } catch (error) {
      console.log(
        chalk.red(error instanceof Error ? error.message : String(error)),
      );
      process.exit(1);
    }
  });

// HIDDEN: _daemon (internal - spawned by `start`)
program
  .command("_daemon", { hidden: true })
  .action(async () => {
    configureLogger({ file: true, level: "info" });
    writePid(process.pid);

    logger.info(TAG, "Daemon started", { pid: process.pid });

    startWatching();

    const shutdown = () => {
      logger.info(TAG, "Daemon shutting down");
      stopWatching();
      closeDb();
      removePid();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Keep alive
    await new Promise(() => {});
  });

// ============================================================================
// Helpers
// ============================================================================

function scanFolder(folder: {
  path: string;
  recursive: boolean;
  filters?: { include?: string[]; exclude?: string[] };
}): string[] {
  const files: string[] = [];
  const resolved = path.resolve(folder.path);

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const SKIP_DIRS = new Set([
          "node_modules", ".git", ".next", "dist", "__pycache__",
          ".cache", ".vscode", ".idea", "AppData", "$RECYCLE.BIN",
          "System Volume Information", ".Trash", "__MACOSX",
          ".tox", ".mypy_cache", ".pytest_cache", ".parcel-cache", ".turbo",
        ]);
        if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
        if (folder.recursive) walk(fullPath);
      } else if (entry.isFile()) {
        if (!isSupported(fullPath)) continue;
        if (!matchesFilter(fullPath, folder.filters)) continue;
        files.push(fullPath);
      }
    }
  }

  walk(resolved);
  return files;
}

function matchesFilter(
  filePath: string,
  filters?: { include?: string[]; exclude?: string[] },
): boolean {
  if (!filters) return true;
  const filename = path.basename(filePath);

  if (filters.exclude) {
    for (const pattern of filters.exclude) {
      if (matchGlob(filename, pattern)) return false;
    }
  }

  if (filters.include && filters.include.length > 0) {
    for (const pattern of filters.include) {
      if (matchGlob(filename, pattern)) return true;
    }
    return false;
  }

  return true;
}

function matchGlob(filename: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`, "i").test(filename);
}

// ============================================================================
// Run
// ============================================================================

program.parse();
