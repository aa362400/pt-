export type ResearchRunSelectionMode = "AUTO" | "MANUAL";

type ResearchRunListItem = { id: string };

const terminalResearchRunStatuses = new Set([
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
  "STOPPED",
]);

export function reconcileResearchRunSelection(
  runs: readonly ResearchRunListItem[],
  currentRunId: string | null,
  mode: ResearchRunSelectionMode,
): { runId: string | null; mode: ResearchRunSelectionMode } {
  if (runs.length === 0) return { runId: null, mode: "AUTO" };

  if (
    mode === "MANUAL" &&
    currentRunId !== null &&
    runs.some((run) => run.id === currentRunId)
  ) {
    return { runId: currentRunId, mode: "MANUAL" };
  }

  return { runId: runs[0].id, mode: "AUTO" };
}

export function researchRunRefreshInterval(status: string | null): number {
  return status !== null && !terminalResearchRunStatuses.has(status)
    ? 5_000
    : 30_000;
}

export function shouldApplyRunDataResponse(input: {
  requestId: number;
  latestRequestId: number;
  runId: string;
  selectedRunId: string | null;
}): boolean {
  return (
    input.requestId === input.latestRequestId &&
    input.runId === input.selectedRunId
  );
}
