import { KnowledgeBaseService } from '../src/features/knowledge-base/knowledge-base.service.js';

describe('KnowledgeBaseService tenant database context', () => {
  const user = {
    sub: 'user-1',
    email: 'user@example.com',
    orgId: 'org-1',
  };

  function createService() {
    const transaction = {
      knowledgeDocument: {
        create: jest.fn().mockResolvedValue({ id: 'doc-1' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'doc-1' }]),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue({
          id: 'doc-1',
          organizationId: 'org-1',
          visibility: 'ORGANIZATION',
          createdBy: 'user-1',
        }),
        update: jest.fn().mockResolvedValue({ id: 'doc-1', title: 'Updated' }),
        delete: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      },
    };
    const prisma = {};
    const tenantDatabase = {
      run: jest
        .fn()
        .mockImplementation(
          (
            _organizationId: string,
            operation: (tx: typeof transaction) => unknown,
          ) => operation(transaction),
        ),
    };
    const service = new KnowledgeBaseService(
      prisma as ConstructorParameters<typeof KnowledgeBaseService>[0],
      tenantDatabase as ConstructorParameters<typeof KnowledgeBaseService>[1],
    );
    return { service, transaction, tenantDatabase };
  }

  it('runs create and list operations inside the authenticated organization context', async () => {
    const { service, transaction, tenantDatabase } = createService();

    await service.create(user, {
      title: 'Ozon rules',
      content: 'Current seller rules',
    });
    await service.findAll(user, { page: 1, limit: 20 });

    expect(tenantDatabase.run).toHaveBeenNthCalledWith(
      1,
      'org-1',
      expect.any(Function),
    );
    expect(tenantDatabase.run).toHaveBeenNthCalledWith(
      2,
      'org-1',
      expect.any(Function),
    );
    expect(transaction.knowledgeDocument.create).toHaveBeenCalled();
    expect(transaction.knowledgeDocument.findMany).toHaveBeenCalled();
    expect(transaction.knowledgeDocument.count).toHaveBeenCalled();
  });

  it('keeps authorization lookup and mutation in one tenant transaction', async () => {
    const { service, transaction, tenantDatabase } = createService();

    await service.update(user, 'doc-1', { title: 'Updated' });
    await service.remove(user, 'doc-1');

    expect(tenantDatabase.run).toHaveBeenCalledTimes(2);
    expect(transaction.knowledgeDocument.findFirst).toHaveBeenCalledTimes(2);
    expect(transaction.knowledgeDocument.update).toHaveBeenCalled();
    expect(transaction.knowledgeDocument.delete).toHaveBeenCalled();
  });
});
