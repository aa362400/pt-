import { Injectable } from '@nestjs/common';

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';

export interface RiskFindingInput {
  riskType: string;
  severity: RiskSeverity;
  ruleVersion: string;
  matchedTerm?: string | null;
  evidence: string;
}

export const RISK_EVIDENCE_MISSING = 'RISK_EVIDENCE_MISSING';

export function missingRiskEvidenceFinding(): RiskFindingInput {
  return {
    riskType: RISK_EVIDENCE_MISSING,
    severity: 'BLOCKED',
    ruleVersion: 'risk-evidence-policy/v1',
    evidence:
      'No authorized, auditable risk-clearance attestation was available for this candidate.',
  };
}

const SEVERITY_ORDER: Record<RiskSeverity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  BLOCKED: 3,
};

@Injectable()
export class RiskAnalysisService {
  evaluate(findings: RiskFindingInput[]) {
    const effectiveFindings =
      findings.length > 0 ? findings : [missingRiskEvidenceFinding()];
    const overallSeverity = effectiveFindings.reduce<RiskSeverity>(
      (highest, finding) =>
        SEVERITY_ORDER[finding.severity] > SEVERITY_ORDER[highest]
          ? finding.severity
          : highest,
      'LOW',
    );
    const hardGateReasons = effectiveFindings
      .filter(
        (finding) =>
          finding.severity === 'HIGH' || finding.severity === 'BLOCKED',
      )
      .map((finding) =>
        finding.riskType === RISK_EVIDENCE_MISSING
          ? RISK_EVIDENCE_MISSING
          : `RISK_${finding.severity}:${finding.riskType}`,
      );

    return {
      overallSeverity,
      requiresHumanReview: overallSeverity !== 'LOW',
      hardGateReasons,
      findings: effectiveFindings,
    };
  }
}
