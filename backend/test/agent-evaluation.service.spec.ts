import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AgentEvaluationService } from '../src/features/agent-evaluation/agent-evaluation.service.js';

const user = {
  sub: 'admin-1',
  email: 'admin@example.com',
  role: 'ADMIN',
  orgId: 'org-1',
} as any;

function createHarness() {
  let feedback: Record<string, unknown> | null = null;
  let prompt = {
    id: 'prompt-version-1',
    organizationId: 'org-1',
    agentType: 'PRODUCT_RESEARCHER',
    version: 'v1',
    status: 'DRAFT',
    routingWeight: 0,
    metadata: {},
    activatedAt: null,
  };
  const tx: any = {
    agentRun: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'run-1',
        agentType: 'PRODUCT_RESEARCHER',
      }),
    },
    actionProposal: {
      findFirst: jest.fn().mockResolvedValue({ id: 'approval-1' }),
    },
    listingDraft: {
      findFirst: jest.fn().mockResolvedValue({ id: 'listing-1' }),
    },
    listingPublishSnapshot: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'snapshot-1',
        listingDraftId: 'listing-1',
        productLaunch: { agentRunId: 'run-1' },
      }),
    },
    feedbackSignal: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(feedback)),
      create: jest.fn().mockImplementation(({ data }) => {
        feedback = { id: 'feedback-1', ...data };
        return Promise.resolve(feedback);
      }),
    },
    promptVersion: {
      findFirst: jest.fn().mockImplementation(() => Promise.resolve(prompt)),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockImplementation(({ data }) => {
        prompt = { ...prompt, ...data };
        return Promise.resolve(prompt);
      }),
    },
  };
  const tenantDatabase = {
    run: jest.fn((_organizationId, operation) => operation(tx)),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new AgentEvaluationService(tenantDatabase as any, audit as any),
    tx,
    audit,
  };
}

describe('AgentEvaluationService', () => {
  it('rejects formal feedback without a stable attribution id', async () => {
    const { service } = createHarness();
    await expect(
      service.createFeedback(user, {
        signalType: 'USER_CORRECTION',
        source: 'APPROVAL_UI',
        externalReference: 'edit-1',
        value: { field: 'title' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes the idempotency key and reuses duplicate feedback', async () => {
    const { service, tx, audit } = createHarness();
    const input = {
      signalType: ' user_correction ',
      source: ' approval_ui ',
      externalReference: ' correction-1 ',
      value: { field: 'title', reason: 'titletextproductevidenceenglish_text' },
      runId: 'run-1',
      listingId: 'listing-1',
      snapshotId: 'snapshot-1',
    };

    const first = await service.createFeedback(user, input);
    const second = await service.createFeedback(user, input);

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(tx.feedbackSignal.create).toHaveBeenCalledTimes(1);
    expect(tx.feedbackSignal.findUnique).toHaveBeenLastCalledWith({
      where: {
        organizationId_source_externalReference_signalType: {
          organizationId: 'org-1',
          source: 'APPROVAL_UI',
          externalReference: 'correction-1',
          signalType: 'USER_CORRECTION',
        },
      },
    });
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('rejects an attribution id that is not present in the tenant', async () => {
    const { service, tx } = createHarness();
    tx.listingDraft.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.createFeedback(user, {
        signalType: 'USER_CORRECTION',
        source: 'APPROVAL_UI',
        externalReference: 'correction-2',
        value: { field: 'title' },
        listingId: 'foreign-listing',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires prompt versions to pass through challenger before champion', async () => {
    const { service } = createHarness();

    await expect(
      service.updatePromptStatus(user, 'prompt-version-1', {
        status: 'CHAMPION',
        reason: 'english_textyesenglish_text',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const challenger = await service.updatePromptStatus(
      user,
      'prompt-version-1',
      {
        status: 'CHALLENGER',
        routingWeight: 0.05,
        reason: 'english_textrealenglish_text',
      },
    );
    expect(challenger.status).toBe('CHALLENGER');
    expect(challenger.routingWeight).toBe(0.05);

    const champion = await service.updatePromptStatus(
      user,
      'prompt-version-1',
      {
        status: 'CHAMPION',
        reason: 'english_textevidencetexthumantextpassed',
      },
    );
    expect(champion.status).toBe('CHAMPION');
    expect(champion.routingWeight).toBe(1);
  });
});
