import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type DailyProductResearchMode =
  'DISABLED' | 'DRY_RUN' | 'SHADOW' | 'PILOT' | 'GENERAL';

export type DailyProductResearchRuntimePolicy = {
  mode: DailyProductResearchMode;
  schedulerAllowed: boolean;
  realConnectorsAllowed: boolean;
  internalActionsAllowed: boolean;
  visibleToMembers: boolean;
  externalStoreMutation: false;
};

@Injectable()
export class DailyProductResearchRuntimePolicyService {
  constructor(private readonly config: ConfigService) {}

  policyFor(organizationId: string): DailyProductResearchRuntimePolicy {
    const mode = this.config.get<DailyProductResearchMode>(
      'DAILY_PRODUCT_RESEARCH_MODE',
      'DRY_RUN',
    );
    const pilotAllowed = this.csvSet(
      this.config.get<string>(
        'DAILY_PRODUCT_RESEARCH_PILOT_ORGANIZATION_IDS',
        '',
      ),
    ).has(organizationId);
    const generalAllowed = this.config.get<boolean>(
      'DAILY_PRODUCT_RESEARCH_GENERAL_ACCESS_ENABLED',
      false,
    );
    const scopeAllowed =
      mode === 'GENERAL' ? generalAllowed : mode !== 'PILOT' || pilotAllowed;
    const schedulerAllowed =
      scopeAllowed && ['SHADOW', 'PILOT', 'GENERAL'].includes(mode);
    return {
      mode,
      schedulerAllowed,
      realConnectorsAllowed:
        schedulerAllowed &&
        this.config.get<boolean>(
          'DAILY_PRODUCT_RESEARCH_REAL_CONNECTORS_ENABLED',
          false,
        ),
      internalActionsAllowed:
        scopeAllowed &&
        ['PILOT', 'GENERAL'].includes(mode) &&
        this.config.get<boolean>(
          'DAILY_PRODUCT_RESEARCH_INTERNAL_ACTIONS_ENABLED',
          false,
        ),
      visibleToMembers: scopeAllowed && ['PILOT', 'GENERAL'].includes(mode),
      externalStoreMutation: false,
    };
  }

  assertCanCreateRun(input: {
    organizationId: string;
    trigger: 'SCHEDULE' | 'MANUAL' | 'RETRY' | 'BACKFILL';
    manualCandidateCount: number;
  }) {
    const policy = this.policyFor(input.organizationId);
    if (policy.mode === 'DISABLED') {
      throw new ConflictException('Daily product research is disabled');
    }
    if (policy.mode === 'PILOT' && !policy.schedulerAllowed) {
      throw new ForbiddenException(
        'Organization is not in the daily research pilot allowlist',
      );
    }
    if (policy.mode === 'GENERAL' && !policy.schedulerAllowed) {
      throw new ForbiddenException(
        'General daily research access has not been explicitly enabled',
      );
    }
    if (policy.mode === 'DRY_RUN') {
      if (input.trigger !== 'MANUAL') {
        throw new ConflictException(
          'DRY_RUN only permits administrator-triggered manual runs',
        );
      }
      if (input.manualCandidateCount === 0) {
        throw new BadRequestException(
          'DRY_RUN requires schema-validated manual or CSV evidence candidates',
        );
      }
    }
    return policy;
  }

  assertCanEnableSchedule(organizationId: string) {
    const policy = this.policyFor(organizationId);
    if (!policy.schedulerAllowed) {
      throw new ConflictException(
        `Daily research scheduling is not available in ${policy.mode} mode for this organization`,
      );
    }
    return policy;
  }

  assertCanCreateInternalAction(organizationId: string) {
    const policy = this.policyFor(organizationId);
    if (!policy.internalActionsAllowed) {
      throw new ConflictException(
        'Internal development actions are disabled for the current rollout mode',
      );
    }
    return policy;
  }

  private csvSet(value: string) {
    return new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    );
  }
}
