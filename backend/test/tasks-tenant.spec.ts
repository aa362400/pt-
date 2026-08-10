import { TasksService } from '../src/features/tasks/tasks.service.js';

describe('TasksService tenant context', () => {
  it('runs task creation and listing inside the organization context', async () => {
    const task = {
      id: 'task-1',
      organizationId: 'org-1',
      title: 'Review listing',
      priority: 'HIGH',
    };
    const prisma: any = {
      teamTask: {
        create: jest.fn().mockResolvedValue(task),
        findMany: jest.fn().mockResolvedValue([task]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const tenantDatabase = {
      run: jest.fn((_organizationId, operation) => operation(prisma)),
    };
    const service = new (TasksService as any)(prisma, audit, tenantDatabase);
    const user = { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as any;

    await service.create(user, { title: 'Review listing', priority: 'HIGH' });
    await service.findAll(user, {});

    expect(tenantDatabase.run).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
    expect(prisma.teamTask.create).toHaveBeenCalled();
    expect(prisma.teamTask.findMany).toHaveBeenCalled();
  });
});
