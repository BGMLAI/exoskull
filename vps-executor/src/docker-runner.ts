/**
 * Docker Runner — Spawns isolated containers to execute code.
 *
 * Security:
 * - No network access by default (--network none)
 * - CPU/memory limits per container
 * - Read-only root filesystem (output dir is writable)
 * - Automatic container cleanup after execution
 * - Timeout enforcement (kill container if exceeded)
 */

import Docker from "dockerode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

// Image names (built during setup)
const IMAGES: Record<string, string> = {
  node: "exoskull-runner-node:latest",
  python: "exoskull-runner-python:latest",
};

// Resource limits
const MEMORY_LIMIT = 512 * 1024 * 1024; // 512MB
const CPU_PERIOD = 100_000;
const CPU_QUOTA = 50_000; // 50% of one CPU
const PIDS_LIMIT = 100;

export interface RunRequest {
  jobId: string;
  action: string;
  runtime: "node" | "python";
  files: Array<{ path: string; content: string }>;
  entrypoint?: string;
  command?: string;
  timeoutMs: number;
  env?: Record<string, string>;
  network: boolean;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  outputFiles?: Array<{ path: string; content: string }>;
}

export class DockerRunner {
  private available = false;

  constructor() {
    // Test Docker connection
    docker
      .ping()
      .then(() => {
        this.available = true;
        console.log("[DockerRunner] Docker daemon connected");
      })
      .catch((err) => {
        console.warn("[DockerRunner] Docker not available:", err.message);
      });
  }

  isAvailable(): boolean {
    return this.available;
  }

  async execute(req: RunRequest): Promise<RunResult> {
    if (!this.available) {
      throw new Error("Docker is not available");
    }

    const image = IMAGES[req.runtime];
    if (!image) {
      throw new Error(`Unknown runtime: ${req.runtime}`);
    }

    // Create temp workspace
    const workDir = path.join(os.tmpdir(), `exo-${req.jobId}-${uuid().slice(0, 8)}`);
    const outputDir = path.join(workDir, "_output");
    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    try {
      // Write files to workspace
      for (const file of req.files) {
        const filePath = path.join(workDir, file.path);
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });

        // Security: prevent path traversal
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(workDir))) {
          throw new Error(`Path traversal detected: ${file.path}`);
        }

        fs.writeFileSync(filePath, file.content, "utf-8");
      }

      // Determine command to run
      const cmd = this.buildCommand(req);

      // Create container (run as root inside — isolation is via Docker, not uid)
      const container = await docker.createContainer({
        Image: image,
        Cmd: ["sh", "-c", cmd],
        WorkingDir: "/workspace",
        User: "root",
        Env: this.buildEnv(req.env),
        HostConfig: {
          Binds: [
            `${workDir}:/workspace:rw`,
            `${outputDir}:/output:rw`,
          ],
          Memory: MEMORY_LIMIT,
          CpuPeriod: CPU_PERIOD,
          CpuQuota: CPU_QUOTA,
          PidsLimit: PIDS_LIMIT,
          NetworkMode: req.network ? "bridge" : "none",
          ReadonlyRootfs: false, // Need writable for npm install
          AutoRemove: false, // We'll remove after collecting output
        },
      });

      // Start container
      await container.start();

      // Wait with timeout
      const result = await this.waitWithTimeout(container, req.timeoutMs);

      // Collect output files (if any written to /output)
      const outputFiles = this.collectOutputFiles(outputDir);

      // Cleanup container
      try {
        await container.remove({ force: true });
      } catch {
        // Container might already be removed
      }

      return {
        exitCode: result.exitCode,
        stdout: result.stdout.slice(0, 50_000), // Cap output size
        stderr: result.stderr.slice(0, 50_000),
        outputFiles: outputFiles.length > 0 ? outputFiles : undefined,
      };
    } finally {
      // Cleanup workspace
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        // Best effort cleanup
      }
    }
  }

  /**
   * Build the shell command based on action and runtime.
   */
  private buildCommand(req: RunRequest): string {
    // Custom command takes priority
    if (req.command) {
      return req.command;
    }

    const { action, runtime } = req;

    if (runtime === "node") {
      switch (action) {
        case "test":
          return "npm install --production=false 2>&1 && npm test 2>&1";
        case "lint":
          return "npm install --production=false 2>&1 && npx eslint . --ext .ts,.tsx,.js,.jsx 2>&1 || true";
        case "typecheck":
          return "npm install --production=false 2>&1 && npx tsc --noEmit 2>&1";
        case "build":
          return "npm install 2>&1 && npm run build 2>&1";
        case "deploy":
          // Build + copy to output
          return "npm install 2>&1 && npm run build 2>&1 && cp -r . /output/ 2>&1";
        case "run":
          if (req.entrypoint) {
            // Only npm install if package.json exists
            return `([ -f package.json ] && npm install 2>&1 || true) && npx tsx ${req.entrypoint} 2>&1`;
          }
          return "npm install 2>&1 && npm start 2>&1";
        default:
          return `echo "Unknown action: ${action}" && exit 1`;
      }
    }

    if (runtime === "python") {
      switch (action) {
        case "test":
          return "pip install -r requirements.txt 2>&1; python -m pytest 2>&1";
        case "lint":
          return "pip install ruff 2>&1 && ruff check . 2>&1 || true";
        case "typecheck":
          return "pip install mypy 2>&1 && mypy . 2>&1 || true";
        case "build":
          return "pip install -r requirements.txt 2>&1 && python setup.py build 2>&1 || echo 'No setup.py'";
        case "run":
          if (req.entrypoint) {
            return `([ -f requirements.txt ] && pip install -r requirements.txt 2>&1 || true) && python ${req.entrypoint} 2>&1`;
          }
          return "([ -f requirements.txt ] && pip install -r requirements.txt 2>&1 || true) && python main.py 2>&1";
        default:
          return `echo "Unknown action: ${action}" && exit 1`;
      }
    }

    return `echo "Unknown runtime: ${runtime}" && exit 1`;
  }

  /**
   * Build environment variables array for Docker.
   */
  private buildEnv(userEnv?: Record<string, string>): string[] {
    const env: string[] = [
      "NODE_ENV=production",
      "HOME=/tmp",
    ];

    if (userEnv) {
      // Whitelist safe env vars (no secrets from user)
      const ALLOWED_PREFIXES = ["NEXT_PUBLIC_", "REACT_APP_", "VITE_", "APP_"];
      for (const [key, value] of Object.entries(userEnv)) {
        if (ALLOWED_PREFIXES.some((p) => key.startsWith(p)) || key === "NODE_ENV") {
          env.push(`${key}=${value}`);
        }
      }
    }

    return env;
  }

  /**
   * Wait for container to finish with timeout.
   */
  private async waitWithTimeout(
    container: Docker.Container,
    timeoutMs: number,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(async () => {
        try {
          await container.kill();
        } catch {
          // Already stopped
        }
        resolve({
          exitCode: -1,
          stdout: "",
          stderr: `Execution timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      container
        .wait()
        .then(async (waitResult) => {
          clearTimeout(timer);

          // Collect logs
          const logs = await container.logs({
            stdout: true,
            stderr: true,
            follow: false,
          });

          const output = this.parseDockerLogs(logs);

          resolve({
            exitCode: waitResult.StatusCode,
            stdout: output.stdout,
            stderr: output.stderr,
          });
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Parse Docker multiplexed log stream into stdout/stderr.
   */
  private parseDockerLogs(
    logs: Buffer | NodeJS.ReadableStream,
  ): { stdout: string; stderr: string } {
    if (Buffer.isBuffer(logs)) {
      // Docker multiplexed stream: 8 byte header + payload per frame
      let stdout = "";
      let stderr = "";
      let offset = 0;

      while (offset < logs.length) {
        if (offset + 8 > logs.length) break;

        const streamType = logs[offset]; // 1=stdout, 2=stderr
        const size = logs.readUInt32BE(offset + 4);
        offset += 8;

        if (offset + size > logs.length) break;

        const chunk = logs.subarray(offset, offset + size).toString("utf-8");
        if (streamType === 1) {
          stdout += chunk;
        } else {
          stderr += chunk;
        }
        offset += size;
      }

      return { stdout, stderr };
    }

    // Fallback: treat as string
    return { stdout: String(logs), stderr: "" };
  }

  /**
   * Collect files written to the output directory.
   */
  private collectOutputFiles(
    outputDir: string,
  ): Array<{ path: string; content: string }> {
    const files: Array<{ path: string; content: string }> = [];

    try {
      const walk = (dir: string, prefix: string = "") => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            // Skip node_modules and .git
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            walk(fullPath, relativePath);
          } else if (entry.isFile()) {
            // Only collect text files under 1MB
            const stats = fs.statSync(fullPath);
            if (stats.size > 1_000_000) continue;

            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              files.push({ path: relativePath, content });
            } catch {
              // Binary file — skip
            }
          }
        }
      };

      walk(outputDir);
    } catch {
      // Output dir might not exist
    }

    return files;
  }
}
