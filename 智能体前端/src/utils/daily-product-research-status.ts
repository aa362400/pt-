export function candidateDecisionDisplayStatus(
  decision: string | undefined,
  hardGateReasons: readonly string[],
): string {
  if (decision === "REJECT") return "REJECT";
  if (hardGateReasons.includes("MANUAL_PRICING_REQUIRED")) {
    return "MANUAL_PRICING_REQUIRED";
  }
  return decision ?? "UNSCORED";
}
