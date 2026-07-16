import { Injectable } from '@nestjs/common';
import {
  missingRiskEvidenceFinding,
  type RiskFindingInput,
} from './risk-analysis.service.js';

export interface RiskClearanceAttestation {
  provider: string;
  ruleset: string;
  evidenceRef: string;
  fetchedAt: string;
  passed: boolean;
}

@Injectable()
export class ComplianceScannerService {
  scan(input: {
    texts: Array<string | null | undefined>;
    forbiddenTerms: string[];
    suppliedFindings: RiskFindingInput[];
    clearanceAttestation?: RiskClearanceAttestation | null;
    authorizedClearanceProviders?: string[];
  }): RiskFindingInput[] {
    const searchable = input.texts
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();
    const profileFindings = input.forbiddenTerms
      .map((term) => term.trim())
      .filter(Boolean)
      .filter((term) => searchable.includes(term.toLowerCase()))
      .map<RiskFindingInput>((term) => ({
        riskType: 'STORE_FORBIDDEN_TERM',
        severity: 'BLOCKED',
        ruleVersion: 'workspace-profile/v1',
        matchedTerm: term,
        evidence:
          'A workspace forbidden term appears in structured candidate fields.',
      }));
    const clearanceFinding = this.clearanceFinding(
      input.clearanceAttestation,
      input.authorizedClearanceProviders ?? [],
    );
    return [
      ...input.suppliedFindings,
      ...profileFindings,
      clearanceFinding ?? missingRiskEvidenceFinding(),
    ];
  }

  private clearanceFinding(
    attestation: RiskClearanceAttestation | null | undefined,
    authorizedProviders: string[],
  ): RiskFindingInput | null {
    if (!attestation?.passed) return null;
    const provider = attestation.provider.trim();
    const ruleset = attestation.ruleset.trim();
    const evidenceRef = attestation.evidenceRef.trim();
    const fetchedAt = attestation.fetchedAt.trim();
    const providerIsAuthorized = authorizedProviders.some(
      (value) => value.trim().toLowerCase() === provider.toLowerCase(),
    );
    if (
      !provider ||
      !ruleset ||
      !evidenceRef ||
      !fetchedAt ||
      !providerIsAuthorized ||
      !Number.isFinite(Date.parse(fetchedAt))
    ) {
      return null;
    }
    return {
      riskType: 'RISK_CLEARANCE_ATTESTED',
      severity: 'LOW',
      ruleVersion: ruleset,
      evidence: `Risk clearance attested by ${provider}; evidenceRef=${evidenceRef}; fetchedAt=${fetchedAt}.`,
    };
  }
}
