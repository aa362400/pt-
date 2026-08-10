import { api } from "./client";

export type DependencyStatus = "up" | "degraded" | "down";

export interface DependencyCheck {
  status: DependencyStatus;
  error?: string;
  latencyMs?: number;
  details?: Record<string, number>;
}

export interface SystemReadinessSnapshot {
  status: "ready" | "not_ready";
  timestamp: string;
  checks: Record<"database" | "redis" | "queue" | "storage" | "agent", DependencyCheck>;
}

export const systemHealthApi = {
  getReadiness: () => api.get<SystemReadinessSnapshot>("/ready"),
};
