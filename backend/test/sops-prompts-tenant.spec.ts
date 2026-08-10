import { SopsService } from '../src/features/sops/sops.service.js';
import { PromptsService } from '../src/features/prompts/prompts.service.js';

const user = { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as any;

function createHarness() {
  const sop = {
    id: 'sop-1',
    organizationId: 'org-1',
    title: 'Fulfillment SOP',
    status: 'DRAFT',
  };
  const prompt = {
    id: 'prompt-1',
    organizationId: 'org-1',
    title: 'Listing prompt',
    category: 'listing',
    content: 'Generate a truthful listing',
    variables: [],
    usageCount: 0,
  };
  const prisma: any = {
    sop: {
      create: jest.fn().mockResolvedValue(sop),
      findMany: jest.fn().mockResolvedValue([sop]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(sop),
      update: jest.fn().mockResolvedValue(sop),
      delete: jest.fn().mockResolvedValue(sop),
    },
    promptTemplate: {
      create: jest.fn().mockResolvedValue(prompt),
      findMany: jest.fn().mockResolvedValue([prompt]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(prompt),
      update: jest.fn().mockResolvedValue({ ...prompt, usageCount: 1 }),
      delete: jest.fn().mockResolvedValue(prompt),
    },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const tenantDatabase = {
    run: jest.fn((_organizationId, operation) => operation(prisma)),
  };
  return { prisma, audit, tenantDatabase };
}

describe('SOP and prompt tenant persistence', () => {
  it('runs SOP create and list queries inside the organization context', async () => {
    const { prisma, audit, tenantDatabase } = createHarness();
    const service = new (SopsService as any)(prisma, audit, tenantDatabase);

    await service.create(user, { title: 'Fulfillment SOP', steps: [] });
    await service.findAll(user, {});

    expect(tenantDatabase.run).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
    expect(prisma.sop.create).toHaveBeenCalled();
    expect(prisma.sop.findMany).toHaveBeenCalled();
  });

  it('runs prompt creation and usage updates inside the organization context', async () => {
    const { prisma, audit, tenantDatabase } = createHarness();
    const service = new (PromptsService as any)(prisma, audit, tenantDatabase);

    await service.create(user, {
      title: 'Listing prompt',
      category: 'listing',
      content: 'Generate a truthful listing',
    });
    await service.use(user, 'prompt-1');

    expect(tenantDatabase.run).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
    expect(prisma.promptTemplate.create).toHaveBeenCalled();
    expect(prisma.promptTemplate.update).toHaveBeenCalled();
  });
});
