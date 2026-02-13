/**
 * Device Swarm Coordinator
 *
 * Manages a fleet of devices (PCs, Android phones) as a distributed compute swarm.
 * Architecture:
 * - Master (this PC) → WebSocket server
 * - Captains (powerful devices) → relay + local coordination
 * - Workers (Android phones) → execute tasks
 *
 * Communication: WebSocket mesh with hierarchical + peer-to-peer
 */

// ============================================================================
// TYPES
// ============================================================================

export type DeviceRole = "master" | "captain" | "worker";
export type DeviceStatus = "online" | "offline" | "busy" | "error" | "charging";

export interface DeviceInfo {
  id: string;
  name: string;
  role: DeviceRole;
  status: DeviceStatus;
  capabilities: DeviceCapabilities;
  lastHeartbeat: number;
  parentId?: string; // Captain's ID for workers
  currentTask?: string;
  ipAddress?: string;
  batteryLevel?: number;
}

export interface DeviceCapabilities {
  cpuCores: number;
  ramMB: number;
  storageMB: number;
  hasGPU: boolean;
  osVersion: string;
  platform: "android" | "windows" | "linux" | "macos";
  networkSpeed?: "slow" | "medium" | "fast";
}

export interface SwarmTask {
  id: string;
  type: "scrape" | "process" | "cache" | "compute" | "monitor" | "relay";
  payload: Record<string, unknown>;
  assignedTo?: string;
  status: "queued" | "assigned" | "running" | "completed" | "failed";
  priority: number;
  requiresCapabilities?: Partial<DeviceCapabilities>;
  result?: unknown;
  createdAt: number;
  completedAt?: number;
}

// ============================================================================
// DEVICE REGISTRY
// ============================================================================

class DeviceRegistry {
  private devices = new Map<string, DeviceInfo>();
  private tasks = new Map<string, SwarmTask>();
  private taskQueue: SwarmTask[] = [];

  /**
   * Register a new device in the swarm
   */
  register(device: DeviceInfo): void {
    this.devices.set(device.id, {
      ...device,
      lastHeartbeat: Date.now(),
    });
    console.info(`[Swarm] Device registered: ${device.name} (${device.role})`);
  }

  /**
   * Update device heartbeat
   */
  heartbeat(deviceId: string, updates?: Partial<DeviceInfo>): void {
    const device = this.devices.get(deviceId);
    if (device) {
      Object.assign(device, updates, { lastHeartbeat: Date.now() });
    }
  }

  /**
   * Remove offline devices (no heartbeat for 2 min)
   */
  pruneOffline(): string[] {
    const cutoff = Date.now() - 2 * 60_000;
    const removed: string[] = [];

    for (const [id, device] of this.devices) {
      if (device.lastHeartbeat < cutoff && device.role !== "master") {
        device.status = "offline";
        removed.push(id);
      }
    }

    return removed;
  }

  /**
   * Get all online devices
   */
  getOnlineDevices(): DeviceInfo[] {
    return Array.from(this.devices.values()).filter(
      (d) => d.status !== "offline",
    );
  }

  /**
   * Get devices by role
   */
  getByRole(role: DeviceRole): DeviceInfo[] {
    return this.getOnlineDevices().filter((d) => d.role === role);
  }

  /**
   * Find best device for a task based on capabilities
   */
  findBestDevice(task: SwarmTask): DeviceInfo | null {
    const available = this.getOnlineDevices().filter(
      (d) => d.status === "online" && !d.currentTask,
    );

    if (available.length === 0) return null;

    // Score devices by capability match
    const scored = available.map((device) => {
      let score = 0;

      // Prefer devices with more resources
      score += device.capabilities.cpuCores * 2;
      score += device.capabilities.ramMB / 512;

      // Prefer captains for heavier tasks
      if (device.role === "captain") score += 5;

      // Battery consideration for mobile
      if (device.batteryLevel !== undefined) {
        if (device.batteryLevel > 50) score += 2;
        if (device.batteryLevel < 20) score -= 10; // Don't drain low battery
      }

      // Task-specific requirements
      if (task.requiresCapabilities) {
        const req = task.requiresCapabilities;
        if (req.hasGPU && !device.capabilities.hasGPU) score -= 100;
        if (req.ramMB && device.capabilities.ramMB < req.ramMB) score -= 50;
      }

      return { device, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].device : null;
  }

  // ==============================
  // TASK MANAGEMENT
  // ==============================

  /**
   * Submit a task to the swarm
   */
  submitTask(task: Omit<SwarmTask, "id" | "status" | "createdAt">): string {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const fullTask: SwarmTask = {
      ...task,
      id,
      status: "queued",
      createdAt: Date.now(),
    };

    this.tasks.set(id, fullTask);
    this.taskQueue.push(fullTask);
    this.taskQueue.sort((a, b) => b.priority - a.priority);

    return id;
  }

  /**
   * Assign queued tasks to available devices
   */
  assignTasks(): Array<{ taskId: string; deviceId: string }> {
    const assignments: Array<{ taskId: string; deviceId: string }> = [];

    const pendingTasks = this.taskQueue.filter((t) => t.status === "queued");

    for (const task of pendingTasks) {
      const device = this.findBestDevice(task);
      if (!device) continue;

      task.status = "assigned";
      task.assignedTo = device.id;
      device.currentTask = task.id;
      device.status = "busy";

      assignments.push({ taskId: task.id, deviceId: device.id });
    }

    // Remove assigned tasks from queue
    this.taskQueue = this.taskQueue.filter((t) => t.status === "queued");

    return assignments;
  }

  /**
   * Report task completion
   */
  completeTask(taskId: string, result: unknown, success: boolean): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = success ? "completed" : "failed";
    task.result = result;
    task.completedAt = Date.now();

    // Free up the device
    if (task.assignedTo) {
      const device = this.devices.get(task.assignedTo);
      if (device) {
        device.currentTask = undefined;
        device.status = "online";
      }
    }
  }

  /**
   * Get swarm status summary
   */
  getStatus(): {
    totalDevices: number;
    online: number;
    busy: number;
    pendingTasks: number;
    activeTasks: number;
    completedTasks: number;
    totalCPUCores: number;
    totalRAMMB: number;
  } {
    const devices = Array.from(this.devices.values());
    const online = devices.filter((d) => d.status !== "offline");
    const tasks = Array.from(this.tasks.values());

    return {
      totalDevices: devices.length,
      online: online.length,
      busy: online.filter((d) => d.status === "busy").length,
      pendingTasks: this.taskQueue.length,
      activeTasks: tasks.filter(
        (t) => t.status === "running" || t.status === "assigned",
      ).length,
      completedTasks: tasks.filter((t) => t.status === "completed").length,
      totalCPUCores: online.reduce((s, d) => s + d.capabilities.cpuCores, 0),
      totalRAMMB: online.reduce((s, d) => s + d.capabilities.ramMB, 0),
    };
  }
}

// Singleton instance
export const deviceRegistry = new DeviceRegistry();

// Register this machine as master
deviceRegistry.register({
  id: "master_pc",
  name: "Master PC",
  role: "master",
  status: "online",
  capabilities: {
    cpuCores: 8,
    ramMB: 16384,
    storageMB: 512000,
    hasGPU: true,
    osVersion: "Windows 10",
    platform: "windows",
    networkSpeed: "fast",
  },
  lastHeartbeat: Date.now(),
});
