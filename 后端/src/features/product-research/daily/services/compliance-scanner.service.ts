import { Injectable, Optional } from '@nestjs/common';
import {
  missingRiskEvidenceFinding,
  type RiskFindingInput,
} from './risk-analysis.service.js';
import {
  type ListingRiskSubject,
  RiskClearanceVerifierService,
} from '../../../../shared/risk/risk-clearance-verifier.service.js';

@Injectable()
export class ComplianceScannerService {
  constructor(
    @Optional()
    private readonly riskClearance?: RiskClearanceVerifierService,
  ) {}

  scan(input: {
    texts: Array<string | null | undefined>;
    forbiddenTerms: string[];
    suppliedFindings: RiskFindingInput[];
    clearanceEvidence?: unknown;
    clearanceSubject?: ListingRiskSubject | null;
    at?: Date;
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
    const suppliedFindings = input.suppliedFindings.filter(
      (finding) => finding.riskType !== 'RISK_CLEARANCE_ATTESTED',
    );
    const injectedClearance = input.suppliedFindings.some(
      (finding) => finding.riskType === 'RISK_CLEARANCE_ATTESTED',
    )
      ? [
          {
            riskType: 'RISK_CLEARANCE_SOURCE_UNTRUSTED',
            severity: 'BLOCKED' as const,
            ruleVersion: 'risk-clearance-source-policy/v1',
            evidence:
              'A discovery connector attempted to inject a reserved risk-clearance finding.',
          },
        ]
      : [];
    const clearanceFinding = this.clearanceFinding(input);
    return [
      ...suppliedFindings,
      ...injectedClearance,
      ...profileFindings,
      clearanceFinding ?? missingRiskEvidenceFinding(),
    ];
  }

  private clearanceFinding(input: {
    clearanceEvidence?: unknown;
    clearanceSubject?: ListingRiskSubject | null;
    at?: Date;
  }): RiskFindingInput | null {
    if (
      !this.riskClearance ||
      !input.clearanceEvidence ||
      !input.clearanceSubject
    )
      return null;
    const expectedSubjectHash = this.riskClearance.subjectHash(
      input.clearanceSubject,
    );
    const verified = this.riskClearance.verify({
      evidence: input.clearanceEvidence,
      expectedSubjectHash,
      at: input.at ?? new Date(),
    });
    if (!verified.valid) return null;
    const { attestation } = verified.proof;
    return {
      riskType: 'RISK_CLEARANCE_ATTESTED',
      severity: 'LOW',
      ruleVersion: attestation.ruleset,
      evidence: `Risk clearance verified for ${attestation.provider}; evidenceRef=${attestation.evidenceRef}; fetchedAt=${attestation.fetchedAt}; expiresAt=${attestation.expiresAt}.`,
      evidencePayload: verified.proof as unknown as Record<string, unknown>,
    };
  }
}
