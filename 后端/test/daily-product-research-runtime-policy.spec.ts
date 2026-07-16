import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DailyProductResearchRuntimePolicyService } from '../src/features/product-research/daily/services/daily-product-research-runtime-policy.service.js';

describe('DailyProductResearchRuntimePolicyService', () => {
  const policy = (values: Record<string, unknown>) =>
    new DailyProductResearchRuntimePolicyService(new ConfigService(values));

  it('defaults to a fail-closed DRY_RUN requiring manual evidence', () => {
    const service = policy({});
    expect(service.policyFor('org-1')).toMatchObject({
      mode: 'DRY_RUN',
      schedulerAllowed: false,
      realConnectorsAllowed: false,
      internalActionsAllowed: false,
      externalStoreMutation: false,
    });
    expect(() =>
      service.assertCanCreateRun({
        organizationId: 'org-1',
        trigger: 'MANUAL',
        manualCandidateCount: 0,
      }),
    ).toThrow(BadRequestException);
    expect(() => service.assertCanEnableSchedule('org-1')).toThrow(
      ConflictException,
    );
  });

  it('does not create runs in DISABLED mode', () => {
    const service = policy({ DAILY_PRODUCT_RESEARCH_MODE: 'DISABLED' });
    expect(() =>
      service.assertCanCreateRun({
        organizationId: 'org-1',
        trigger: 'MANUAL',
        manualCandidateCount: 1,
      }),
    ).toThrow(ConflictException);
  });

  it('enforces the stable organization id pilot allowlist', () => {
    const service = policy({
      DAILY_PRODUCT_RESEARCH_MODE: 'PILOT',
      DAILY_PRODUCT_RESEARCH_PILOT_ORGANIZATION_IDS: 'org-allowed',
      DAILY_PRODUCT_RESEARCH_REAL_CONNECTORS_ENABLED: true,
      DAILY_PRODUCT_RESEARCH_INTERNAL_ACTIONS_ENABLED: true,
    });
    expect(() =>
      service.assertCanCreateRun({
        organizationId: 'org-denied',
        trigger: 'SCHEDULE',
        manualCandidateCount: 0,
      }),
    ).toThrow(ForbiddenException);
    expect(service.policyFor('org-allowed')).toMatchObject({
      mode: 'PILOT',
      schedulerAllowed: true,
      realConnectorsAllowed: true,
      internalActionsAllowed: true,
      visibleToMembers: true,
    });
  });

  it('keeps GENERAL blocked without a second explicit enable flag', () => {
    const service = policy({ DAILY_PRODUCT_RESEARCH_MODE: 'GENERAL' });
    expect(() =>
      service.assertCanCreateRun({
        organizationId: 'org-1',
        trigger: 'SCHEDULE',
        manualCandidateCount: 0,
      }),
    ).toThrow(ForbiddenException);
  });

  it('allows scheduled real research for every organization only after GENERAL is explicitly enabled', () => {
    const service = policy({
      DAILY_PRODUCT_RESEARCH_MODE: 'GENERAL',
      DAILY_PRODUCT_RESEARCH_GENERAL_ACCESS_ENABLED: true,
      DAILY_PRODUCT_RESEARCH_REAL_CONNECTORS_ENABLED: true,
      DAILY_PRODUCT_RESEARCH_INTERNAL_ACTIONS_ENABLED: true,
    });

    expect(
      service.assertCanCreateRun({
        organizationId: 'org-any-connected-store',
        trigger: 'SCHEDULE',
        manualCandidateCount: 0,
      }),
    ).toMatchObject({
      mode: 'GENERAL',
      schedulerAllowed: true,
      realConnectorsAllowed: true,
      internalActionsAllowed: true,
      externalStoreMutation: false,
    });
  });
});
