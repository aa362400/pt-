import { api } from "./client";

export type DeadLetterClassification =
  | "UNCLASSIFIED"
  | "RETRYABLE"
  | "PERMANENT"
  | "DATA_MISSING"
  | "PROVIDER_FAILURE";

export type DeadLetterResolutionStatus =
  "OPEN" | "REPLAYING" | "REPLAYED" | "RESOLVED";

export interface DeadLetterJob {
  id: string;
  queueName: string;
  jobId: string;
  data: Record<string, unknown>;
  failedReason: string | null;
  failedAttempts: number;
  failedAt: string;
  classification: DeadLetterClassification;
  classificationReason: string | null;
  replayEligible: boolean;
  classifiedAt: string | null;
  resolutionStatus: DeadLetterResolutionStatus;
  replayClaimedAt: string | null;
  replayClaimedBy: string | null;
  replayReason: string | null;
  replayIdempotencyKey: string | null;
  replayRunId: string | null;
  resolvedAt: string | null;
  notes: string | null;
}

export interface DeadLetterListResponse {
  items: DeadLetterJob[];
  total: number;
  page: number;
  limit: number;
}

export interface DeadLetterTriageResponse {
  scanned: number;
  summary: Record<DeadLetterClassification, number>;
  staleClaimsReleased: number;
}

export const deadLettersApi = {
  listOpen: (limit = 50) =>
    api.get<DeadLetterListResponse>("/admin/dead-letters", {
      params: { resolutionStatus: "OPEN", page: 1, limit },
    }),
  triage: () =>
    api.post<DeadLetterTriageResponse>("/admin/dead-letters/triage"),
  replay: (id: string, input: { reason: string; idempotencyKey: string }) =>
    api.post<{
      replayed: true;
      id: string;
      replayRunId: string;
      queueName: string;
    }>(`/admin/dead-letters/${id}/replay`, input),
  resolve: (id: string, note: string) =>
    api.post<DeadLetterJob>(`/admin/dead-letters/${id}/resolve`, { note }),
  classify: (
    id: string,
    classification: DeadLetterClassification,
    replayEligible: boolean,
    reason: string,
  ) =>
    api.patch<DeadLetterJob>(`/admin/dead-letters/${id}/classification`, {
      classification,
      replayEligible,
      reason,
    }),
};
