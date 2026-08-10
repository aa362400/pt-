import { AssistantService } from '../src/features/assistant/assistant.service.js';

describe('AssistantService tenant context', () => {
  it('keeps session and message persistence inside the organization context', async () => {
    const session = {
      id: 'session-1',
      organizationId: 'org-1',
      workspaceId: null,
      userId: 'user-1',
      title: 'Ozon operations',
      contextType: 'GENERAL',
    };
    const prisma: any = {
      assistantSession: {
        create: jest.fn().mockResolvedValue(session),
        findFirst: jest.fn().mockResolvedValue(session),
      },
      assistantMessage: {
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'message-user', role: 'USER' })
          .mockResolvedValueOnce({ id: 'message-agent', role: 'ASSISTANT' }),
      },
    };
    const provider = { runAssistant: jest.fn().mockResolvedValue('result') };
    const tenantDatabase = {
      run: jest.fn((_organizationId, operation) => operation(prisma)),
    };
    const service = new (AssistantService as any)(
      prisma,
      provider,
      tenantDatabase,
    );
    const user = { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as any;

    await service.createSession(user, { title: 'Ozon operations' });
    await service.postMessage(user, 'session-1', { content: 'Check orders' });

    expect(tenantDatabase.run).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
    expect(prisma.assistantSession.create).toHaveBeenCalled();
    expect(prisma.assistantMessage.create).toHaveBeenCalledTimes(2);
  });
});
