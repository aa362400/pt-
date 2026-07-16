import { BadRequestException } from '@nestjs/common';
import { EnterpriseTeamService } from '../src/features/enterprise-team/enterprise-team.service.js';

function capability(
  id: string,
  state: 'passed' | 'partial' | 'missing' = 'passed',
) {
  return {
    id,
    overallState: state,
    blockers: state === 'missing' ? [`${id} unavailable`] : [],
  };
}

function createService() {
  const agentRuns = {
    create: jest.fn().mockResolvedValue({
      id: 'run-1',
      agentType: 'PLANNER',
      status: 'PENDING',
    }),
  };
  const capabilities = {
    list: jest.fn().mockResolvedValue({
      generatedAt: '2026-07-13T00:00:00.000Z',
      operationSafety: {
        connectedStoreChannels: 1,
        externalWriteAdapterConnected: true,
        highRiskActionMode: 'human_confirmation_required',
        approvalNotificationKind: 'high_risk_action_review',
        actions: [],
      },
      items: [
        capability('product-research'),
        capability('trend-radar'),
        capability('competition'),
        capability('profit'),
        capability('listing'),
        capability('image'),
        capability('keywords'),
        capability('analytics'),
        capability('marketing', 'missing'),
        capability('customer-service', 'missing'),
        capability('supply-chain', 'partial'),
      ],
    }),
  };
  return {
    service: new EnterpriseTeamService(agentRuns as any, capabilities as any),
    agentRuns,
  };
}

describe('EnterpriseTeamService', () => {
  const user = {
    sub: 'user-1',
    orgId: 'org-1',
    email: 'owner@example.com',
    role: 'OWNER',
  } as any;

  it('launches a real PLANNER run with hard external-write guardrails', async () => {
    const { service, agentRuns } = createService();
    const result = await service.launch(user, {
      goal: '优化 Ozon 店铺商品并创建本地草稿',
      specialistIds: ['product', 'listing'],
    });

    expect(result.run.id).toBe('run-1');
    expect(agentRuns.create).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        agentType: 'PLANNER',
        input: expect.objectContaining({
          orchestrationMode: 'enterprise_ceo',
          guardrails: expect.objectContaining({
            externalWritesRequireHumanConfirmation: true,
            unavailableConnectorsMustBlock: true,
          }),
        }),
      }),
    );
  });

  it('rejects a specialist whose real connector is missing', async () => {
    const { service, agentRuns } = createService();
    await expect(
      service.launch(user, {
        goal: '自动运行广告并优化预算',
        specialistIds: ['ads'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(agentRuns.create).not.toHaveBeenCalled();
  });

  it('allows Supply Agent after the local supply-chain data domain is connected', async () => {
    const { service, agentRuns } = createService();
    await service.launch(user, {
      goal: '分析库存并生成本地补货建议，不创建采购订单',
      specialistIds: ['supply'],
    });
    expect(agentRuns.create).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        input: expect.objectContaining({
          specialists: [expect.objectContaining({ id: 'supply' })],
        }),
      }),
    );
  });
});
